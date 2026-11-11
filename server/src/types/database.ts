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

export interface Order {
  id: string
  userId: string
  orderNumber: string
  status: OrderStatus
  total: number
  subtotal: number
  tax: number
  shipping: number
  discount: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentId: string | null
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
