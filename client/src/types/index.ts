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
  isComingSoon?: boolean
  comingSoonRelease?: string | null
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
  receiptToken?: string
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

export interface ProductBooking {
  id: string
  productId: string
  userId?: string | null
  fullName: string
  email: string
  phone?: string | null
  country: string
  quantity: number
  notes?: string | null
  status: 'PENDING' | 'CONFIRMED' | 'NOTIFIED' | 'CANCELLED'
  bookingReference: string
  createdAt: string
  updatedAt?: string
  product?: Product
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  message?: string
  data?: T
  error?: string
  requiresVerification?: boolean
  visitorToken?: string
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
  isRegisteredUser?: boolean
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
  aiPaused?: boolean
  createdAt: string
  updatedAt: string
  messages: SupportMessage[]
}

export type ProductViewSource =
  | 'PRODUCT_PAGE'
  | 'CART_ADD'
  | 'BOOKING_MODAL'
  | 'LIVECHAT_SELECT'
  | 'SHARE'

export interface SiteVisitRecord {
  id: string
  visitorId: string
  sessionKey: string
  userId?: string | null
  userEmail?: string | null
  path: string
  referrer?: string | null
  userAgent?: string | null
  deviceType: 'desktop' | 'mobile' | 'tablet'
  country?: string | null
  createdAt: string
}

export interface ProductViewRecord {
  id: string
  productId: string
  productName: string
  productSku?: string | null
  category?: string | null
  price: number
  imageUrl?: string | null
  visitorId: string
  sessionKey?: string | null
  userId?: string | null
  userEmail?: string | null
  source: ProductViewSource
  path?: string | null
  createdAt: string
}

export interface TrafficAnalyticsSummary {
  periodDays: number
  totalVisits: number
  visitsToday: number
  visitsLast7d: number
  uniqueVisitors: number
  uniqueVisitorsToday: number
  uniqueVisitorsLast7d: number
  totalProductViews: number
  productViewsToday: number
  uniqueProductsChecked: number
  deviceBreakdown: {
    desktop: number
    mobile: number
    tablet: number
  }
  topPages: Array<{
    path: string
    visits: number
    uniqueVisitors: number
    lastVisitedAt: string
  }>
  topReferrers: Array<{
    referrer: string
    visits: number
  }>
  topProductsChecked: Array<{
    productId: string
    productName: string
    productSku?: string | null
    category?: string | null
    price: number
    imageUrl?: string | null
    totalViews: number
    pageViews: number
    cartAdds: number
    bookingChecks: number
    chatSelections: number
    uniqueVisitors: number
    lastViewedAt: string
  }>
  dailySeries: Array<{
    date: string
    label: string
    visits: number
    uniqueVisitors: number
    productViews: number
  }>
  recentVisits: SiteVisitRecord[]
  recentProductViews: ProductViewRecord[]
}

export interface AdminAnalyticsData {
  revenueByMonth: Array<{ month: string; revenue: number; orders: number }>
  ordersByStatus: Array<{ status: string; _count: { id: number } }>
  topProducts: Product[]
  recentActivity: Order[]
  activeCartRemindersCount?: number
  trafficAnalytics: TrafficAnalyticsSummary
}