import {
  ApiResponse,
  Product,
  ProductBooking,
  ProductReview,
  Cart,
  Order,
  TrackedOrderDetails,
  User,
  Address,
  SupportSession,
  SupportSelectedProduct,
  AdminAnalyticsData,
  ProductViewSource
} from '../types'
import { setSupportContactEmail } from '../utils/receiptPdf'

// API base URL
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

function getSupportTokenKey(sessionId: string): string {
  return `dfe_support_token_${sessionId}`
}

function getFriendlyHttpError(status: number): string {
  switch (status) {
    case 400:
      return 'Please check your entered information and try again.'
    case 401:
      return 'Please sign in to continue.'
    case 403:
      return 'You do not have permission to perform this action.'
    case 404:
      return 'The requested item could not be found.'
    case 409:
      return 'This action conflicts with an existing record.'
    case 429:
      return 'Too many requests right now. Please wait a moment and try again.'
    default:
      return status >= 500
        ? 'Our service encountered a temporary issue. Please try again shortly.'
        : 'Unable to complete your request. Please try again.'
  }
}

// Generic API request function
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {})
  }

  // Do not set Content-Type for FormData so browser sets multipart boundary automatically
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  // Add auth token if available
  const token = localStorage.getItem('token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config: RequestInit = {
    credentials: 'include',
    ...options,
    headers
  }

  try {
    const response = await fetch(url, config)
    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    if (!response.ok) {
      let errorMessage = getFriendlyHttpError(response.status)
      let requiresVerification = false

      if (isJson) {
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.message || errorMessage
          if (errorData.requiresVerification) {
            requiresVerification = true
          }
        } catch {
          // Use friendly fallback message
        }
      }

      const err = new Error(errorMessage) as Error & {
        status?: number
        requiresVerification?: boolean
      }
      err.status = response.status
      err.requiresVerification = requiresVerification
      throw err
    }

    if (!isJson) {
      throw new Error('Received an unexpected response format. Please refresh and try again.')
    }

    return await response.json()
  } catch (error) {
    throw error
  }
}

