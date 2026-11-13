export type Role = 'CUSTOMER' | 'ADMIN'
export type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
export type PaymentMethod = 'STRIPE' | 'PAYPAL'
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
export type AddressType = 'SHIPPING' | 'BILLING'

export interface User {
  id: string
  email: string
  password?: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  role: Role
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ProductVariant {
  id: string
  productId: string
  name: string
  value: string
  price: number | null
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  originalPrice: number | null
  sku: string
  stock: number
  images: string[]
  category: string
  brand: string | null
  isActive: boolean
  isNew: boolean
  isComingSoon?: boolean
  comingSoonRelease?: string | null
  shippingRequired: boolean
  averageDeliveryTime: string | null
  weight: number | null
  dimensions: string | null
  rating?: number
  reviews?: number
  createdAt: Date
  updatedAt: Date
  variants?: ProductVariant[]
}

export interface CartItem {
  id: string
  cartId: string
  productId: string
  quantity: number
  product?: Product
}

export interface Cart {
  id: string
  userId: string
  createdAt: Date
  updatedAt: Date
  items?: CartItem[]
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  quantity: number
  price: number
  total: number
  product?: Product
}

export interface Address {
  id: string
  userId: string
  type: AddressType
  firstName: string
  lastName: string
  company: string | null
  address1: string
  address2: string | null
  city: string
  state: string
  zipCode: string
  country: string
  phone: string | null
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
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
  createdAt: Date
  updatedAt: Date
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
  createdAt: Date
  updatedAt: Date
  product?: Product
}

export interface Order {
  id: string
  userId: string | null
  orderNumber: string
  trackingNumber: string
  status: OrderStatus
  total: number
  subtotal: number
  tax: number
  shipping: number
  discount: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentVerified?: boolean
  paymentId: string | null
  receiptToken?: string | null
  shippingAddressId: string | null
  billingAddressId: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  items?: OrderItem[]
  user?: Partial<User>
  shippingAddress?: Address | null
  billingAddress?: Address | null
}

export type SystemActivityType =
  | 'ORDER_PURCHASED'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'USER_REGISTERED'
  | 'USER_LOGIN'
  | 'USER_STATUS_UPDATED'
  | 'ORDER_STATUS_UPDATED'
  | 'ORDER_CANCELLED'
  | 'ORDER_REFUNDED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'PRODUCT_REVIEW_SUBMITTED'
  | 'PRODUCT_BOOKING_CREATED'
  | 'PRODUCT_BOOKING_UPDATED'
  | 'SUPPORT_INQUIRY'
  | 'SUPPORT_REPLY'
  | 'SUPPORT_STATUS_UPDATED'
  | 'CART_REMINDER_SENT'

export type CartReminderStatus = 'ACTIVE' | 'COMPLETED' | 'CLEARED' | 'EXPIRED'

export interface CartReminderItem {
  productId: string
  name: string
  price: number
  quantity: number
  image?: string
}

export interface CartReminderRecord {
  id: string
  reminderKey: string
  userId?: string | null
  visitorId?: string | null
  email: string
  customerName?: string | null
  items: CartReminderItem[]
  itemCount: number
  subtotal: number
  cartSignature: string
  status: CartReminderStatus
  sentStages: number[]
  lastSentStage: number
  lastRemindedAt?: string | null
  completedOrderNumber?: string | null
  cartUpdatedAt: string
  createdAt: string
  updatedAt: string
}

export interface SystemActivityRecord {
  id: string
  type: SystemActivityType
  title: string
  message: string
  userEmail?: string
  orderNumber?: string
  amount?: number
  metadata?: {
    sessionId?: string
    userId?: string
    [key: string]: any
  }
  emailDispatched: boolean
  systemMailDispatched: boolean
  timestamp: string
}

export type DeviceCategory = 'desktop' | 'mobile' | 'tablet'

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
  deviceType: DeviceCategory
  country?: string | null
  ipHash?: string | null
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
