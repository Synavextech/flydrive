// User types
export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  role: 'CUSTOMER' | 'ADMIN'
  isActive: boolean
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

// Product types
export interface ProductVariant {
  id: string
  productId: string
  name: string
  value: string
  price?: number
}

export interface Product {
  id: string
  name: string
  description?: string
  price: number
  originalPrice?: number
  sku: string
  stock: number
  images: string[]
  category: string
  brand?: string
  isActive: boolean
  isNew: boolean
  shippingRequired: boolean
  averageDeliveryTime?: string
  weight?: number
  dimensions?: string
  variants?: ProductVariant[]
  rating?: number
  reviews?: number
  createdAt: string
  updatedAt: string
}

export interface ProductState {
  products: Product[]
  currentProduct: Product | null
  isLoading: boolean
  error: string | null
  searchQuery: string
  selectedCategory: string | null
  pagination: {
    currentPage: number
    totalPages: number
    totalProducts: number
  }
}

// Cart types
export interface CartItem {
  id: string
  cartId: string
  productId: string
  quantity: number
  product: Product
}

export interface Cart {
  id: string
  userId: string
  items: CartItem[]
  createdAt: string
  updatedAt: string
}

export interface CartState {
  cart: Cart | null
  items: CartItem[]
  isLoading: boolean
  error: string | null
  totalItems: number
  totalPrice: number
}

// Order types
export interface OrderItem {
  id: string
  orderId: string
  productId: string
  quantity: number
  price: number
  total: number
  product: Product
}

export interface Address {
  id: string
  userId: string
  type: 'SHIPPING' | 'BILLING'
  firstName: string
  lastName: string
  company?: string
  address1: string
  address2?: string
  city: string
  state: string
  zipCode: string
  country: string
  phone?: string
  isDefault: boolean
}

export interface ProductReview {
  id: string
  productId: string
  userId?: string | null
  reviewerName: string
  reviewerEmail?: string | null
  rating: number
  title?: string | null
  comment: string
  images: string[]
  verifiedPurchase: boolean
  createdAt: string
  updatedAt?: string
}

export interface Order {
  id: string
  userId: string
  orderNumber: string
  trackingNumber?: string
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
  total: number
  subtotal: number
  tax: number
  shipping: number
  discount: number
  paymentMethod: 'STRIPE' | 'PAYPAL'
  paymentStatus: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
  paymentId?: string
  shippingAddressId?: string
  billingAddressId?: string
  notes?: string
  items: OrderItem[]
  shippingAddress?: Address
  billingAddress?: Address
  createdAt: string
  updatedAt: string
}

export interface OrderTrackingTimelineStep {
  step: number
  key: string
  title: string
  location: string
  description: string
  completed: boolean
  active: boolean
  timestamp: string | null
}

export interface TrackedOrderDetails {
  id: string
  orderNumber: string
  trackingNumber: string
  status: Order['status']
  paymentStatus: Order['paymentStatus']
  paymentMethod: Order['paymentMethod']
  total: number
  subtotal?: number
  tax?: number
  shipping?: number
  carrier: string
  dispatchWarehouse: string
  destination: string
  estimatedDelivery: string
  createdAt: string
  updatedAt: string
  items: Array<{
    id?: string
    productId?: string
    name: string
    image?: string
    category?: string
    quantity: number
    price: number
    total: number
  }>
  timeline: OrderTrackingTimelineStep[]
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  count?: number
  pagination?: {
    currentPage: number
    totalPages: number
    totalProducts: number
  }
}

// Payment types
export interface PaymentIntent {
  id: string
  client_secret: string
  amount: number
  currency: string
}

// LiveChat & Support types
export type SupportTopic = 'Payment Issue' | 'Item Purchase' | 'General Inquiry' | 'Shipping Issue'

export interface SupportSelectedProduct {
  id: string
  name: string
  sku: string
  price: number
  category: string
  image?: string
}

export interface SupportMessage {
  id: string
  sessionId: string
  senderRole: 'CLIENT' | 'ADMIN' | 'AI_ASSISTANT'
  senderName: string
  content: string
  metadata?: Record<string, any>
  createdAt: string
}

export interface SupportSession {
  id: string
  visitorId: string
  userId?: string
  visitorName: string
  visitorEmail?: string
  visitorPhone?: string
  topic: SupportTopic | string
  selectedProducts: SupportSelectedProduct[]
  status: 'OPEN' | 'RESOLVED'
  isOnline: boolean
  lastSeenAt: string
  lastSeenText?: string
  unreadAdminCount: number
  unreadClientCount: number
  createdAt: string
  updatedAt: string
  messages: SupportMessage[]
}