// Product API functions
export const productApi = {
  // Get all products with optional filters
  getProducts: async (params?: {
    page?: number
    limit?: number
    category?: string
    search?: string
  }): Promise<ApiResponse<Product[]>> => {
    const searchParams = new URLSearchParams()

    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    if (params?.category) searchParams.append('category', params.category)
    if (params?.search) searchParams.append('search', params.search)

    const queryString = searchParams.toString()
    return apiRequest(`/products${queryString ? `?${queryString}` : ''}`)
  },

  // Get single product
  getProduct: async (id: string): Promise<ApiResponse<Product>> => {
    return apiRequest(`/products/${id}`)
  },

  // Create product (admin only)
  createProduct: async (productData: Partial<Product>): Promise<ApiResponse<Product>> => {
    return apiRequest('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    })
  },

  // Update product (admin only)
  updateProduct: async (id: string, productData: Partial<Product>): Promise<ApiResponse<Product>> => {
    return apiRequest(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    })
  },

  // Delete product (admin only)
  deleteProduct: async (id: string): Promise<ApiResponse<void>> => {
    return apiRequest(`/products/${id}`, {
      method: 'DELETE',
    })
  },

  // Get all product reviews grouped by productId
  getAllReviews: async (): Promise<ApiResponse<ProductReview[]> & { grouped?: Record<string, ProductReview[]> }> => {
    return apiRequest('/products/reviews/all')
  },

  // Get reviews for a single product
  getProductReviews: async (productId: string): Promise<ApiResponse<ProductReview[]>> => {
    return apiRequest(`/products/${encodeURIComponent(productId)}/reviews`)
  },

  // Submit a customer review for a product (with optional uploaded images)
  createProductReview: async (
    productId: string,
    payload: {
      reviewerName: string
      reviewerEmail?: string
      rating: number
      title?: string
      comment: string
      images?: string[]
    }
  ): Promise<ApiResponse<ProductReview>> => {
    return apiRequest(`/products/${encodeURIComponent(productId)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // Upload customer review photo(s)
  uploadReviewImages: async (
    files: File[]
  ): Promise<ApiResponse<{ url: string; urls: string[]; count: number }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    return apiRequest('/products/reviews/upload', {
      method: 'POST',
      body: formData,
    })
  },

  // Reserve / book a Coming Soon vehicle for launch & dispatch priority
  bookComingSoonVehicle: async (
    productId: string,
    payload: {
      fullName: string
      email: string
      phone?: string
      country: string
      quantity?: number
      notes?: string
    }
  ): Promise<ApiResponse<ProductBooking & { productName?: string }>> => {
    return apiRequest(`/products/${encodeURIComponent(productId)}/book`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}

// Cart API functions
export const cartApi = {
  // Get user's cart
  getCart: async (): Promise<ApiResponse<Cart>> => {
    return apiRequest('/cart')
  },

  // Add item to cart
  addToCart: async (productId: string, quantity: number): Promise<ApiResponse<Cart>> => {
    return apiRequest('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    })
  },

  // Update cart item quantity
  updateCartItem: async (itemId: string, quantity: number): Promise<ApiResponse<Cart>> => {
    return apiRequest(`/cart/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    })
  },

  // Remove item from cart
  removeFromCart: async (itemId: string): Promise<ApiResponse<Cart>> => {
    return apiRequest(`/cart/items/${itemId}`, {
      method: 'DELETE',
    })
  },

  // Clear cart
  clearCart: async (visitorId?: string): Promise<ApiResponse<Cart>> => {
    return apiRequest('/cart', {
      method: 'DELETE',
      body: visitorId ? JSON.stringify({ visitorId }) : undefined,
    })
  },

  // Sync guest or authenticated unpaid-cart snapshot for progressive reminders (1h, 6h, 12h, 24h, 48h, 72h)
  syncReminderSnapshot: async (payload: {
    email?: string
    customerName?: string
    visitorId?: string
    items?: Array<{ productId: string; quantity: number }>
  }): Promise<ApiResponse<{ id?: string; itemCount?: number; subtotal?: number }>> => {
    return apiRequest('/cart/reminder-snapshot', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  clearReminderSnapshot: async (payload: {
    email?: string
    visitorId?: string
  }): Promise<ApiResponse<unknown>> => {
    return apiRequest('/cart/reminder-snapshot', {
      method: 'DELETE',
      body: JSON.stringify(payload),
    })
  },
}

// Order API functions
export const orderApi = {
  // Get user's orders
  getOrders: async (): Promise<ApiResponse<Order[]>> => {
    return apiRequest('/orders')
  },

  // Get single order
  getOrder: async (id: string): Promise<ApiResponse<Order>> => {
    return apiRequest(`/orders/${id}`)
  },

  // Create order
  createOrder: async (orderData: {
    items?: Array<{ productId: string; quantity: number }>
    shippingAddressId?: string | null
    billingAddressId?: string | null
    shippingAddress?: {
      email?: string
      firstName?: string
      lastName?: string
      phone?: string
      company?: string
      address1?: string
      address2?: string
      city?: string
      state?: string
      zipCode?: string
      postalCode?: string
      country?: string
      countryCode?: string
    }
    customer?: {
      email?: string
      firstName?: string
      lastName?: string
      phone?: string
    }
    paymentMethod: 'STRIPE' | 'PAYPAL'
    paymentId?: string
    paymentStatus?: string
    paypalOrderId?: string
    createAccount?: boolean
    password?: string
    notes?: string
  }): Promise<
    ApiResponse<Order & { receiptToken?: string }> & {
      token?: string | null
      user?: User
    }
  > => {
    return apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    })
  },

  // Update order status (admin only)
  updateOrderStatus: async (
    id: string,
    status: Order['status']
  ): Promise<ApiResponse<Order>> => {
    return apiRequest(`/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  },

  // Track order by Tracking Number (TRK-...) or Order Number (DFE-...)
  trackOrder: async (
    identifier: string,
    verification?: { email?: string; zip?: string }
  ): Promise<ApiResponse<TrackedOrderDetails>> => {
    const params = new URLSearchParams()
    if (verification?.email?.trim()) params.set('email', verification.email.trim())
    if (verification?.zip?.trim()) params.set('zip', verification.zip.trim())
    const qs = params.toString()
    return apiRequest(`/orders/track/${encodeURIComponent(identifier.trim())}${qs ? `?${qs}` : ''}`)
  },
}

// Address API functions
export const addressApi = {
  // Get user's addresses
  getAddresses: async (): Promise<ApiResponse<Address[]>> => {
    return apiRequest('/addresses')
  },

  // Create address
  createAddress: async (addressData: Omit<Address, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Address>> => {
    return apiRequest('/addresses', {
      method: 'POST',
      body: JSON.stringify(addressData),
    })
  },

  // Update address
  updateAddress: async (id: string, addressData: Partial<Address>): Promise<ApiResponse<Address>> => {
    return apiRequest(`/addresses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(addressData),
    })
  },

  // Delete address
  deleteAddress: async (id: string): Promise<ApiResponse<void>> => {
    return apiRequest(`/addresses/${id}`, {
      method: 'DELETE',
    })
  },
}

