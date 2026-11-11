import { ApiResponse, Product, Cart, Order, User, Address } from '../types'

// API base URL
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

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
    ...options,
    headers
  }

  try {
    const response = await fetch(url, config)
    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`
      if (isJson) {
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.message || errorMessage
        } catch {
          // Fallback to HTTP error
        }
      } else {
        const text = await response.text()
        if (text && !text.includes('<!DOCTYPE') && text.length < 150) {
          errorMessage = text
        } else {
          errorMessage = `Endpoint ${endpoint} returned ${response.status} (${response.statusText || 'Error'})`
        }
      }
      throw new Error(errorMessage)
    }

    if (!isJson) {
      throw new Error(`Server returned non-JSON response for ${endpoint} (${contentType || 'text'})`)
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
  clearCart: async (): Promise<ApiResponse<Cart>> => {
    return apiRequest('/cart', {
      method: 'DELETE',
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
    items: Array<{ productId: string; quantity: number }>
    shippingAddressId?: string
    billingAddressId?: string
    paymentMethod: 'STRIPE' | 'PAYPAL'
    notes?: string
  }): Promise<ApiResponse<Order>> => {
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

  // Logout (client-side only)
  logout: (): void => {
    localStorage.removeItem('token')
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
}

// Payment API functions (Stripe Card & PayPal only)
export const paymentApi = {
  // Create Stripe payment intent (USD)
  createStripePaymentIntent: async (amount: number): Promise<ApiResponse<{
    clientSecret: string
    paymentIntentId: string
  }>> => {
    return apiRequest('/payments/stripe/create-intent', {
      method: 'POST',
      body: JSON.stringify({ amount }),
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

  // Create PayPal order (USD)
  createPayPalOrder: async (amount: number): Promise<ApiResponse<{
    orderId: string
    approveUrl: string
  }>> => {
    return apiRequest('/payments/paypal/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    })
  },

  // Capture PayPal payment
  capturePayPalPayment: async (orderId: string): Promise<ApiResponse<{
    status: string
    paymentId: string
  }>> => {
    return apiRequest('/payments/paypal/capture', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    })
  },
}