// Auth API functions
export const authApi = {
  // Login
  login: async (email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  // Register
  register: async (userData: {
    firstName: string
    lastName: string
    email: string
    password: string
    phone?: string
  }): Promise<ApiResponse<{ token: string; user: User }>> => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    })
  },

  // Verify token
  verifyToken: async (): Promise<ApiResponse<User>> => {
    return apiRequest('/auth/verify')
  },

  // Logout (clears token and server HttpOnly auth cookie)
  logout: (): void => {
    localStorage.removeItem('token')
    fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
  },

  // Get current user
  getCurrentUser: async (): Promise<ApiResponse<User>> => {
    return apiRequest('/auth/me')
  },
}

// Admin API functions
export const adminApi = {
  // Get dashboard stats
  getDashboardStats: async (): Promise<ApiResponse<{
    totalProducts: number
    totalOrders: number
    totalRevenue: number
    totalUsers?: number
    recentOrders: Order[]
    lowStockProducts?: any[]
  }>> => {
    return apiRequest('/admin/dashboard')
  },

  // Get storefront traffic, product checks, and order analytics
  getAnalytics: async (days: number = 30): Promise<ApiResponse<AdminAnalyticsData>> => {
    return apiRequest(`/admin/analytics?days=${encodeURIComponent(String(days))}`)
  },

  // Products management (Admin)
  getProducts: async (params?: {
    page?: number
    limit?: number
    category?: string
    search?: string
  }): Promise<ApiResponse<Product[]>> => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    if (params?.category) searchParams.append('category', params.category)
    if (params?.search) searchParams.append('search', params.search)
    const queryString = searchParams.toString()
    return apiRequest(`/admin/products${queryString ? `?${queryString}` : ''}`)
  },

  createProduct: async (productData: Partial<Product>): Promise<ApiResponse<Product>> => {
    return apiRequest('/admin/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    })
  },

  updateProduct: async (id: string, productData: Partial<Product>): Promise<ApiResponse<Product>> => {
    return apiRequest(`/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    })
  },

  deleteProduct: async (id: string): Promise<ApiResponse<void>> => {
    return apiRequest(`/admin/products/${id}`, {
      method: 'DELETE',
    })
  },

  // Get all orders (admin)
  getAllOrders: async (params?: {
    page?: number
    limit?: number
    status?: Order['status']
  }): Promise<ApiResponse<Order[]>> => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    if (params?.status) searchParams.append('status', params.status)
    const queryString = searchParams.toString()
    return apiRequest(`/admin/orders${queryString ? `?${queryString}` : ''}`)
  },

  // Alias for getOrders
  getOrders: async (params?: {
    page?: number
    limit?: number
    status?: Order['status']
  }): Promise<ApiResponse<Order[]>> => {
    return adminApi.getAllOrders(params)
  },

  // Update order status (admin)
  updateOrderStatus: async (
    id: string,
    status: Order['status']
  ): Promise<ApiResponse<Order>> => {
    return apiRequest(`/admin/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  },

  // Users management (admin)
  getUsers: async (params?: {
    page?: number
    limit?: number
    role?: string
    search?: string
  }): Promise<ApiResponse<User[]>> => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    if (params?.role) searchParams.append('role', params.role)
    if (params?.search) searchParams.append('search', params.search)
    const queryString = searchParams.toString()
    return apiRequest(`/admin/users${queryString ? `?${queryString}` : ''}`)
  },

  updateUserStatus: async (
    id: string,
    isActive: boolean
  ): Promise<ApiResponse<User>> => {
    return apiRequest(`/admin/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    })
  },

  // Upload product image file (admin)
  uploadImage: async (file: File): Promise<ApiResponse<{ url: string; urls?: string[]; filename: string }>> => {
    const formData = new FormData()
    formData.append('image', file)
    return apiRequest('/admin/upload', {
      method: 'POST',
      body: formData,
    })
  },

  // Upload multiple product media files (admin)
  uploadImages: async (files: File[]): Promise<ApiResponse<{ url: string; urls: string[]; count: number; filename: string }>> => {
    const formData = new FormData()
    files.forEach(f => formData.append('images', f))
    return apiRequest('/admin/upload', {
      method: 'POST',
      body: formData,
    })
  },

  // Get recent real-time system activity notifications (admin)
  getNotifications: async (): Promise<ApiResponse<any[]>> => {
    return apiRequest('/admin/notifications')
  },

  // Subscribe to real-time system activity notifications & live support sync over SSE (supports Bearer token & HttpOnly cookies)
  subscribeNotificationsStream: (
    onActivity: (event: any) => void,
    onConnectionChange?: (connected: boolean) => void,
    onSupportSync?: (payload: { sessionId: string; type?: string; session?: SupportSession }) => void,
    onAnalyticsSync?: (payload: { kind: string; data?: any; timestamp?: string }) => void
  ): (() => void) => {
    let closed = false
    let controller: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const connect = async () => {
      if (closed) return
      controller = new AbortController()
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = {
        Accept: 'text/event-stream'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      try {
        const response = await fetch(`${API_URL}/admin/notifications/stream`, {
          method: 'GET',
          headers,
          credentials: 'include',
          signal: controller.signal
        })

        if (!response.ok || !response.body) {
          throw new Error(`SSE stream failed with status ${response.status}`)
        }

        onConnectionChange?.(true)
        attempt = 0

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!closed) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split(/\r?\n\r?\n/)
          buffer = frames.pop() || ''

          for (const frame of frames) {
            if (!frame.trim() || frame.trim().startsWith(':')) continue
            let eventName = 'message'
            const dataLines: string[] = []
            for (const line of frame.split(/\r?\n/)) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim()
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim())
              }
            }
            if (dataLines.length === 0 || eventName === 'connected') continue
            try {
              const parsed = JSON.parse(dataLines.join('\n'))
              if (eventName === 'support_sync') {
                onSupportSync?.(parsed)
              } else if (eventName === 'analytics_sync') {
                onAnalyticsSync?.(parsed)
              } else if (parsed && parsed.id) {
                onActivity(parsed)
              }
            } catch {
              // Ignore non-JSON SSE frames
            }
          }
        }
      } catch (err: any) {
        if (closed || err?.name === 'AbortError') return
      }

      if (!closed) {
        onConnectionChange?.(false)
        const delayMs = Math.min(15000, 2000 * Math.pow(1.5, attempt))
        attempt += 1
        retryTimer = setTimeout(connect, delayMs)
      }
    }

    connect()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      controller?.abort()
      onConnectionChange?.(false)
    }
  },

  // LiveChat & Support session management (admin)
  getSupportSessions: async (): Promise<ApiResponse<SupportSession[]>> => {
    return apiRequest('/admin/support/sessions')
  },

  replySupportSession: async (sessionId: string, content: string): Promise<ApiResponse<SupportSession>> => {
    return apiRequest(`/admin/support/sessions/${sessionId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  },

  updateSupportSessionStatus: async (
    sessionId: string,
    payload: { status?: 'OPEN' | 'RESOLVED'; markRead?: boolean; aiPaused?: boolean }
  ): Promise<ApiResponse<SupportSession>> => {
    return apiRequest(`/admin/support/sessions/${sessionId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  // Coming Soon vehicle reservations management (admin)
  getBookings: async (): Promise<ApiResponse<ProductBooking[]>> => {
    return apiRequest('/admin/bookings')
  },

  updateBookingStatus: async (
    id: string,
    status: ProductBooking['status']
  ): Promise<ApiResponse<ProductBooking>> => {
    return apiRequest(`/admin/bookings/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  },
}

// Public Client LiveChat & Support API functions
export const supportApi = {
  hasStoredToken: (sessionId: string): boolean => {
    return Boolean(sessionId && localStorage.getItem(getSupportTokenKey(sessionId)))
  },

  clearStoredToken: (sessionId: string): void => {
    if (sessionId) {
      localStorage.removeItem(getSupportTokenKey(sessionId))
    }
  },

  getBeaconHeartbeatUrl: (sessionId: string): string => {
    const storedToken = sessionId ? localStorage.getItem(getSupportTokenKey(sessionId)) : null
    const base = `${API_URL}/support/session/${encodeURIComponent(sessionId)}/heartbeat`
    return storedToken ? `${base}?token=${encodeURIComponent(storedToken)}` : base
  },

  initSession: async (payload: {
    sessionId?: string
    visitorId?: string
    userId?: string
    visitorName?: string
    visitorEmail?: string
    visitorPhone?: string
    topic?: string
    selectedProducts?: SupportSelectedProduct[]
    resumeOnly?: boolean
  }): Promise<ApiResponse<SupportSession | null>> => {
    const existingId = payload.sessionId
    const storedToken = existingId ? localStorage.getItem(getSupportTokenKey(existingId)) : null
    const res = await apiRequest<SupportSession | null>('/support/session', {
      method: 'POST',
      headers: storedToken ? { 'x-support-token': storedToken } : undefined,
      body: JSON.stringify(payload),
    })
    if (res.data?.id && res.visitorToken) {
      localStorage.setItem(getSupportTokenKey(res.data.id), res.visitorToken)
    }
    return res
  },

  getSession: async (sessionId: string, isOpen?: boolean): Promise<ApiResponse<SupportSession>> => {
    const storedToken = localStorage.getItem(getSupportTokenKey(sessionId))
    return apiRequest(`/support/session/${encodeURIComponent(sessionId)}${isOpen ? '?open=true' : ''}`, {
      headers: storedToken ? { 'x-support-token': storedToken } : undefined,
    })
  },

  subscribeSessionStream: (
    sessionId: string,
    onSessionUpdate: (session: SupportSession) => void,
    onConnectionChange?: (connected: boolean) => void
  ): (() => void) => {
    let closed = false
    let controller: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const connect = async () => {
      if (closed || !sessionId) return
      controller = new AbortController()
      const authToken = localStorage.getItem('token')
      const storedSupportToken = localStorage.getItem(getSupportTokenKey(sessionId))
      const headers: Record<string, string> = {
        Accept: 'text/event-stream'
      }
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }
      if (storedSupportToken) {
        headers['x-support-token'] = storedSupportToken
      }

      try {
        const response = await fetch(
          `${API_URL}/support/session/${encodeURIComponent(sessionId)}/stream`,
          {
            method: 'GET',
            headers,
            credentials: 'include',
            signal: controller.signal
          }
        )

        if (!response.ok || !response.body) {
          throw new Error(`Support SSE stream failed with status ${response.status}`)
        }

        onConnectionChange?.(true)
        attempt = 0

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!closed) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split(/\r?\n\r?\n/)
          buffer = frames.pop() || ''

          for (const frame of frames) {
            if (!frame.trim() || frame.trim().startsWith(':')) continue
            let eventName = 'message'
            const dataLines: string[] = []
            for (const line of frame.split(/\r?\n/)) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim()
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim())
              }
            }
            if (dataLines.length === 0 || eventName === 'connected') continue
            try {
              const parsed = JSON.parse(dataLines.join('\n'))
              if (eventName === 'session_update' && parsed?.id) {
                onSessionUpdate(parsed)
              }
            } catch {
              // Ignore non-JSON SSE frames
            }
          }
        }
      } catch (err: any) {
        if (closed || err?.name === 'AbortError') return
      }

      if (!closed) {
        onConnectionChange?.(false)
        const delayMs = Math.min(15000, 2500 * Math.pow(1.5, attempt))
        attempt += 1
        retryTimer = setTimeout(connect, delayMs)
      }
    }

    connect()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      controller?.abort()
      onConnectionChange?.(false)
    }
  },

  sendMessage: async (
    sessionId: string,
    payload: {
      content: string
      topic?: string
      selectedProducts?: SupportSelectedProduct[]
      visitorName?: string
      visitorEmail?: string
      visitorPhone?: string
    }
  ): Promise<ApiResponse<SupportSession>> => {
    const storedToken = localStorage.getItem(getSupportTokenKey(sessionId))
    const res = await apiRequest<SupportSession>(`/support/session/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      headers: storedToken ? { 'x-support-token': storedToken } : undefined,
      body: JSON.stringify(payload),
    })
    if (res.data?.id && res.visitorToken) {
      localStorage.setItem(getSupportTokenKey(res.data.id), res.visitorToken)
    }
    return res
  },

  sendHeartbeat: async (
    sessionId: string,
    payload: { isOnline: boolean; visitorName?: string; visitorEmail?: string }
  ): Promise<ApiResponse<SupportSession>> => {
    const storedToken = localStorage.getItem(getSupportTokenKey(sessionId))
    return apiRequest(`/support/session/${encodeURIComponent(sessionId)}/heartbeat`, {
      method: 'POST',
      headers: storedToken ? { 'x-support-token': storedToken } : undefined,
      body: JSON.stringify(payload),
    })
  },
}

type PaymentConfigPayload = {
  stripePublishableKey: string
  paypalClientId: string
  paypalMerchantId: string
  paypalMode: string
  paypalClientToken?: string | null
  supportEmail?: string
}

let cachedPaymentConfigPromise: Promise<ApiResponse<PaymentConfigPayload>> | null = null
let cachedPaymentConfigTimestamp = 0

// Payment API functions (Stripe Card & PayPal JS SDK / Expanded Checkout)
export const paymentApi = {
  // Fetch runtime gateway keys, PayPal Client Token, and support contact email
  // Deduplicates simultaneous mount requests (e.g., Stripe wrapper + PayPal loader)
  getConfig: async (): Promise<ApiResponse<PaymentConfigPayload>> => {
    const now = Date.now()
    if (cachedPaymentConfigPromise && now - cachedPaymentConfigTimestamp < 5000) {
      return cachedPaymentConfigPromise
    }

    cachedPaymentConfigTimestamp = now
    const pending = apiRequest<PaymentConfigPayload>('/payments/config')
      .then((res) => {
        if (res.success && res.data?.supportEmail) {
          setSupportContactEmail(res.data.supportEmail)
        }
        if (!res.success) {
          cachedPaymentConfigPromise = null
        }
        return res
      })
      .catch((err) => {
        cachedPaymentConfigPromise = null
        throw err
      })

    cachedPaymentConfigPromise = pending
    return pending
  },

  // Create Stripe payment intent (USD) with server-authoritative pricing
  createStripePaymentIntent: async (
    payload:
      | number
      | {
          items: Array<{ productId: string; quantity: number }>
          customerEmail?: string
          shippingAddress?: Record<string, string | undefined>
        },
    customerEmail?: string
  ): Promise<ApiResponse<{
    clientSecret: string
    paymentIntentId: string
    amountUsd?: number
    countryCode?: string
  }>> => {
    const body =
      typeof payload === 'number'
        ? { amount: payload, customerEmail }
        : payload
    return apiRequest('/payments/stripe/create-intent', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // Confirm Stripe payment
  confirmStripePayment: async (paymentIntentId: string): Promise<ApiResponse<{
    status: string
    paymentId: string
  }>> => {
    return apiRequest('/payments/stripe/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId }),
    })
  },

  // Create PayPal order (USD) with server-authoritative pricing
  createPayPalOrder: async (
    payload:
      | number
      | {
          items: Array<{ productId: string; quantity: number }>
          customerEmail?: string
          shippingAddress?: Record<string, string | undefined>
        },
    customerEmail?: string
  ): Promise<ApiResponse<{
    orderId: string
    approveUrl?: string
    amountUsd?: number
    countryCode?: string
  }>> => {
    const body =
      typeof payload === 'number'
        ? { amount: payload, customerEmail }
        : payload
    return apiRequest('/payments/paypal/create-order', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // Capture PayPal payment
  capturePayPalPayment: async (orderId: string): Promise<ApiResponse<{
    status: string
    paymentId: string
    orderId?: string
    payer?: any
  }>> => {
    return apiRequest('/payments/paypal/capture', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    })
  },
}

function getOrCreateStorageId(storage: Storage, key: string, prefix: string): string {
  try {
    const existing = storage.getItem(key)
    if (existing && existing.trim()) return existing
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `${prefix}_${crypto.randomUUID()}`
        : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    storage.setItem(key, generated)
    return generated
  } catch {
    return `${prefix}_${Date.now()}`
  }
}

export const analyticsApi = {
  getVisitorIds: (): { visitorId: string; sessionKey: string } => {
    const visitorId = getOrCreateStorageId(localStorage, 'dfe_cart_visitor_id', 'vis')
    const sessionKey = getOrCreateStorageId(sessionStorage, 'dfe_visit_session_id', 'sess')
    return { visitorId, sessionKey }
  },

  trackSiteVisit: async (path: string, referrer?: string): Promise<void> => {
    if (!path || path.startsWith('/admin')) return
    const { visitorId, sessionKey } = analyticsApi.getVisitorIds()
    await apiRequest('/analytics/visit', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({
        visitorId,
        sessionKey,
        path,
        referrer: referrer ?? (typeof document !== 'undefined' ? document.referrer || undefined : undefined)
      })
    }).catch(() => undefined)
  },

  trackProductView: async (input: {
    productId: string
    productName?: string
    productSku?: string | null
    category?: string | null
    price?: number
    imageUrl?: string | null
    source: ProductViewSource
    path?: string
  }): Promise<void> => {
    if (!input.productId) return
    const { visitorId, sessionKey } = analyticsApi.getVisitorIds()
    await apiRequest('/analytics/product-view', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({
        ...input,
        visitorId,
        sessionKey,
        path: input.path || (typeof window !== 'undefined' ? window.location.pathname : undefined)
      })
    }).catch(() => undefined)
  }
}