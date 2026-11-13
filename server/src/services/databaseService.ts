import { supabase } from '../utils/supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import type {
  User,
  Product,
  ProductReview,
  ProductBooking,
  Cart,
  CartItem,
  Order,
  Address,
  SystemActivityRecord,
  CartReminderItem,
  CartReminderRecord,
  CartReminderStatus,
  DeviceCategory,
  ProductViewRecord,
  ProductViewSource,
  SiteVisitRecord,
  TrafficAnalyticsSummary
} from '../types/database.js'
import crypto from 'crypto'
import {
  sanitizePostgrestSearch,
  getAdminContactEmail,
  getFormattedSupportWhatsApp,
  isValidEmailAddress
} from '../middleware/security.js'

const { Pool } = pg

export class DatabaseService {
  public supabase: SupabaseClient
  public pool: pg.Pool | null = null
  private reviewsMemoryCache: Map<string, ProductReview[]> = new Map()
  private cartRemindersMemoryCache: Map<string, CartReminderRecord> = new Map()
  private siteVisitsMemoryCache: SiteVisitRecord[] = []
  private productViewsMemoryCache: ProductViewRecord[] = []
  private analyticsDedupeCache: Map<string, number> = new Map()

  constructor(client: SupabaseClient = supabase) {
    this.supabase = client
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL_INSECURE === 'true'
          ? { rejectUnauthorized: false }
          : process.env.DB_SSL_CA
            ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
            : { rejectUnauthorized: true }
      })
    }
  }

  public generateTrackingNumber(orderNumber?: string): string {
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase()
    const cleanNum = (orderNumber || `DFE-${Date.now()}`).replace(/^DFE-?/i, '')
    return `TRK-DFE-${cleanNum.slice(-6)}-${suffix}`
  }

  public extractTrackingFromNotes(notes?: string | null, fallbackOrderNumber?: string): string {
    if (notes) {
      const match = notes.match(/\[TRACKING:([A-Z0-9-]+)\]/i)
      if (match && match[1]) return match[1].toUpperCase()
    }
    return `TRK-${fallbackOrderNumber || 'DFE'}`
  }

  public mapProductReview(raw: any): ProductReview {
    return {
      id: raw.id,
      productId: raw.product_id || raw.productId,
      userId: raw.user_id || raw.userId || null,
      reviewerName: raw.reviewer_name || raw.reviewerName || 'Verified Buyer',
      reviewerEmail: raw.reviewer_email || raw.reviewerEmail || null,
      rating: Math.min(5, Math.max(1, Number(raw.rating || 5))),
      title: raw.title || null,
      comment: raw.comment || '',
      images: Array.isArray(raw.images) ? raw.images : [],
      verifiedPurchase: raw.verified_purchase ?? raw.verifiedPurchase ?? true,
      createdAt: raw.created_at ? new Date(raw.created_at) : raw.createdAt ? new Date(raw.createdAt) : new Date(),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : raw.updatedAt ? new Date(raw.updatedAt) : new Date()
    }
  }

  // --- Map helpers ---
  public mapProduct(raw: any): Product {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description || null,
      price: typeof raw.price === 'string' ? parseFloat(raw.price) : Number(raw.price),
      originalPrice: raw.original_price ? (typeof raw.original_price === 'string' ? parseFloat(raw.original_price) : Number(raw.original_price)) : null,
      sku: raw.sku,
      stock: raw.stock !== undefined && raw.stock !== null ? Number(raw.stock) : 0,
      images: Array.isArray(raw.images) ? raw.images : [],
      category: raw.category,
      brand: raw.brand || null,
      isActive: raw.is_active ?? true,
      isNew: raw.is_new ?? false,
      isComingSoon: raw.is_coming_soon ?? false,
      comingSoonRelease: raw.coming_soon_release || null,
      shippingRequired: raw.shipping_required ?? true,
      averageDeliveryTime: raw.average_delivery_time || null,
      weight: raw.weight ? Number(raw.weight) : null,
      dimensions: raw.dimensions || null,
      rating: raw.rating !== undefined && raw.rating !== null ? Number(raw.rating) : 0,
      reviews: raw.reviews ? Number(raw.reviews) : 0,
      createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : new Date()
    }
  }

  public mapUser(raw: any): User {
    return {
      id: raw.id,
      email: raw.email,
      password: raw.password,
      firstName: raw.first_name || null,
      lastName: raw.last_name || null,
      phone: raw.phone || null,
      role: raw.role || 'CUSTOMER',
      isActive: raw.is_active ?? true,
      createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : new Date()
    }
  }

  public mapAddress(raw: any): Address {
    return {
      id: raw.id,
      userId: raw.user_id,
      type: raw.type,
      firstName: raw.first_name,
      lastName: raw.last_name,
      company: raw.company || null,
      address1: raw.address1,
      address2: raw.address2 || null,
      city: raw.city,
      state: raw.state,
      zipCode: raw.zip_code,
      country: raw.country || 'United States',
      phone: raw.phone || null,
      isDefault: raw.is_default ?? false,
      createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : new Date()
    }
  }

  public mapOrder(raw: any): Order {
    const trackingNumber =
      raw.tracking_number ||
      raw.trackingNumber ||
      this.extractTrackingFromNotes(raw.notes, raw.order_number)
    const cleanedNotes = raw.notes
      ? String(raw.notes).replace(/\s*\[TRACKING:[A-Z0-9-]+\]/gi, '').trim() || null
      : null

    return {
      id: raw.id,
      userId: raw.user_id,
      orderNumber: raw.order_number,
      trackingNumber,
      status: raw.status,
      total: Number(raw.total),
      subtotal: Number(raw.subtotal),
      tax: Number(raw.tax || 0),
      shipping: Number(raw.shipping || 0),
      discount: Number(raw.discount || 0),
      paymentMethod: raw.payment_method,
      paymentStatus: raw.payment_status,
      paymentVerified: raw.payment_verified ?? false,
      paymentId: raw.payment_id || null,
      receiptToken: raw.receipt_token || null,
      shippingAddressId: raw.shipping_address_id || null,
      billingAddressId: raw.billing_address_id || null,
      notes: cleanedNotes,
      createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : new Date(),
      items: Array.isArray(raw.order_items) ? raw.order_items.map((oi: any) => ({
        id: oi.id,
        orderId: oi.order_id,
        productId: oi.product_id,
        quantity: oi.quantity,
        price: Number(oi.price),
        total: Number(oi.total),
        product: oi.products ? this.mapProduct(oi.products) : undefined
      })) : [],
      shippingAddress: raw.shipping_address
        ? this.mapAddress(raw.shipping_address)
        : raw.addresses
          ? (Array.isArray(raw.addresses) ? (raw.addresses[0] ? this.mapAddress(raw.addresses[0]) : undefined) : this.mapAddress(raw.addresses))
          : undefined,
      billingAddress: raw.billing_address ? this.mapAddress(raw.billing_address) : undefined,
      user: raw.users ? this.mapUser(raw.users) : undefined
    }
  }

  // ==================== USER OPERATIONS ====================
  async createUser(userData: {
    email: string
    password: string
    firstName?: string
    lastName?: string
    phone?: string
    role?: 'CUSTOMER' | 'ADMIN'
  }): Promise<User> {
    const id = crypto.randomUUID()
    const { data, error } = await this.supabase
      .from('users')
      .insert({
        id,
        email: userData.email,
        password: userData.password,
        first_name: userData.firstName,
        last_name: userData.lastName,
        phone: userData.phone,
        role: userData.role || 'CUSTOMER',
        is_active: true
      })
      .select()
      .single()

    if (error || !data) throw error || new Error('Failed to create user')
    return this.mapUser(data)
  }

  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (error) throw error
      return data ? this.mapUser(data) : null
    } catch (err) {
      if (this.pool) {
        const res = await this.pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email])
        return res.rows[0] ? this.mapUser(res.rows[0]) : null
      }
      throw err
    }
  }

  async findUserById(id: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return data ? this.mapUser(data) : null
    } catch (err) {
      if (this.pool) {
        const res = await this.pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id])
        return res.rows[0] ? this.mapUser(res.rows[0]) : null
      }
      throw err
    }
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User> {
    const payload: Record<string, any> = {}
    if (userData.firstName !== undefined) payload.first_name = userData.firstName
    if (userData.lastName !== undefined) payload.last_name = userData.lastName
    if (userData.phone !== undefined) payload.phone = userData.phone
    if (userData.role !== undefined) payload.role = userData.role
    if (userData.isActive !== undefined) payload.is_active = userData.isActive
    if (userData.password !== undefined) payload.password = userData.password
    payload.updated_at = new Date().toISOString()

    const { data, error } = await this.supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) throw error || new Error('Failed to update user')
    return this.mapUser(data)
  }

  async findUsers(options?: { role?: string; limit?: number; offset?: number }): Promise<User[]> {
    let query = this.supabase
      .from('users')
      .select('id, email, first_name, last_name, phone, role, is_active, created_at, updated_at')
      .order('created_at', { ascending: false })
    if (options?.role) query = query.eq('role', options.role)
    if (options?.limit) query = query.limit(options.limit)
    if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(u => {
      const mapped = this.mapUser(u)
      delete mapped.password
      return mapped
    })
  }

  // ==================== PRODUCT OPERATIONS ====================
  private applyCategoryFilter(query: any, category?: string) {
    if (!category || category.toLowerCase() === 'all') return query
    const lower = category.toLowerCase().trim()
    if (lower === 'mini-helicopter' || lower === 'minihelicopters' || lower.includes('heli')) {
      return query.or('category.ilike.%heli%,category.ilike.%copter%,name.ilike.%heli%,name.ilike.%copter%')
    }
    if (lower === 'microcars' || lower === 'microcar') {
      return query.or('category.ilike.%microcar%,category.ilike.%car%,name.ilike.%microcar%,name.ilike.%jeep%')
    }
    if (lower === 'go karts' || lower === 'gokarts' || lower === 'go-karts') {
      return query.or('category.ilike.%kart%,category.ilike.%buggy%,name.ilike.%kart%,name.ilike.%buggy%')
    }
    if (lower === 'dirtbikes' || lower === 'dirt bikes' || lower === 'dirt-bikes') {
      return query.or('category.ilike.%dirt%,category.ilike.%bike%,name.ilike.%dirt%,name.ilike.%bike%')
    }
    if (lower === 'trikes' || lower === 'trike') {
      return query.or('category.ilike.%trike%,name.ilike.%trike%')
    }
    const safeCategory = sanitizePostgrestSearch(category)
    return safeCategory ? query.ilike('category', `%${safeCategory}%`) : query
  }

  async findProducts(filters?: {
    category?: string
    search?: string
    includeInactive?: boolean
    comingSoon?: boolean
    limit?: number
    offset?: number
  }): Promise<Product[]> {
    const { category, search, includeInactive = false, comingSoon, limit = 100, offset = 0 } = filters || {}
    try {
      let query = this.supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (!includeInactive) {
        query = query.eq('is_active', true)
      }
      if (comingSoon !== undefined) {
        query = query.eq('is_coming_soon', comingSoon)
      }

      query = this.applyCategoryFilter(query, category)

      if (search && search.trim()) {
        const s = sanitizePostgrestSearch(search)
        if (s) {
          query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%`)
        }
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(p => this.mapProduct(p))
    } catch (err) {
      if (this.pool) {
        let sql = includeInactive ? 'SELECT * FROM products WHERE 1=1' : 'SELECT * FROM products WHERE is_active = true'
        const params: any[] = []
        if (comingSoon !== undefined) {
          params.push(comingSoon)
          sql += ` AND COALESCE(is_coming_soon, false) = $${params.length}`
        }
        if (category && category.toLowerCase() !== 'all') {
          const lower = category.toLowerCase().trim()
          const term = lower.includes('heli') ? 'heli' : lower.includes('kart') ? 'kart' : lower.includes('dirt') ? 'dirt' : lower
          params.push(`%${term}%`)
          sql += ` AND (category ILIKE $${params.length} OR name ILIKE $${params.length})`
        }
        if (search && search.trim()) {
          params.push(`%${search.trim()}%`)
          sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
        params.push(limit, offset)
        const res = await this.pool.query(sql, params)
        return res.rows.map(r => this.mapProduct(r))
      }
      throw err
    }
  }

  async findProductById(id: string): Promise<Product | null> {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('*, product_variants(*)')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      const prod = this.mapProduct(data)
      prod.variants = (data.product_variants || []).map((v: any) => ({
        id: v.id,
        productId: v.product_id,
        name: v.name,
        value: v.value,
        price: v.price ? Number(v.price) : null
      }))
      return prod
    } catch (err) {
      if (this.pool) {
        const res = await this.pool.query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id])
        if (!res.rows[0]) return null
        const prod = this.mapProduct(res.rows[0])
        const vRes = await this.pool.query('SELECT * FROM product_variants WHERE product_id = $1', [id])
        prod.variants = vRes.rows.map((v: any) => ({
          id: v.id,
          productId: v.product_id,
          name: v.name,
          value: v.value,
          price: v.price ? Number(v.price) : null
        }))
        return prod
      }
      throw err
    }
  }

  async createProduct(productData: any): Promise<Product> {
    const id = productData.id || crypto.randomUUID()
    const basePayload = {
      id,
      name: productData.name,
      description: productData.description,
      price: productData.price,
      original_price: productData.originalPrice,
      sku: productData.sku,
      stock: productData.stock ?? 0,
      images: productData.images || [],
      category: productData.category,
      brand: productData.brand,
      is_active: productData.isActive ?? true,
      is_new: productData.isNew ?? false,
      shipping_required: productData.shippingRequired ?? true,
      average_delivery_time: productData.averageDeliveryTime || '12-20 business days',
      weight: productData.weight,
      dimensions: productData.dimensions
    }

    let { data, error } = await this.supabase
      .from('products')
      .insert({
        ...basePayload,
        is_coming_soon: productData.isComingSoon ?? false,
        coming_soon_release: productData.comingSoonRelease || null
      })
      .select()
      .single()

    if (error && String(error.message || '').includes('coming_soon')) {
      const retry = await this.supabase.from('products').insert(basePayload).select().single()
      data = retry.data
      error = retry.error
    }

    if (error || !data) throw error || new Error('Failed to create product')
    return this.mapProduct(data)
  }

  async updateProduct(id: string, productData: any): Promise<Product> {
    const payload: Record<string, any> = {}
    if (productData.name !== undefined) payload.name = productData.name
    if (productData.description !== undefined) payload.description = productData.description
    if (productData.price !== undefined) payload.price = productData.price
    if (productData.originalPrice !== undefined) payload.original_price = productData.originalPrice
    if (productData.sku !== undefined) payload.sku = productData.sku
    if (productData.stock !== undefined) payload.stock = productData.stock
    if (productData.images !== undefined) payload.images = productData.images
    if (productData.category !== undefined) payload.category = productData.category
    if (productData.brand !== undefined) payload.brand = productData.brand
    if (productData.isActive !== undefined) payload.is_active = productData.isActive
    if (productData.isNew !== undefined) payload.is_new = productData.isNew
    if (productData.isComingSoon !== undefined) payload.is_coming_soon = productData.isComingSoon
    if (productData.comingSoonRelease !== undefined) payload.coming_soon_release = productData.comingSoonRelease
    if (productData.shippingRequired !== undefined) payload.shipping_required = productData.shippingRequired
    if (productData.averageDeliveryTime !== undefined) payload.average_delivery_time = productData.averageDeliveryTime
    if (productData.weight !== undefined) payload.weight = productData.weight
    if (productData.dimensions !== undefined) payload.dimensions = productData.dimensions
    payload.updated_at = new Date().toISOString()

    let { data, error } = await this.supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error && String(error.message || '').includes('coming_soon')) {
      delete payload.is_coming_soon
      delete payload.coming_soon_release
      const retry = await this.supabase.from('products').update(payload).eq('id', id).select().single()
      data = retry.data
      error = retry.error
    }

    if (error || !data) throw error || new Error('Failed to update product')
    return this.mapProduct(data)
  }

  async deleteProduct(id: string): Promise<Product> {
    const { data, error } = await this.supabase
      .from('products')
      .delete()
      .eq('id', id)
      .select()
      .single()

    if (error || !data) throw error || new Error('Failed to delete product')
    return this.mapProduct(data)
  }

  async getProductCount(filters?: { category?: string; search?: string; includeInactive?: boolean; comingSoon?: boolean }): Promise<number> {
    try {
      let query = this.supabase
        .from('products')
        .select('*', { count: 'exact', head: true })

      if (!filters?.includeInactive) {
        query = query.eq('is_active', true)
      }
      if (filters?.comingSoon !== undefined) {
        query = query.eq('is_coming_soon', filters.comingSoon)
      }

      query = this.applyCategoryFilter(query, filters?.category)

      if (filters?.search && filters.search.trim()) {
        const s = sanitizePostgrestSearch(filters.search)
        if (s) {
          query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%`)
        }
      }

      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    } catch (err) {
      if (this.pool) {
        let sql = filters?.includeInactive ? 'SELECT count(*) FROM products WHERE 1=1' : 'SELECT count(*) FROM products WHERE is_active = true'
        const params: any[] = []
        if (filters?.comingSoon !== undefined) {
          params.push(filters.comingSoon)
          sql += ` AND COALESCE(is_coming_soon, false) = $${params.length}`
        }
        if (filters?.category && filters.category.toLowerCase() !== 'all') {
          const lower = filters.category.toLowerCase().trim()
          const term = lower.includes('heli') ? 'heli' : lower.includes('kart') ? 'kart' : lower.includes('dirt') ? 'dirt' : lower
          params.push(`%${term}%`)
          sql += ` AND (category ILIKE $${params.length} OR name ILIKE $${params.length})`
        }
        if (filters?.search && filters.search.trim()) {
          params.push(`%${filters.search.trim()}%`)
          sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`
        }
        const res = await this.pool.query(sql, params)
        return parseInt(res.rows[0]?.count || '0', 10)
      }
      throw err
    }
  }

  // ==================== CART OPERATIONS ====================
  async findOrCreateCart(userId: string): Promise<Cart & { items: CartItem[] }> {
    let { data: cart } = await this.supabase
      .from('carts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (!cart) {
      const cartId = crypto.randomUUID()
      const { data: newCart, error } = await this.supabase
        .from('carts')
        .insert({ id: cartId, user_id: userId })
        .select()
        .single()
      if (error) throw error
      cart = newCart
    }

    const { data: rawItems } = await this.supabase
      .from('cart_items')
      .select('*, products(*)')
      .eq('cart_id', cart.id)

    const items: CartItem[] = (rawItems || []).map((ci: any) => ({
      id: ci.id,
      cartId: ci.cart_id,
      productId: ci.product_id,
      quantity: ci.quantity,
      product: ci.products ? this.mapProduct(ci.products) : undefined
    }))

    return {
      id: cart.id,
      userId: cart.user_id,
      createdAt: new Date(cart.created_at),
      updatedAt: new Date(cart.updated_at),
      items
    }
  }

  async addToCart(userId: string, productId: string, quantity: number = 1): Promise<CartItem> {
    const cart = await this.findOrCreateCart(userId)

    const { data: existing } = await this.supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
      .maybeSingle()

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id)
        .select('*, products(*)')
        .single()
      if (error) throw error
      return {
        id: updated.id,
        cartId: updated.cart_id,
        productId: updated.product_id,
        quantity: updated.quantity,
        product: updated.products ? this.mapProduct(updated.products) : undefined
      }
    }

    const itemId = crypto.randomUUID()
    const { data: inserted, error } = await this.supabase
      .from('cart_items')
      .insert({
        id: itemId,
        cart_id: cart.id,
        product_id: productId,
        quantity
      })
      .select('*, products(*)')
      .single()

    if (error) throw error
    return {
      id: inserted.id,
      cartId: inserted.cart_id,
      productId: inserted.product_id,
      quantity: inserted.quantity,
      product: inserted.products ? this.mapProduct(inserted.products) : undefined
    }
  }

  async updateCartItem(cartItemId: string, quantity: number): Promise<CartItem> {
    const { data, error } = await this.supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', cartItemId)
      .select('*, products(*)')
      .single()

    if (error) throw error
    return {
      id: data.id,
      cartId: data.cart_id,
      productId: data.product_id,
      quantity: data.quantity,
      product: data.products ? this.mapProduct(data.products) : undefined
    }
  }

  async removeCartItem(cartItemId: string): Promise<void> {
    const { error } = await this.supabase.from('cart_items').delete().eq('id', cartItemId)
    if (error) throw error
  }

  async clearCart(userId: string): Promise<void> {
    const cart = await this.findOrCreateCart(userId)
    const { error } = await this.supabase.from('cart_items').delete().eq('cart_id', cart.id)
    if (error) throw error
  }

  // ==================== ORDER OPERATIONS ====================
  async createOrder(orderData: {
    userId: string | null
    total: number
    subtotal: number
    tax?: number
    shipping?: number
    discount?: number
    paymentMethod: 'STRIPE' | 'PAYPAL'
    paymentId?: string
    paymentStatus?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
    paymentVerified?: boolean
    receiptToken?: string | null
    status?: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
    shippingAddressId?: string
    billingAddressId?: string
    notes?: string
    items: Array<{
      productId: string
      quantity: number
      price: number
    }>
  }): Promise<Order> {
    const orderId = crypto.randomUUID()
    const orderNumber = `DFE-${Date.now()}`
    const trackingNumber = this.generateTrackingNumber(orderNumber)
    const notesWithTracking = orderData.notes
      ? `${orderData.notes} [TRACKING:${trackingNumber}]`
      : `[TRACKING:${trackingNumber}]`

    const baseInsertPayload: Record<string, any> = {
      id: orderId,
      user_id: orderData.userId || null,
      order_number: orderNumber,
      total: orderData.total,
      subtotal: orderData.subtotal,
      tax: orderData.tax || 0,
      shipping: orderData.shipping || 0,
      discount: orderData.discount || 0,
      payment_method: orderData.paymentMethod,
      payment_id: orderData.paymentId || null,
      payment_status: orderData.paymentStatus || 'PENDING',
      status: orderData.status || (orderData.paymentStatus === 'COMPLETED' ? 'PROCESSING' : 'PENDING'),
      shipping_address_id: orderData.shippingAddressId || null,
      billing_address_id: orderData.billingAddressId || null,
      notes: notesWithTracking
    }

    let order: any = null
    let orderError: any = null

    const firstAttempt = await this.supabase
      .from('orders')
      .insert({
        ...baseInsertPayload,
        tracking_number: trackingNumber,
        payment_verified: Boolean(orderData.paymentVerified),
        receipt_token: orderData.receiptToken || null
      })
      .select()
      .single()

    if (firstAttempt.error) {
      const retryAttempt = await this.supabase
        .from('orders')
        .insert({
          ...baseInsertPayload,
          tracking_number: trackingNumber
        })
        .select()
        .single()

      if (retryAttempt.error) {
        const secondAttempt = await this.supabase
          .from('orders')
          .insert(baseInsertPayload)
          .select()
          .single()
        order = secondAttempt.data
        orderError = secondAttempt.error
      } else {
        order = retryAttempt.data
        orderError = null
      }

      if (order && this.pool) {
        await this.pool
          .query('UPDATE public.orders SET tracking_number = $1 WHERE id = $2', [trackingNumber, orderId])
          .catch(() => {})
      }
    } else {
      order = firstAttempt.data
    }

    if (orderError || !order) throw orderError || new Error('Failed to create order')

    if (orderData.items && orderData.items.length > 0) {
      const itemsToInsert = orderData.items.map(item => ({
        id: crypto.randomUUID(),
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price
      }))

      const { error: itemsError } = await this.supabase.from('order_items').insert(itemsToInsert)
      if (itemsError) throw itemsError

      // Automatically decrement product stock for each ordered item
      for (const item of orderData.items) {
        try {
          const prod = await this.findProductById(item.productId)
          if (prod) {
            const nextStock = Math.max(0, Number(prod.stock || 0) - Number(item.quantity || 1))
            await this.updateProduct(item.productId, { stock: nextStock })
          }
        } catch (stockErr) {
          console.warn(`Could not decrement stock for product ${item.productId}:`, stockErr)
        }
      }
    }

    // Clear user cart only when associated with an authenticated account
    if (orderData.userId) {
      await this.clearCart(orderData.userId).catch(() => {})
    }

    return this.findOrderById(order.id) as Promise<Order>
  }

  async findOrderByPaymentId(paymentId: string): Promise<Order | null> {
    if (!paymentId) return null
    const { data, error } = await this.supabase
      .from('orders')
      .select('*, order_items(*, products(*)), users(*), shipping_address:addresses!orders_shipping_address_id_fkey(*)')
      .eq('payment_id', paymentId)
      .maybeSingle()

    if (error || !data) return null
    return this.mapOrder(data)
  }

  async findOrders(options?: { userId?: string; status?: string; limit?: number; offset?: number }): Promise<Order[]> {
    let query = this.supabase
      .from('orders')
      .select('*, order_items(*, products(*)), users(*), shipping_address:addresses!orders_shipping_address_id_fkey(*)')
      .order('created_at', { ascending: false })

    if (options?.userId) query = query.eq('user_id', options.userId)
    if (options?.status) query = query.eq('status', options.status)
    if (options?.limit) query = query.limit(options.limit)
    if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(o => this.mapOrder(o))
  }

  async findOrdersByUserId(userId: string): Promise<Order[]> {
    return this.findOrders({ userId })
  }

  async findOrderById(id: string): Promise<Order | null> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('*, order_items(*, products(*)), users(*), shipping_address:addresses!orders_shipping_address_id_fkey(*)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data ? this.mapOrder(data) : null
  }

  async findOrderByTrackingOrNumber(identifier: string): Promise<Order | null> {
    const cleaned = (identifier || '').trim().replace(/^#/, '').toUpperCase()
    if (!cleaned) return null

    // 1. Check recent orders via Supabase with full relational join
    try {
      const { data: rows, error } = await this.supabase
        .from('orders')
        .select('*, order_items(*, products(*)), users(*), shipping_address:addresses!orders_shipping_address_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (!error && Array.isArray(rows)) {
        for (const r of rows) {
          const mapped = this.mapOrder(r)
          const orderNumUpper = (mapped.orderNumber || '').toUpperCase()
          const trackUpper = (mapped.trackingNumber || '').toUpperCase()
          const derivedTrackUpper = `TRK-${orderNumUpper}`
          if (
            trackUpper === cleaned ||
            orderNumUpper === cleaned ||
            derivedTrackUpper === cleaned ||
            r.id === identifier.trim()
          ) {
            return mapped
          }
        }
      }
    } catch {
      // Fallback to direct PostgreSQL pool if needed
    }

    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM public.orders
         WHERE UPPER(COALESCE(tracking_number, '')) = $1
            OR UPPER(order_number) = $1
            OR UPPER('TRK-' || order_number) = $1
            OR notes ILIKE $2
         ORDER BY created_at DESC LIMIT 1`,
        [cleaned, `%[TRACKING:${cleaned}]%`]
      )
      if (res.rows[0]) {
        return this.findOrderById(res.rows[0].id)
      }
    }

    return null
  }

  // ==================== PRODUCT REVIEW OPERATIONS ====================
  async getProductReviews(productId?: string): Promise<ProductReview[]> {
    const reviewMap = new Map<string, ProductReview>()

    // 1. Seed from memory cache first
    if (productId) {
      for (const r of this.reviewsMemoryCache.get(productId) || []) {
        reviewMap.set(r.id, r)
      }
    } else {
      for (const list of this.reviewsMemoryCache.values()) {
        for (const r of list) reviewMap.set(r.id, r)
      }
    }

    // 2. Query dedicated product_reviews table via Supabase
    try {
      let query = this.supabase
        .from('product_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250)

      if (productId) {
        query = query.eq('product_id', productId)
      }

      const { data, error } = await query
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const mapped = this.mapProductReview(row)
          reviewMap.set(mapped.id, mapped)
        }
      }
    } catch {
      // Fallback to pool / events
    }

    // 3. Query via PostgreSQL pool if available
    if (this.pool && reviewMap.size === 0) {
      try {
        const sql = productId
          ? 'SELECT * FROM public.product_reviews WHERE product_id = $1 ORDER BY created_at DESC LIMIT 100'
          : 'SELECT * FROM public.product_reviews ORDER BY created_at DESC LIMIT 250'
        const params = productId ? [productId] : []
        const res = await this.pool.query(sql, params)
        for (const row of res.rows) {
          const mapped = this.mapProductReview(row)
          reviewMap.set(mapped.id, mapped)
        }
      } catch {
        // Ignore if table not yet created
      }
    }

    // 4. Check public.events fallback (category = 'PRODUCT_REVIEW')
    try {
      let evQuery = this.supabase
        .from('events')
        .select('*')
        .eq('category', 'PRODUCT_REVIEW')
        .order('created_at', { ascending: false })
        .limit(200)

      if (productId) {
        evQuery = evQuery.eq('location', productId)
      }

      const { data: evRows } = await evQuery
      for (const ev of evRows || []) {
        if (ev.description && !reviewMap.has(ev.id)) {
          try {
            const parsed = JSON.parse(ev.description)
            const mapped = this.mapProductReview({ ...parsed, id: ev.id })
            if (!productId || mapped.productId === productId) {
              reviewMap.set(mapped.id, mapped)
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      // Ignore
    }

    return Array.from(reviewMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  async createProductReview(input: {
    productId: string
    userId?: string | null
    reviewerName: string
    reviewerEmail?: string | null
    rating: number
    title?: string | null
    comment: string
    images?: string[]
  }): Promise<ProductReview> {
    const id = `rev_${crypto.randomUUID()}`
    const nowIso = new Date().toISOString()
    const cleanRating = Math.min(5, Math.max(1, Math.round(Number(input.rating || 5))))
    const cleanImages = Array.isArray(input.images)
      ? input.images.filter(Boolean).slice(0, 6)
      : []

    const reviewObj: ProductReview = {
      id,
      productId: input.productId,
      userId: input.userId || null,
      reviewerName: (input.reviewerName || 'Verified Customer').trim(),
      reviewerEmail: input.reviewerEmail ? input.reviewerEmail.trim() : null,
      rating: cleanRating,
      title: input.title ? input.title.trim() : null,
      comment: input.comment.trim(),
      images: cleanImages,
      verifiedPurchase: true,
      createdAt: new Date(nowIso),
      updatedAt: new Date(nowIso)
    }

    const existingList = this.reviewsMemoryCache.get(input.productId) || []
    this.reviewsMemoryCache.set(input.productId, [reviewObj, ...existingList])

    let persistedToTable = false

    // 1. Insert into public.product_reviews via Supabase
    try {
      const { error } = await this.supabase.from('product_reviews').insert({
        id: reviewObj.id,
        product_id: reviewObj.productId,
        user_id: reviewObj.userId,
        reviewer_name: reviewObj.reviewerName,
        reviewer_email: reviewObj.reviewerEmail,
        rating: reviewObj.rating,
        title: reviewObj.title,
        comment: reviewObj.comment,
        images: reviewObj.images,
        verified_purchase: true,
        created_at: nowIso,
        updated_at: nowIso
      })
      if (!error) persistedToTable = true
    } catch {
      // Fallback below
    }

    // 2. Fallback via PostgreSQL pool
    if (!persistedToTable && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO public.product_reviews
           (id, product_id, user_id, reviewer_name, reviewer_email, rating, title, comment, images, verified_purchase, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            reviewObj.id,
            reviewObj.productId,
            reviewObj.userId,
            reviewObj.reviewerName,
            reviewObj.reviewerEmail,
            reviewObj.rating,
            reviewObj.title,
            reviewObj.comment,
            reviewObj.images,
            nowIso
          ]
        )
        persistedToTable = true
      } catch {
        // Fallback to events table below
      }
    }

    // 3. Mirror in public.events (category = 'PRODUCT_REVIEW') for zero-downtime persistence
    try {
      await this.supabase.from('events').upsert({
        id: reviewObj.id,
        title: `REVIEW:${reviewObj.productId}:${reviewObj.reviewerName}`,
        description: JSON.stringify(reviewObj),
        date: nowIso.slice(0, 10),
        time: nowIso,
        location: reviewObj.productId,
        category: 'PRODUCT_REVIEW',
        status: 'upcoming',
        updated_at: nowIso
      }, { onConflict: 'id' })
    } catch {
      // Non-fatal
    }

    // 4. Update product aggregate review count & rating
    try {
      const prod = await this.findProductById(input.productId)
      if (prod) {
        const prevCount = Math.max(0, Number(prod.reviews || 0))
        const prevRating = Number(prod.rating || 0)
        const nextCount = prevCount + 1
        const nextRating = Number(((prevRating * prevCount + cleanRating) / nextCount).toFixed(2))
        await this.supabase
          .from('products')
          .update({
            reviews: nextCount,
            rating: Math.min(5, Math.max(1, nextRating)),
            updated_at: nowIso
          })
          .eq('id', input.productId)
      }
    } catch {
      // Non-fatal
    }

    return reviewObj
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    return this.updateOrderPaymentAndStatus(id, { status: status as Order['status'] })
  }

  async updateOrderPaymentAndStatus(
    id: string,
    updates: {
      status?: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
      paymentStatus?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
      paymentVerified?: boolean
    }
  ): Promise<Order> {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    if (updates.status !== undefined) payload.status = updates.status
    if (updates.paymentStatus !== undefined) payload.payment_status = updates.paymentStatus
    if (updates.paymentVerified !== undefined) payload.payment_verified = updates.paymentVerified

    const { data, error } = await this.supabase
      .from('orders')
      .update(payload)
      .eq('id', id)
      .select('*, order_items(*, products(*)), users(*), shipping_address:addresses!orders_shipping_address_id_fkey(*)')
      .single()

    if (error && updates.paymentVerified !== undefined) {
      delete payload.payment_verified
      const retry = await this.supabase
        .from('orders')
        .update(payload)
        .eq('id', id)
        .select('*, order_items(*, products(*)), users(*), shipping_address:addresses!orders_shipping_address_id_fkey(*)')
        .single()
      if (retry.error) throw retry.error
      return this.mapOrder(retry.data)
    }

    if (error) throw error
    return this.mapOrder(data)
  }

  async getOrderCount(filter?: { status?: string; userId?: string }): Promise<number> {
    let query = this.supabase.from('orders').select('*', { count: 'exact', head: true })
    if (filter?.status) query = query.eq('status', filter.status)
    if (filter?.userId) query = query.eq('user_id', filter.userId)

    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }

  async getTotalRevenue(): Promise<number> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('total')
      .eq('payment_status', 'COMPLETED')

    if (error) throw error
    return (data || []).reduce((acc, curr) => acc + Number(curr.total || 0), 0)
  }

  // ==================== ADDRESS OPERATIONS ====================
  async createAddress(addressData: any): Promise<Address> {
    const id = crypto.randomUUID()
    if (addressData.isDefault) {
      await this.supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', addressData.userId)
        .eq('type', addressData.type)
    }

    const { data, error } = await this.supabase
      .from('addresses')
      .insert({
        id,
        user_id: addressData.userId,
        type: addressData.type,
        first_name: addressData.firstName,
        last_name: addressData.lastName,
        company: addressData.company,
        address1: addressData.address1,
        address2: addressData.address2,
        city: addressData.city,
        state: addressData.state,
        zip_code: addressData.zipCode || addressData.postalCode || '',
        country: addressData.country || 'United States',
        phone: addressData.phone,
        is_default: addressData.isDefault ?? false
      })
      .select()
      .single()

    if (error || !data) throw error || new Error('Failed to create address')
    return this.mapAddress(data)
  }

  async findAddressesByUserId(userId: string): Promise<Address[]> {
    const { data, error } = await this.supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching user addresses:', error.message)
    }

    return (data || []).map(a => this.mapAddress(a))
  }

  async findAddressById(id: string, userId?: string): Promise<Address | null> {
    let q = this.supabase.from('addresses').select('*').eq('id', id)
    if (userId) q = q.eq('user_id', userId)
    const { data, error } = await q.maybeSingle()
    if (error) throw error
    return data ? this.mapAddress(data) : null
  }

  async updateAddress(id: string, updateData: any): Promise<Address> {
    const payload: any = { updated_at: new Date().toISOString() }
    if (updateData.firstName !== undefined) payload.first_name = updateData.firstName
    if (updateData.lastName !== undefined) payload.last_name = updateData.lastName
    if (updateData.company !== undefined) payload.company = updateData.company
    if (updateData.address1 !== undefined) payload.address1 = updateData.address1
    if (updateData.address2 !== undefined) payload.address2 = updateData.address2
    if (updateData.city !== undefined) payload.city = updateData.city
    if (updateData.state !== undefined) payload.state = updateData.state
    if (updateData.postalCode !== undefined) payload.zip_code = updateData.postalCode
    if (updateData.country !== undefined) payload.country = updateData.country
    if (updateData.phone !== undefined) payload.phone = updateData.phone
    if (updateData.isDefault !== undefined) payload.is_default = updateData.isDefault

    const { data, error } = await this.supabase
      .from('addresses')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) throw error || new Error('Failed to update address')
    return this.mapAddress(data)
  }

  async deleteAddress(id: string): Promise<void> {
    const { error } = await this.supabase.from('addresses').delete().eq('id', id)
    if (error) throw error
  }

  async unsetDefaultAddresses(userId: string, type: string): Promise<void> {
    await this.supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('type', type)
  }

  async getUserCount(): Promise<number> {
    const { count, error } = await this.supabase.from('users').select('*', { count: 'exact', head: true })
    if (error) throw error
    return count ?? 0
  }

  // ==================== REAL-TIME LIVECHAT & SUPPORT OPERATIONS ====================
  private supportMemoryCache: Map<string, any> = new Map()

  private formatRelativePresence(lastSeenIso?: string, explicitOnline?: boolean): { isOnline: boolean; lastSeenText: string } {
    if (!lastSeenIso) {
      return { isOnline: false, lastSeenText: 'Offline' }
    }
    const lastMs = new Date(lastSeenIso).getTime()
    const diffSec = Math.max(0, Math.floor((Date.now() - lastMs) / 1000))
    const isCurrentlyOnline = Boolean(explicitOnline) && diffSec <= 50

    if (isCurrentlyOnline) {
      return { isOnline: true, lastSeenText: 'Online now' }
    }
    if (diffSec < 60) {
      return { isOnline: false, lastSeenText: 'Last online just now' }
    }
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) {
      return { isOnline: false, lastSeenText: `Last online ~${diffMin}m ago` }
    }
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) {
      return { isOnline: false, lastSeenText: `Last online ~${diffHours}h ago` }
    }
    const diffDays = Math.floor(diffHours / 24)
    return { isOnline: false, lastSeenText: `Last online ~${diffDays}d ago` }
  }

  private formatRegisteredFullName(userRecord: any): string {
    if (!userRecord) return ''
    return `${userRecord.firstName || userRecord.first_name || ''} ${userRecord.lastName || userRecord.last_name || ''}`.trim()
  }

  private isGenericVisitorName(name?: string | null): boolean {
    const clean = String(name || '').trim().toLowerCase()
    return !clean || clean === 'store visitor' || clean === 'visitor' || clean === 'guest'
  }

  private applyRegisteredUserToSession(
    session: any,
    userRecord: any,
    explicitOverrides?: { visitorName?: string; visitorEmail?: string; visitorPhone?: string }
  ): void {
    if (!session || !userRecord?.id) return
    session.userId = userRecord.id

    const regName = this.formatRegisteredFullName(userRecord)
    const regEmail = String(userRecord.email || '').trim()
    const regPhone = String(userRecord.phone || '').trim()

    if (regName && (this.isGenericVisitorName(session.visitorName) || !explicitOverrides?.visitorName)) {
      session.visitorName = regName
    } else if (explicitOverrides?.visitorName) {
      session.visitorName = explicitOverrides.visitorName
    }

    if (regEmail) {
      session.visitorEmail = regEmail
    } else if (explicitOverrides?.visitorEmail) {
      session.visitorEmail = explicitOverrides.visitorEmail
    }

    if (explicitOverrides?.visitorPhone) {
      session.visitorPhone = explicitOverrides.visitorPhone
    } else if (regPhone && !session.visitorPhone) {
      session.visitorPhone = regPhone
    }
  }

  private enrichSupportSession(session: any): any {
    const presence = this.formatRelativePresence(session.lastSeenAt, session.isOnline)
    const messages = Array.isArray(session.messages) ? session.messages : []
    const aiMode = session.aiMode || messages[0]?.metadata?.aiMode || 'AUTO'
    const recentAdminMsg = messages
      .slice()
      .reverse()
      .find((m: any) => m.senderRole === 'ADMIN')
    const adminWithinCooldown =
      Boolean(recentAdminMsg) &&
      Date.now() - new Date(recentAdminMsg.createdAt).getTime() < 30 * 60 * 1000

    const aiPaused =
      session.status === 'RESOLVED'
        ? false
        : aiMode === 'PAUSED'
        ? true
        : aiMode === 'ACTIVE'
        ? false
        : adminWithinCooldown

    return {
      ...session,
      isOnline: presence.isOnline,
      lastSeenText: presence.lastSeenText,
      isRegisteredUser: Boolean(session.userId),
      aiPaused,
      selectedProducts: Array.isArray(session.selectedProducts) ? session.selectedProducts : [],
      messages
    }
  }

  async findSupportSessionByUserId(userId: string, email?: string): Promise<any | null> {
    if (!userId && !email) return null
    const normalizedEmail = email ? email.trim().toLowerCase() : ''

    // 1. Check dedicated support_sessions table by user_id, then email
    try {
      if (userId) {
        const { data: byUser } = await this.supabase
          .from('support_sessions')
          .select('id')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (byUser?.id) {
          const loaded = await this.getSupportSession(byUser.id)
          if (loaded) return loaded
        }
      }

      if (normalizedEmail) {
        const { data: byEmail } = await this.supabase
          .from('support_sessions')
          .select('id')
          .ilike('visitor_email', normalizedEmail)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (byEmail?.id) {
          const loaded = await this.getSupportSession(byEmail.id)
          if (loaded) return loaded
        }
      }
    } catch {
      // Fallback below
    }

    // 2. Check memory cache
    const cacheCandidates = Array.from(this.supportMemoryCache.values())
      .filter((s: any) =>
        (userId && s.userId === userId) ||
        (normalizedEmail && String(s.visitorEmail || '').trim().toLowerCase() === normalizedEmail)
      )
      .sort((a: any, b: any) =>
        new Date(b.updatedAt || b.lastSeenAt || 0).getTime() - new Date(a.updatedAt || a.lastSeenAt || 0).getTime()
      )
    if (cacheCandidates.length > 0) {
      return this.enrichSupportSession(cacheCandidates[0])
    }

    // 3. Check events fallback
    try {
      const { data: evRows } = await this.supabase
        .from('events')
        .select('*')
        .eq('category', 'LIVECHAT_SESSION')
        .order('updated_at', { ascending: false })
        .limit(100)

      for (const ev of evRows || []) {
        if (!ev.description) continue
        try {
          const parsed = JSON.parse(ev.description)
          const emailMatch =
            normalizedEmail && String(parsed.visitorEmail || '').trim().toLowerCase() === normalizedEmail
          if ((userId && parsed.userId === userId) || emailMatch) {
            this.supportMemoryCache.set(parsed.id, parsed)
            return this.enrichSupportSession(parsed)
          }
        } catch {
          // Ignore malformed JSON
        }
      }
    } catch {
      // Ignore
    }

    return null
  }

  private async persistSupportSessionToDb(session: any): Promise<void> {
    this.supportMemoryCache.set(session.id, session)

    // 1. Try dedicated support_sessions & support_messages tables first
    try {
      const { error: sessionErr } = await this.supabase
        .from('support_sessions')
        .upsert({
          id: session.id,
          visitor_id: session.visitorId || session.id,
          user_id: session.userId || null,
          visitor_name: session.visitorName || 'Store Visitor',
          visitor_email: session.visitorEmail || null,
          visitor_phone: session.visitorPhone || null,
          topic: session.topic || 'General Inquiry',
          selected_products: session.selectedProducts || [],
          status: session.status || 'OPEN',
          is_online: Boolean(session.isOnline),
          last_seen_at: session.lastSeenAt || new Date().toISOString(),
          unread_admin_count: Number(session.unreadAdminCount || 0),
          unread_client_count: Number(session.unreadClientCount || 0),
          created_at: session.createdAt || new Date().toISOString(),
          updated_at: session.updatedAt || new Date().toISOString()
        }, { onConflict: 'id' })

      if (!sessionErr) {
        const validMessages = Array.isArray(session.messages)
          ? session.messages.filter((m: any) => m && m.id)
          : []

        if (validMessages.length === 0) {
          return
        }

        const messageRows = validMessages.map((m: any) => ({
          id: m.id,
          session_id: session.id,
          sender_role: m.senderRole || 'CLIENT',
          sender_name: m.senderName || session.visitorName || 'Store Visitor',
          content: m.content || '',
          metadata: m.metadata || {},
          created_at: m.createdAt || new Date().toISOString()
        }))

        const { error: msgErr } = await this.supabase
          .from('support_messages')
          .upsert(messageRows, { onConflict: 'id' })

        if (!msgErr) {
          return
        }
      }
    } catch {
      // Fallback to public.events below
    }

    // 2. Fallback persistence in public.events (category = 'LIVECHAT_SESSION') so full history persists cleanly
    try {
      const todayDate = new Date().toISOString().slice(0, 10)
      await this.supabase
        .from('events')
        .upsert({
          id: session.id,
          title: `LIVECHAT:${session.visitorName || 'Visitor'} (${session.topic || 'General Inquiry'})`,
          description: JSON.stringify(session),
          date: todayDate,
          time: session.lastSeenAt || new Date().toISOString(),
          location: session.userId || session.visitorEmail || session.visitorId || session.id,
          category: 'LIVECHAT_SESSION',
          status: session.status === 'RESOLVED' ? 'past' : 'upcoming',
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
    } catch (err) {
      console.warn('Support chat DB persistence fallback notice:', err)
    }
  }

  async getSupportSession(sessionId: string): Promise<any | null> {
    if (!sessionId) return null

    // 1. Check dedicated support_sessions table
    try {
      const { data: row, error } = await this.supabase
        .from('support_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()

      if (!error && row) {
        const { data: msgRows } = await this.supabase
          .from('support_messages')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })

        const built = {
          id: row.id,
          visitorId: row.visitor_id,
          userId: row.user_id || undefined,
          visitorName: row.visitor_name || 'Store Visitor',
          visitorEmail: row.visitor_email || '',
          visitorPhone: row.visitor_phone || '',
          topic: row.topic || 'General Inquiry',
          selectedProducts: Array.isArray(row.selected_products) ? row.selected_products : [],
          status: row.status || 'OPEN',
          isOnline: Boolean(row.is_online),
          lastSeenAt: row.last_seen_at || row.updated_at || new Date().toISOString(),
          unreadAdminCount: Number(row.unread_admin_count || 0),
          unreadClientCount: Number(row.unread_client_count || 0),
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
          messages: (msgRows || []).map((m: any) => ({
            id: m.id,
            sessionId: m.session_id,
            senderRole: m.sender_role,
            senderName: m.sender_name,
            content: m.content,
            metadata: m.metadata || {},
            createdAt: m.created_at
          }))
        }
        if (built.userId && (this.isGenericVisitorName(built.visitorName) || !built.visitorEmail)) {
          const matchedUser = await this.findUserById(built.userId).catch(() => null)
          if (matchedUser) {
            this.applyRegisteredUserToSession(built, matchedUser)
          }
        }
        this.supportMemoryCache.set(sessionId, built)
        return this.enrichSupportSession(built)
      }
    } catch {
      // Fallback
    }

    // 2. Check public.events fallback table
    try {
      const { data: evRow } = await this.supabase
        .from('events')
        .select('*')
        .eq('id', sessionId)
        .eq('category', 'LIVECHAT_SESSION')
        .maybeSingle()

      if (evRow && evRow.description) {
        const parsed = JSON.parse(evRow.description)
        this.supportMemoryCache.set(sessionId, parsed)
        return this.enrichSupportSession(parsed)
      }
    } catch {
      // Ignore parse error
    }

    // 3. Check memory cache
    const cached = this.supportMemoryCache.get(sessionId)
    return cached ? this.enrichSupportSession(cached) : null
  }

  async listSupportSessions(): Promise<any[]> {
    const sessionMap = new Map<string, any>()

    for (const [k, v] of this.supportMemoryCache.entries()) {
      sessionMap.set(k, v)
    }

    // 1. Load from dedicated support_sessions table if present
    try {
      const { data: rows, error } = await this.supabase
        .from('support_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100)

      if (!error && Array.isArray(rows) && rows.length > 0) {
        const sessionIds = rows.map((r: any) => r.id)
        const { data: allMsgs } = await this.supabase
          .from('support_messages')
          .select('*')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: true })

        const msgsBySession = new Map<string, any[]>()
        for (const m of allMsgs || []) {
          const list = msgsBySession.get(m.session_id) || []
          list.push({
            id: m.id,
            sessionId: m.session_id,
            senderRole: m.sender_role,
            senderName: m.sender_name,
            content: m.content,
            metadata: m.metadata || {},
            createdAt: m.created_at
          })
          msgsBySession.set(m.session_id, list)
        }

        for (const row of rows) {
          const built = {
            id: row.id,
            visitorId: row.visitor_id,
            userId: row.user_id || undefined,
            visitorName: row.visitor_name || 'Store Visitor',
            visitorEmail: row.visitor_email || '',
            visitorPhone: row.visitor_phone || '',
            topic: row.topic || 'General Inquiry',
            selectedProducts: Array.isArray(row.selected_products) ? row.selected_products : [],
            status: row.status || 'OPEN',
            isOnline: Boolean(row.is_online),
            lastSeenAt: row.last_seen_at || row.updated_at || new Date().toISOString(),
            unreadAdminCount: Number(row.unread_admin_count || 0),
            unreadClientCount: Number(row.unread_client_count || 0),
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString(),
            messages: msgsBySession.get(row.id) || []
          }
          sessionMap.set(row.id, built)
          this.supportMemoryCache.set(row.id, built)
        }
      }
    } catch {
      // Fallback
    }

    // 2. Load from public.events fallback table
    try {
      const { data: evRows } = await this.supabase
        .from('events')
        .select('*')
        .eq('category', 'LIVECHAT_SESSION')
        .order('updated_at', { ascending: false })
        .limit(100)

      for (const ev of evRows || []) {
        if (ev.description && !sessionMap.has(ev.id)) {
          try {
            const parsed = JSON.parse(ev.description)
            sessionMap.set(ev.id, parsed)
            this.supportMemoryCache.set(ev.id, parsed)
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      // Ignore
    }

    const hydrated = Array.from(sessionMap.values())
    const userCache = new Map<string, any>()
    for (const sess of hydrated) {
      if (sess.userId && (this.isGenericVisitorName(sess.visitorName) || !sess.visitorEmail)) {
        let matchedUser = userCache.get(sess.userId)
        if (matchedUser === undefined) {
          matchedUser = await this.findUserById(sess.userId).catch(() => null)
          userCache.set(sess.userId, matchedUser)
        }
        if (matchedUser) {
          this.applyRegisteredUserToSession(sess, matchedUser)
        }
      }
    }

    return hydrated
      .map(s => this.enrichSupportSession(s))
      .sort((a, b) => new Date(b.updatedAt || b.lastSeenAt).getTime() - new Date(a.updatedAt || a.lastSeenAt).getTime())
  }

  async upsertSupportSession(payload: {
    sessionId?: string
    visitorId?: string
    userId?: string
    registeredUser?: any
    visitorName?: string
    visitorEmail?: string
    visitorPhone?: string
    topic?: string
    selectedProducts?: any[]
    resumeOnly?: boolean
  }): Promise<any | null> {
    const requestedSessionId = payload.sessionId || payload.visitorId || `chat_${crypto.randomUUID()}`
    const nowIso = new Date().toISOString()

    const authUser =
      payload.registeredUser?.id
        ? payload.registeredUser
        : payload.userId
        ? await this.findUserById(payload.userId).catch(() => null)
        : null

    let existing = await this.getSupportSession(requestedSessionId)

    // For registered users, link/resume their canonical account-owned session so history & admin replies follow them across logins/devices
    let canonicalSessionId = requestedSessionId
    if (authUser?.id) {
      const accountSession = await this.findSupportSessionByUserId(authUser.id, authUser.email)
      if (accountSession) {
        if (existing && existing.id !== accountSession.id) {
          const transferableMessages = (existing.messages || []).filter(
            (m: any) => !(m.senderRole === 'AI_ASSISTANT' && m.metadata?.type === 'welcome')
          )
          const existingMsgIds = new Set((accountSession.messages || []).map((m: any) => m.id))
          const mergedMessages = [
            ...(accountSession.messages || []),
            ...transferableMessages
              .filter((m: any) => m.id && !existingMsgIds.has(m.id))
              .map((m: any) => ({ ...m, sessionId: accountSession.id }))
          ].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

          const existingProdIds = new Set((accountSession.selectedProducts || []).map((p: any) => p.id))
          const mergedGuestProducts = [
            ...(accountSession.selectedProducts || []),
            ...((existing.selectedProducts || []).filter((p: any) => p?.id && !existingProdIds.has(p.id)))
          ]
          accountSession.messages = mergedMessages
          accountSession.selectedProducts = mergedGuestProducts
          if (existing.unreadAdminCount) {
            accountSession.unreadAdminCount = Number(accountSession.unreadAdminCount || 0) + Number(existing.unreadAdminCount || 0)
          }
        }
        existing = accountSession
        canonicalSessionId = accountSession.id
      }
    }

    if (payload.resumeOnly && !existing) {
      return null
    }

    const mergedProducts = payload.resumeOnly
      ? (existing?.selectedProducts || payload.selectedProducts || [])
      : payload.selectedProducts !== undefined
      ? payload.selectedProducts
      : (existing?.selectedProducts || [])

    const nextTopic = payload.resumeOnly
      ? (existing?.topic || payload.topic || 'General Inquiry')
      : (payload.topic || existing?.topic || 'General Inquiry')

    const session: any = {
      id: canonicalSessionId,
      visitorId: existing?.visitorId || payload.visitorId || canonicalSessionId,
      userId: authUser?.id || payload.userId || existing?.userId,
      visitorName: payload.visitorName || existing?.visitorName || 'Store Visitor',
      visitorEmail: payload.visitorEmail || existing?.visitorEmail || '',
      visitorPhone: payload.visitorPhone || existing?.visitorPhone || '',
      topic: nextTopic,
      selectedProducts: mergedProducts,
      status: existing?.status || 'OPEN',
      isOnline: true,
      lastSeenAt: nowIso,
      unreadAdminCount: existing?.unreadAdminCount || 0,
      unreadClientCount: existing?.unreadClientCount || 0,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      messages: existing?.messages || []
    }

    if (authUser) {
      this.applyRegisteredUserToSession(session, authUser, {
        visitorName: payload.visitorName,
        visitorEmail: payload.visitorEmail,
        visitorPhone: payload.visitorPhone
      })
    }

    // Seed welcome message if new session
    if (session.messages.length === 0) {
      const welcomeMsg = {
        id: `msg_${crypto.randomUUID()}`,
        sessionId: canonicalSessionId,
        senderRole: 'AI_ASSISTANT',
        senderName: 'DriveFlyElectric Concierge',
        content: `Welcome to DriveFlyElectric Support! Select an inquiry topic above (Payment Issue, Item Purchase, General Inquiry, or Shipping Issue) or pick the rigs you're looking to buy today from our catalogue, and I'll assist you immediately or connect you with a live specialist.`,
        metadata: { type: 'welcome' },
        createdAt: nowIso
      }
      session.messages.push(welcomeMsg)
    }

    await this.persistSupportSessionToDb(session)
    return this.enrichSupportSession(session)
  }

  async updateSupportPresence(sessionId: string, isOnline: boolean, visitorMeta?: { visitorName?: string; visitorEmail?: string; currentPath?: string }): Promise<any | null> {
    const existing = await this.getSupportSession(sessionId)
    if (!existing) return null

    const nowIso = new Date().toISOString()
    existing.isOnline = Boolean(isOnline)
    existing.lastSeenAt = nowIso
    if (visitorMeta?.visitorName && !this.isGenericVisitorName(visitorMeta.visitorName)) {
      existing.visitorName = visitorMeta.visitorName
    }
    if (visitorMeta?.visitorEmail && !existing.userId) {
      existing.visitorEmail = visitorMeta.visitorEmail
    }

    await this.persistSupportSessionToDb(existing)
    return this.enrichSupportSession(existing)
  }

  async markSupportSessionRead(sessionId: string, readerRole: 'ADMIN' | 'CLIENT'): Promise<any | null> {
    const existing = await this.getSupportSession(sessionId)
    if (!existing) return null

    if (readerRole === 'ADMIN') {
      existing.unreadAdminCount = 0
    } else {
      existing.unreadClientCount = 0
    }
    await this.persistSupportSessionToDb(existing)
    return this.enrichSupportSession(existing)
  }

  async setSupportSessionAiMode(sessionId: string, aiPaused: boolean): Promise<any | null> {
    const existing = await this.getSupportSession(sessionId)
    if (!existing) return null

    const nextMode = aiPaused ? 'PAUSED' : 'ACTIVE'
    existing.aiMode = nextMode
    if (Array.isArray(existing.messages) && existing.messages.length > 0) {
      existing.messages[0] = {
        ...existing.messages[0],
        metadata: {
          ...(existing.messages[0].metadata || {}),
          aiMode: nextMode
        }
      }
    }
    existing.updatedAt = new Date().toISOString()
    await this.persistSupportSessionToDb(existing)
    return this.enrichSupportSession(existing)
  }

  async updateSupportSessionStatus(sessionId: string, status: 'OPEN' | 'RESOLVED'): Promise<any | null> {
    const existing = await this.getSupportSession(sessionId)
    if (!existing) return null

    existing.status = status
    if (status === 'RESOLVED') {
      existing.unreadAdminCount = 0
      existing.aiMode = 'AUTO'
      if (Array.isArray(existing.messages) && existing.messages.length > 0 && existing.messages[0]?.metadata?.aiMode) {
        existing.messages[0] = {
          ...existing.messages[0],
          metadata: {
            ...existing.messages[0].metadata,
            aiMode: 'AUTO'
          }
        }
      }
    }
    existing.updatedAt = new Date().toISOString()
    await this.persistSupportSessionToDb(existing)
    return this.enrichSupportSession(existing)
  }

  async generateIntelligentSupportReply(session: any, clientMessage: string): Promise<string> {
    const lowerMsg = (clientMessage || '').toLowerCase()
    const topic = session.topic || 'General Inquiry'
    const selectedProducts: any[] = Array.isArray(session.selectedProducts) ? session.selectedProducts : []

    // Detect if the user provided an email or phone inside their message for lead acquisition
    const emailMatch = clientMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    const phoneMatch = clientMessage.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
    let capturedContactNote = ''
    if (emailMatch && !session.visitorEmail) {
      session.visitorEmail = emailMatch[0]
      capturedContactNote = `Thank you! We have saved your email (${session.visitorEmail}) to this support ticket so our specialist team can send you direct updates and invoices. `
    }
    if (phoneMatch && !session.visitorPhone) {
      session.visitorPhone = phoneMatch[0]
      capturedContactNote += `We also logged your phone number (${session.visitorPhone}) for priority dispatch updates. `
    }

    // Load live catalog products to match product inquiries accurately
    let catalogProducts: Product[] = []
    try {
      catalogProducts = await this.findProducts({ limit: 100 })
    } catch {
      catalogProducts = []
    }

    // Match any product mentioned by name, category, or in selectedProducts
    const matchedProducts: Product[] = []
    for (const sp of selectedProducts) {
      const found = catalogProducts.find(p => p.id === sp.id || p.sku === sp.sku)
      if (found && !matchedProducts.some(m => m.id === found.id)) {
        matchedProducts.push(found)
      }
    }
    for (const prod of catalogProducts) {
      const pName = (prod.name || '').toLowerCase()
      const pCat = (prod.category || '').toLowerCase()
      if (
        (lowerMsg.includes('heli') && pCat.includes('heli')) ||
        (lowerMsg.includes('microcar') && pCat.includes('micro')) ||
        (lowerMsg.includes('jeep') && pName.includes('jeep')) ||
        (lowerMsg.includes('trike') && pCat.includes('trike')) ||
        (lowerMsg.includes('kart') && pCat.includes('kart')) ||
        (lowerMsg.includes('dirt') && pCat.includes('dirt')) ||
        (pName.length > 5 && lowerMsg.includes(pName.slice(0, 12)))
      ) {
        if (!matchedProducts.some(m => m.id === prod.id)) {
          matchedProducts.push(prod)
        }
      }
    }

    const contactPrompt = !session.visitorEmail
      ? `\n\n💡 Tip: Please share your email address or phone number in this chat (or in the contact bar above) so our specialist can send you an official spec sheet, custom quote, or direct payment link.`
      : `\n\n✅ Our live support team has also been notified and can reply directly in this chat window at any moment.`

    // 1. Handle Topic: Payment Issue
    if (topic === 'Payment Issue' || lowerMsg.includes('payment') || lowerMsg.includes('stripe') || lowerMsg.includes('paypal') || lowerMsg.includes('card') || lowerMsg.includes('declin')) {
      const totalSelected = matchedProducts.reduce((sum, p) => sum + Number(p.price || 0), 0)
      const selectedSummary = matchedProducts.length > 0
        ? `\n• Selected Rig(s): ${matchedProducts.map(p => `${p.name} ($${Number(p.price).toLocaleString()} USD)`).join(', ')} — Subtotal: $${totalSelected.toLocaleString()} USD.`
        : ''
      return `${capturedContactNote}💳 **DriveFlyElectric Payment Support**:\n• We accept **Stripe Instant Card** (Visa, Mastercard, Amex, Discover) and **PayPal Express Checkout** in USD ($).${selectedSummary}\n• If your card is declined on high-value rigs (such as MiniHeliCopters or Microcars), it is usually a bank 3D-Secure or daily limit hold—authorizing the transaction with your bank or choosing **PayPal** at checkout resolves it immediately.\n• Every completed checkout automatically generates an official **DriveFlyElectric PDF Purchase Receipt** emailed to you immediately.${contactPrompt}`
    }

    // 2. Handle Topic: Shipping Issue
    if (topic === 'Shipping Issue' || lowerMsg.includes('ship') || lowerMsg.includes('deliver') || lowerMsg.includes('track') || lowerMsg.includes('freight') || lowerMsg.includes('warehouse')) {
      const deliveryWindow = matchedProducts[0]?.averageDeliveryTime || '14-25 business days (Global Express Crated Freight)'
      return `${capturedContactNote}🚚 **DriveFlyElectric Shipping & Freight Support**:\n• **100% Free Express Doorstep Shipping** is included on all orders.\n• **Dispatch & Transit Window**: ${deliveryWindow}, with international dispatch coordination from our operations centers.\n• All MiniHeliCopters, Microcars, Go Karts, Trikes, and Dirtbikes ship in reinforced steel-framed crates with full customs clearance and tracking.\n• For instant live freight & tracking assistance, you can also click the **green WhatsApp Support button** at the bottom-right (${getFormattedSupportWhatsApp()}).${contactPrompt}`
    }

    // 3. Handle Matched / Selected Catalogue Items or Item Purchase Inquiry
    if (matchedProducts.length > 0 || topic === 'Item Purchase') {
      if (matchedProducts.length > 0) {
        const lines = matchedProducts.slice(0, 3).map(p => {
          const stockStatus = p.stock > 0 ? `In Stock (${p.stock} units ready)` : 'Built to Order'
          return `• **${p.name}** (SKU: \`${p.sku}\` | Category: ${p.category}) — **$${Number(p.price).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD** | ${stockStatus} | Delivery: ${p.averageDeliveryTime || '14-25 business days'}`
        }).join('\n')

        return `${capturedContactNote}⚡ **DriveFlyElectric Product & Purchase Breakdown**:\n${lines}\n\nYou can add ${matchedProducts.length === 1 ? 'this rig' : 'these rigs'} directly to your cart and complete checkout via Stripe or PayPal with **Free Express Shipping** and a **12-Month Powertrain & Avionics Warranty**. Would you like a specialist to prepare an order or answer a technical question about ${matchedProducts[0].name}?${contactPrompt}`
      }

      return `${capturedContactNote}⚡ **DriveFlyElectric Fleet Purchase Concierge**:\nWe currently stock 5 flagship categories in USD:\n1. **MiniHeliCopters** (Personal Single-Seat & Twin-Rotor Ultralights from $4,800 USD)\n2. **Microcars** (Enclosed Electric Microcars & 200cc Adult Mini Jeep Willys from $850 USD)\n3. **Go Karts** (Off-Road Racing Buggies & Drift Karts)\n4. **Trikes** (3000W Brushless Electric Drift Trikes)\n5. **Dirtbikes** (High-Discharge Lithium Off-Road Trail Bikes)\n\nUse the **"What are you looking to buy today?"** catalogue selector above to pick the exact rig(s) you're interested in!${contactPrompt}`
    }

    // 4. General Inquiry & Store Details Acquisition
    return `${capturedContactNote}🏢 **DriveFlyElectric Store & Support Details**:\n• **Brand**: DriveFlyElectric (https://driveflyelectric.shop)\n• **Fleet Categories**: MiniHeliCopters, Electric Microcars, Go Karts, Electric Drift Trikes & Dirtbikes\n• **Head Office**: Austin, Texas, USA\n• **Official Support Email**: ${getAdminContactEmail()}\n• **WhatsApp Support Line**: ${getFormattedSupportWhatsApp()}\n• **Warranty & Shipping**: 100% Free Express Shipping + 12-Month Factory Warranty.\n\nHow can we help you with your fleet selection today?${contactPrompt}`
  }

  async appendSupportMessage(
    sessionId: string,
    messageInput: {
      senderRole: 'CLIENT' | 'ADMIN' | 'AI_ASSISTANT'
      senderName?: string
      content: string
      topic?: string
      selectedProducts?: any[]
      userId?: string
      registeredUser?: any
      visitorName?: string
      visitorEmail?: string
      visitorPhone?: string
    }
  ): Promise<{ session: any; newMessages: any[] }> {
    const authUser =
      messageInput.registeredUser?.id
        ? messageInput.registeredUser
        : messageInput.userId
        ? await this.findUserById(messageInput.userId).catch(() => null)
        : null

    let session = await this.getSupportSession(sessionId)
    if (!session) {
      session = await this.upsertSupportSession({
        sessionId,
        userId: authUser?.id || messageInput.userId,
        registeredUser: authUser,
        visitorName: messageInput.visitorName,
        visitorEmail: messageInput.visitorEmail,
        visitorPhone: messageInput.visitorPhone,
        topic: messageInput.topic,
        selectedProducts: messageInput.selectedProducts
      })
    }

    const nowIso = new Date().toISOString()
    if (messageInput.topic) session.topic = messageInput.topic
    if (messageInput.selectedProducts !== undefined) session.selectedProducts = messageInput.selectedProducts
    if (messageInput.visitorName) session.visitorName = messageInput.visitorName
    if (messageInput.visitorEmail) session.visitorEmail = messageInput.visitorEmail
    if (messageInput.visitorPhone) session.visitorPhone = messageInput.visitorPhone

    // Bind & backfill registered customer account profile onto session before writing the message
    const effectiveUser =
      authUser || (session.userId ? await this.findUserById(session.userId).catch(() => null) : null)
    if (effectiveUser) {
      this.applyRegisteredUserToSession(session, effectiveUser, {
        visitorName: messageInput.visitorName,
        visitorEmail: messageInput.visitorEmail,
        visitorPhone: messageInput.visitorPhone
      })
    }

    const primaryMsg = {
      id: `msg_${crypto.randomUUID()}`,
      sessionId: session.id,
      senderRole: messageInput.senderRole,
      senderName:
        messageInput.senderName ||
        (messageInput.senderRole === 'ADMIN'
          ? 'DriveFlyElectric Support Specialist'
          : messageInput.senderRole === 'AI_ASSISTANT'
          ? 'DriveFlyElectric Concierge'
          : session.visitorName || 'Store Visitor'),
      content: messageInput.content,
      metadata: {
        topic: session.topic,
        selectedProductIds: (session.selectedProducts || []).map((p: any) => p.id)
      },
      createdAt: nowIso
    }

    session.messages = [...(session.messages || []), primaryMsg]
    session.updatedAt = nowIso
    session.lastSeenAt = nowIso

    if (messageInput.senderRole === 'CLIENT') {
      session.isOnline = true
      session.status = 'OPEN'
      session.unreadAdminCount = Number(session.unreadAdminCount || 0) + 1
    } else if (messageInput.senderRole === 'ADMIN') {
      session.unreadClientCount = Number(session.unreadClientCount || 0) + 1
      session.unreadAdminCount = 0
      if (session.aiMode === 'ACTIVE' || session.messages?.[0]?.metadata?.aiMode === 'ACTIVE') {
        session.aiMode = 'AUTO'
        if (session.messages?.[0]) {
          session.messages[0] = {
            ...session.messages[0],
            metadata: {
              ...(session.messages[0].metadata || {}),
              aiMode: 'AUTO'
            }
          }
        }
      }
    }

    await this.persistSupportSessionToDb(session)
    const createdList: any[] = [primaryMsg]

    // Generate immediate AI Concierge reply for CLIENT messages unless Admin is actively handling the ticket or explicitly paused AI
    if (messageInput.senderRole === 'CLIENT') {
      const enrichedBeforeAi = this.enrichSupportSession(session)

      if (!enrichedBeforeAi.aiPaused) {
        const aiReplyContent = await this.generateIntelligentSupportReply(session, messageInput.content)
        const aiMsg = {
          id: `msg_${crypto.randomUUID()}`,
          sessionId: session.id,
          senderRole: 'AI_ASSISTANT',
          senderName: 'DriveFlyElectric Intelligent Assistant',
          content: aiReplyContent,
          metadata: { automated: true, topic: session.topic },
          createdAt: new Date(Date.now() + 250).toISOString()
        }
        session.messages = [...session.messages, aiMsg]
        session.updatedAt = aiMsg.createdAt
        await this.persistSupportSessionToDb(session)
        createdList.push(aiMsg)
      }
    }

    return {
      session: this.enrichSupportSession(session),
      newMessages: createdList
    }
  }

  // ==================== COMING SOON PRODUCT BOOKING OPERATIONS ====================
  private bookingsMemoryCache: Map<string, ProductBooking> = new Map()

  public mapProductBooking(raw: any): ProductBooking {
    return {
      id: raw.id,
      productId: raw.product_id || raw.productId,
      userId: raw.user_id || raw.userId || null,
      fullName: raw.full_name || raw.fullName || 'Customer',
      email: raw.email,
      phone: raw.phone || null,
      country: raw.country || 'United States',
      quantity: Number(raw.quantity || 1),
      notes: raw.notes || null,
      status: raw.status || 'PENDING',
      bookingReference: raw.booking_reference || raw.bookingReference,
      createdAt: raw.created_at ? new Date(raw.created_at) : raw.createdAt ? new Date(raw.createdAt) : new Date(),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
      product: raw.products ? this.mapProduct(raw.products) : raw.product
    }
  }

  async createProductBooking(input: {
    productId: string
    userId?: string | null
    fullName: string
    email: string
    phone?: string | null
    country?: string
    quantity?: number
    notes?: string | null
  }): Promise<ProductBooking> {
    const id = `bk_${crypto.randomUUID()}`
    const bookingReference = `BKG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    const nowIso = new Date().toISOString()

    const product = await this.findProductById(input.productId)
    const booking: ProductBooking = {
      id,
      productId: input.productId,
      userId: input.userId || null,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone ? input.phone.trim() : null,
      country: (input.country || 'United States').trim(),
      quantity: Math.min(50, Math.max(1, Math.round(Number(input.quantity || 1)))),
      notes: input.notes ? input.notes.trim() : null,
      status: 'PENDING',
      bookingReference,
      createdAt: new Date(nowIso),
      updatedAt: new Date(nowIso),
      product: product || undefined
    }

    this.bookingsMemoryCache.set(booking.id, booking)

    let persisted = false
    try {
      const { error } = await this.supabase.from('product_bookings').insert({
        id: booking.id,
        product_id: booking.productId,
        user_id: booking.userId,
        full_name: booking.fullName,
        email: booking.email,
        phone: booking.phone,
        country: booking.country,
        quantity: booking.quantity,
        notes: booking.notes,
        status: booking.status,
        booking_reference: booking.bookingReference,
        created_at: nowIso,
        updated_at: nowIso
      })
      if (!error) persisted = true
    } catch {
      // Fallback below
    }

    if (!persisted) {
      try {
        await this.supabase.from('events').upsert({
          id: booking.id,
          title: `BOOKING:${booking.bookingReference}:${booking.productId}`,
          description: JSON.stringify(booking),
          date: nowIso.slice(0, 10),
          time: nowIso,
          location: booking.productId,
          category: 'PRODUCT_BOOKING',
          status: 'upcoming',
          updated_at: nowIso
        }, { onConflict: 'id' })
      } catch {
        // Memory cache already saved
      }
    }

    return booking
  }

  async listProductBookings(): Promise<ProductBooking[]> {
    const map = new Map<string, ProductBooking>()
    for (const [id, bk] of this.bookingsMemoryCache.entries()) {
      map.set(id, bk)
    }

    try {
      const { data, error } = await this.supabase
        .from('product_bookings')
        .select('*, products(*)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const mapped = this.mapProductBooking(row)
          map.set(mapped.id, mapped)
          this.bookingsMemoryCache.set(mapped.id, mapped)
        }
      }
    } catch {
      // Fallback below
    }

    try {
      const { data: evRows } = await this.supabase
        .from('events')
        .select('*')
        .eq('category', 'PRODUCT_BOOKING')
        .order('updated_at', { ascending: false })
        .limit(200)
      for (const ev of evRows || []) {
        if (ev.description && !map.has(ev.id)) {
          try {
            const parsed = this.mapProductBooking(JSON.parse(ev.description))
            map.set(parsed.id, parsed)
            this.bookingsMemoryCache.set(parsed.id, parsed)
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      // Ignore
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  async updateProductBookingStatus(
    id: string,
    status: 'PENDING' | 'CONFIRMED' | 'NOTIFIED' | 'CANCELLED'
  ): Promise<ProductBooking | null> {
    const nowIso = new Date().toISOString()
    try {
      const { data, error } = await this.supabase
        .from('product_bookings')
        .update({ status, updated_at: nowIso })
        .eq('id', id)
        .select('*, products(*)')
        .maybeSingle()

      if (!error && data) {
        const mapped = this.mapProductBooking(data)
        this.bookingsMemoryCache.set(id, mapped)
        return mapped
      }
    } catch {
      // Fallback below
    }

    const existing = (await this.listProductBookings()).find(b => b.id === id)
    if (!existing) return null
    existing.status = status
    existing.updatedAt = new Date(nowIso)
    this.bookingsMemoryCache.set(id, existing)

    await this.supabase
      .from('events')
      .update({
        description: JSON.stringify(existing),
        updated_at: nowIso
      })
      .eq('id', id)
      .eq('category', 'PRODUCT_BOOKING')
      .then(() => {}, () => {})

    return existing
  }

  // ==================== REAL-TIME SYSTEM ACTIVITY PERSISTENCE ====================
  public mapSystemActivity(raw: any): SystemActivityRecord {
    return {
      id: raw.id,
      type: raw.type || 'ORDER_STATUS_UPDATED',
      title: raw.title || '',
      message: raw.message || '',
      userEmail: raw.user_email ?? raw.userEmail ?? undefined,
      orderNumber: raw.order_number ?? raw.orderNumber ?? undefined,
      amount: raw.amount !== null && raw.amount !== undefined ? Number(raw.amount) : undefined,
      metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
      emailDispatched: Boolean(raw.email_dispatched ?? raw.emailDispatched ?? false),
      systemMailDispatched: Boolean(raw.system_mail_dispatched ?? raw.systemMailDispatched ?? false),
      timestamp: raw.created_at || raw.timestamp || new Date().toISOString()
    }
  }

  async recordSystemActivity(activity: SystemActivityRecord): Promise<void> {
    const createdAt = activity.timestamp || new Date().toISOString()

    // 1. Primary persistence in dedicated public.system_activities table
    try {
      const { error } = await this.supabase
        .from('system_activities')
        .upsert({
          id: activity.id,
          type: activity.type,
          title: activity.title,
          message: activity.message,
          user_email: activity.userEmail || null,
          order_number: activity.orderNumber || null,
          amount: activity.amount !== undefined && activity.amount !== null ? Number(activity.amount) : null,
          metadata: activity.metadata || {},
          email_dispatched: Boolean(activity.emailDispatched),
          system_mail_dispatched: Boolean(activity.systemMailDispatched),
          created_at: createdAt
        }, { onConflict: 'id' })

      if (!error) return
    } catch {
      // Fallback below
    }

    // 2. PostgreSQL pool fallback for system_activities
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO public.system_activities
           (id, type, title, message, user_email, order_number, amount, metadata, email_dispatched, system_mail_dispatched, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            activity.id,
            activity.type,
            activity.title,
            activity.message,
            activity.userEmail || null,
            activity.orderNumber || null,
            activity.amount !== undefined && activity.amount !== null ? Number(activity.amount) : null,
            JSON.stringify(activity.metadata || {}),
            Boolean(activity.emailDispatched),
            Boolean(activity.systemMailDispatched),
            createdAt
          ]
        )
        return
      } catch {
        // Fallback to public.events below
      }
    }

    // 3. Zero-downtime fallback in public.events (category = 'SYSTEM_ACTIVITY')
    try {
      await this.supabase
        .from('events')
        .upsert({
          id: activity.id,
          title: `ACTIVITY:${activity.type}:${activity.title.slice(0, 80)}`,
          description: JSON.stringify(activity),
          date: createdAt.slice(0, 10),
          time: createdAt,
          location: activity.orderNumber || activity.userEmail || activity.type,
          category: 'SYSTEM_ACTIVITY',
          status: 'past',
          updated_at: createdAt
        }, { onConflict: 'id' })
    } catch {
      // Non-fatal: in-memory buffer + SSE still live
    }
  }

  async listSystemActivities(limit: number = 50): Promise<SystemActivityRecord[]> {
    const activityMap = new Map<string, SystemActivityRecord>()
    const safeLimit = Math.min(200, Math.max(1, limit))

    // 1. Read from dedicated public.system_activities table
    try {
      const { data, error } = await this.supabase
        .from('system_activities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(safeLimit)

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const mapped = this.mapSystemActivity(row)
          activityMap.set(mapped.id, mapped)
        }
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback via PostgreSQL pool if empty
    if (activityMap.size === 0 && this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM public.system_activities ORDER BY created_at DESC LIMIT $1',
          [safeLimit]
        )
        for (const row of res.rows) {
          const mapped = this.mapSystemActivity(row)
          activityMap.set(mapped.id, mapped)
        }
      } catch {
        // Fallback to events below
      }
    }

    // 3. Fallback / historical records from public.events (category = 'SYSTEM_ACTIVITY')
    if (activityMap.size < safeLimit) {
      try {
        const { data: evRows } = await this.supabase
          .from('events')
          .select('*')
          .eq('category', 'SYSTEM_ACTIVITY')
          .order('time', { ascending: false })
          .limit(safeLimit)

        for (const ev of evRows || []) {
          if (ev.description && !activityMap.has(ev.id)) {
            try {
              const parsed = this.mapSystemActivity(JSON.parse(ev.description))
              activityMap.set(parsed.id, parsed)
            } catch {
              // Skip malformed record
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    return Array.from(activityMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, safeLimit)
  }

  // ==================== UNPAID CART REMINDER SNAPSHOTS ====================
  private deriveCartReminderId(reminderKey: string): string {
    return `cartrem_${crypto.createHash('sha256').update(reminderKey).digest('hex').slice(0, 24)}`
  }

  private buildCartSignature(items: CartReminderItem[]): string {
    return items
      .map((item) => ({ productId: String(item.productId), quantity: Number(item.quantity || 1) }))
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((item) => `${item.productId}:${item.quantity}`)
      .join('|')
  }

  private mapCartReminder(raw: any): CartReminderRecord {
    let parsedItems: CartReminderItem[] = []
    const rawItems = raw.items
    if (Array.isArray(rawItems)) {
      parsedItems = rawItems
    } else if (typeof rawItems === 'string') {
      try {
        const dec = JSON.parse(rawItems)
        if (Array.isArray(dec)) parsedItems = dec
      } catch {
        parsedItems = []
      }
    }

    const rawStages = raw.sent_stages ?? raw.sentStages
    const sentStages = Array.isArray(rawStages)
      ? Array.from(new Set(rawStages.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)))).sort((a, b) => a - b)
      : []

    const nowIso = new Date().toISOString()
    return {
      id: String(raw.id),
      reminderKey: String(raw.reminder_key || raw.reminderKey),
      userId: raw.user_id ?? raw.userId ?? null,
      visitorId: raw.visitor_id ?? raw.visitorId ?? null,
      email: String(raw.email || '').trim().toLowerCase(),
      customerName: raw.customer_name ?? raw.customerName ?? null,
      items: parsedItems.map((it) => ({
        productId: String(it.productId),
        name: String(it.name || 'DriveFlyElectric Vehicle'),
        price: Number(it.price || 0),
        quantity: Math.max(1, Number(it.quantity || 1)),
        image: it.image ? String(it.image) : undefined
      })),
      itemCount: Number(raw.item_count ?? raw.itemCount ?? parsedItems.reduce((s, it) => s + Number(it.quantity || 1), 0)),
      subtotal: Number(raw.subtotal || 0),
      cartSignature: String(raw.cart_signature ?? raw.cartSignature ?? ''),
      status: (raw.status || 'ACTIVE') as CartReminderStatus,
      sentStages,
      lastSentStage: Number(raw.last_sent_stage ?? raw.lastSentStage ?? 0),
      lastRemindedAt: raw.last_reminded_at || raw.lastRemindedAt || null,
      completedOrderNumber: raw.completed_order_number || raw.completedOrderNumber || null,
      cartUpdatedAt: raw.cart_updated_at || raw.cartUpdatedAt || nowIso,
      createdAt: raw.created_at || raw.createdAt || nowIso,
      updatedAt: raw.updated_at || raw.updatedAt || nowIso
    }
  }

  private async persistCartReminderRecord(record: CartReminderRecord): Promise<void> {
    this.cartRemindersMemoryCache.set(record.reminderKey, record)

    let persisted = false
    try {
      const { error } = await this.supabase
        .from('cart_reminders')
        .upsert(
          {
            id: record.id,
            reminder_key: record.reminderKey,
            user_id: record.userId || null,
            visitor_id: record.visitorId || null,
            email: record.email,
            customer_name: record.customerName || null,
            items: record.items,
            item_count: record.itemCount,
            subtotal: record.subtotal,
            cart_signature: record.cartSignature,
            status: record.status,
            sent_stages: record.sentStages,
            last_sent_stage: record.lastSentStage,
            last_reminded_at: record.lastRemindedAt || null,
            completed_order_number: record.completedOrderNumber || null,
            cart_updated_at: record.cartUpdatedAt,
            created_at: record.createdAt,
            updated_at: record.updatedAt
          },
          { onConflict: 'reminder_key' }
        )
      if (!error) persisted = true
    } catch {
      // Fallback below
    }

    if (!persisted && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO public.cart_reminders
           (id, reminder_key, user_id, visitor_id, email, customer_name, items, item_count, subtotal, cart_signature, status, sent_stages, last_sent_stage, last_reminded_at, completed_order_number, cart_updated_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::integer[], $13, $14, $15, $16, $17, $18)
           ON CONFLICT (reminder_key) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             visitor_id = EXCLUDED.visitor_id,
             email = EXCLUDED.email,
             customer_name = EXCLUDED.customer_name,
             items = EXCLUDED.items,
             item_count = EXCLUDED.item_count,
             subtotal = EXCLUDED.subtotal,
             cart_signature = EXCLUDED.cart_signature,
             status = EXCLUDED.status,
             sent_stages = EXCLUDED.sent_stages,
             last_sent_stage = EXCLUDED.last_sent_stage,
             last_reminded_at = EXCLUDED.last_reminded_at,
             completed_order_number = EXCLUDED.completed_order_number,
             cart_updated_at = EXCLUDED.cart_updated_at,
             updated_at = EXCLUDED.updated_at`,
          [
            record.id,
            record.reminderKey,
            record.userId || null,
            record.visitorId || null,
            record.email,
            record.customerName || null,
            JSON.stringify(record.items),
            record.itemCount,
            record.subtotal,
            record.cartSignature,
            record.status,
            record.sentStages,
            record.lastSentStage,
            record.lastRemindedAt || null,
            record.completedOrderNumber || null,
            record.cartUpdatedAt,
            record.createdAt,
            record.updatedAt
          ]
        )
        persisted = true
      } catch {
        // Fallback to public.events below
      }
    }

    if (!persisted) {
      try {
        await this.supabase
          .from('events')
          .upsert(
            {
              id: record.id,
              title: `CART_REMINDER:${record.email}:${record.itemCount}`,
              description: JSON.stringify(record),
              date: record.cartUpdatedAt.slice(0, 10),
              time: record.updatedAt,
              location: record.email,
              category: 'CART_REMINDER',
              status: record.status,
              updated_at: record.updatedAt
            },
            { onConflict: 'id' }
          )
      } catch {
        // Non-fatal: retained in memory cache
      }
    }
  }

  async findCartReminderByKey(reminderKey: string): Promise<CartReminderRecord | null> {
    const cached = this.cartRemindersMemoryCache.get(reminderKey)
    if (cached) return cached

    try {
      const { data, error } = await this.supabase
        .from('cart_reminders')
        .select('*')
        .eq('reminder_key', reminderKey)
        .maybeSingle()
      if (!error && data) {
        const mapped = this.mapCartReminder(data)
        this.cartRemindersMemoryCache.set(mapped.reminderKey, mapped)
        return mapped
      }
    } catch {
      // Fallback below
    }

    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM public.cart_reminders WHERE reminder_key = $1 LIMIT 1',
          [reminderKey]
        )
        if (res.rows[0]) {
          const mapped = this.mapCartReminder(res.rows[0])
          this.cartRemindersMemoryCache.set(mapped.reminderKey, mapped)
          return mapped
        }
      } catch {
        // Fallback below
      }
    }

    try {
      const { data: ev } = await this.supabase
        .from('events')
        .select('description')
        .eq('id', this.deriveCartReminderId(reminderKey))
        .eq('category', 'CART_REMINDER')
        .maybeSingle()
      if (ev?.description) {
        const mapped = this.mapCartReminder(JSON.parse(ev.description))
        this.cartRemindersMemoryCache.set(mapped.reminderKey, mapped)
        return mapped
      }
    } catch {
      // Ignore
    }

    return null
  }

  async upsertCartReminderSnapshot(input: {
    userId?: string | null
    visitorId?: string | null
    email: string
    customerName?: string | null
    items: CartReminderItem[]
    subtotal?: number
  }): Promise<CartReminderRecord | null> {
    const cleanEmail = (input.email || '').trim().toLowerCase()
    if (!isValidEmailAddress(cleanEmail)) return null

    if (!Array.isArray(input.items) || input.items.length === 0) {
      await this.markCartRemindersInactive({
        userId: input.userId || null,
        visitorId: input.visitorId || null,
        email: cleanEmail,
        status: 'CLEARED'
      })
      return null
    }

    const reminderKey = input.userId ? `user:${input.userId}` : `email:${cleanEmail}`
    const nextSignature = this.buildCartSignature(input.items)
    const computedSubtotal =
      input.subtotal !== undefined
        ? Math.round(Number(input.subtotal) * 100) / 100
        : Math.round(
            input.items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 1), 0) * 100
          ) / 100
    const itemCount = input.items.reduce((sum, it) => sum + Math.max(1, Number(it.quantity || 1)), 0)
    const nowIso = new Date().toISOString()

    let existing = await this.findCartReminderByKey(reminderKey)

    // Deduplicate: if a logged-in user previously started a guest reminder with the same email, migrate/close guest row
    if (input.userId) {
      const guestKey = `email:${cleanEmail}`
      const guestRecord = await this.findCartReminderByKey(guestKey)
      if (guestRecord && guestRecord.status === 'ACTIVE') {
        if (!existing && guestRecord.cartSignature === nextSignature) {
          existing = {
            ...guestRecord,
            id: this.deriveCartReminderId(reminderKey),
            reminderKey,
            userId: input.userId
          }
        }
        await this.persistCartReminderRecord({
          ...guestRecord,
          status: 'COMPLETED',
          completedOrderNumber: 'MERGED_ACCOUNT_CART',
          updatedAt: nowIso
        })
      }
    }

    const isUnchangedActiveCart =
      Boolean(existing) &&
      existing!.status === 'ACTIVE' &&
      existing!.cartSignature === nextSignature

    const record: CartReminderRecord = {
      id: existing?.id || this.deriveCartReminderId(reminderKey),
      reminderKey,
      userId: input.userId || existing?.userId || null,
      visitorId: input.visitorId || existing?.visitorId || null,
      email: cleanEmail,
      customerName: (input.customerName || existing?.customerName || '').trim() || null,
      items: input.items,
      itemCount,
      subtotal: computedSubtotal,
      cartSignature: nextSignature,
      status: 'ACTIVE',
      sentStages: isUnchangedActiveCart ? existing!.sentStages : [],
      lastSentStage: isUnchangedActiveCart ? existing!.lastSentStage : 0,
      lastRemindedAt: isUnchangedActiveCart ? existing!.lastRemindedAt || null : null,
      completedOrderNumber: null,
      cartUpdatedAt: isUnchangedActiveCart ? existing!.cartUpdatedAt : nowIso,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso
    }

    await this.persistCartReminderRecord(record)
    return record
  }

  async syncUserCartReminder(userId: string): Promise<void> {
    if (!userId) return
    const [user, cart] = await Promise.all([
      this.findUserById(userId),
      this.findOrCreateCart(userId)
    ])
    if (!user?.email || !isValidEmailAddress(user.email)) return

    const items: CartReminderItem[] = (cart.items || [])
      .filter((ci: any) => ci.product && ci.product.isActive !== false && !ci.product.isComingSoon)
      .map((ci: any) => ({
        productId: String(ci.productId),
        name: String(ci.product?.name || 'DriveFlyElectric Vehicle'),
        price: Number(ci.product?.price || 0),
        quantity: Math.max(1, Number(ci.quantity || 1)),
        image: Array.isArray(ci.product?.images) && ci.product.images[0] ? String(ci.product.images[0]) : undefined
      }))

    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || null
    await this.upsertCartReminderSnapshot({
      userId,
      email: user.email,
      customerName: fullName,
      items
    })
  }

  async markCartRemindersInactive(criteria: {
    userId?: string | null
    visitorId?: string | null
    email?: string | null
    emails?: Array<string | undefined | null>
    status: 'COMPLETED' | 'CLEARED' | 'EXPIRED'
    orderNumber?: string
  }): Promise<void> {
    const emailList = Array.from(
      new Set(
        [criteria.email, ...(criteria.emails || [])]
          .map((e) => (e || '').trim().toLowerCase())
          .filter((e) => isValidEmailAddress(e))
      )
    )
    const userId = criteria.userId ? String(criteria.userId).trim() : ''
    const visitorId = criteria.visitorId ? String(criteria.visitorId).trim() : ''
    if (!userId && !visitorId && emailList.length === 0) return

    const nowIso = new Date().toISOString()
    const keysToCheck = new Set<string>()
    if (userId) keysToCheck.add(`user:${userId}`)
    for (const em of emailList) keysToCheck.add(`email:${em}`)

    for (const key of keysToCheck) {
      const rec = await this.findCartReminderByKey(key)
      if (rec && rec.status === 'ACTIVE') {
        await this.persistCartReminderRecord({
          ...rec,
          status: criteria.status,
          completedOrderNumber: criteria.orderNumber || rec.completedOrderNumber || null,
          updatedAt: nowIso
        })
      }
    }

    for (const [key, rec] of this.cartRemindersMemoryCache.entries()) {
      if (rec.status !== 'ACTIVE') continue
      const matchesUser = Boolean(userId && rec.userId === userId)
      const matchesVisitor = Boolean(visitorId && rec.visitorId === visitorId)
      const matchesEmail = emailList.includes(rec.email.toLowerCase())
      if (matchesUser || matchesVisitor || matchesEmail) {
        await this.persistCartReminderRecord({
          ...rec,
          status: criteria.status,
          completedOrderNumber: criteria.orderNumber || rec.completedOrderNumber || null,
          updatedAt: nowIso
        })
        this.cartRemindersMemoryCache.set(key, {
          ...rec,
          status: criteria.status,
          completedOrderNumber: criteria.orderNumber || rec.completedOrderNumber || null,
          updatedAt: nowIso
        })
      }
    }

    // Also update any matching DB rows directly so server restarts don't miss visitor/email matches
    const updatePayload: Record<string, any> = {
      status: criteria.status,
      updated_at: nowIso
    }
    if (criteria.orderNumber) {
      updatePayload.completed_order_number = criteria.orderNumber
    }

    try {
      if (userId) {
        await this.supabase.from('cart_reminders').update(updatePayload).eq('user_id', userId).eq('status', 'ACTIVE')
      }
      if (visitorId) {
        await this.supabase.from('cart_reminders').update(updatePayload).eq('visitor_id', visitorId).eq('status', 'ACTIVE')
      }
      if (emailList.length > 0) {
        await this.supabase.from('cart_reminders').update(updatePayload).in('email', emailList).eq('status', 'ACTIVE')
      }
    } catch {
      // Fallback handled below
    }

    // Clean any public.events CART_REMINDER fallback rows matching user/visitor/email
    try {
      const { data: evRows } = await this.supabase
        .from('events')
        .select('id, description')
        .eq('category', 'CART_REMINDER')
        .eq('status', 'ACTIVE')
        .limit(200)

      for (const ev of evRows || []) {
        if (!ev.description) continue
        try {
          const parsed = this.mapCartReminder(JSON.parse(ev.description))
          const matchesUser = Boolean(userId && parsed.userId === userId)
          const matchesVisitor = Boolean(visitorId && parsed.visitorId === visitorId)
          const matchesEmail = emailList.includes(parsed.email.toLowerCase())
          if (matchesUser || matchesVisitor || matchesEmail) {
            const updated: CartReminderRecord = {
              ...parsed,
              status: criteria.status,
              completedOrderNumber: criteria.orderNumber || parsed.completedOrderNumber || null,
              updatedAt: nowIso
            }
            this.cartRemindersMemoryCache.set(updated.reminderKey, updated)
            await this.supabase
              .from('events')
              .update({
                status: criteria.status,
                description: JSON.stringify(updated),
                updated_at: nowIso
              })
              .eq('id', ev.id)
          }
        } catch {
          // Skip malformed record
        }
      }
    } catch {
      // Non-fatal
    }
  }

  async listActiveCartReminders(limit: number = 200): Promise<CartReminderRecord[]> {
    const map = new Map<string, CartReminderRecord>()
    for (const rec of this.cartRemindersMemoryCache.values()) {
      if (rec.status === 'ACTIVE') map.set(rec.reminderKey, rec)
    }

    let readFromTable = false
    try {
      const { data, error } = await this.supabase
        .from('cart_reminders')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('cart_updated_at', { ascending: true })
        .limit(limit)

      if (!error && Array.isArray(data)) {
        readFromTable = true
        for (const row of data) {
          const mapped = this.mapCartReminder(row)
          map.set(mapped.reminderKey, mapped)
          this.cartRemindersMemoryCache.set(mapped.reminderKey, mapped)
        }
      }
    } catch {
      // Fallback below
    }

    if (!readFromTable && this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM public.cart_reminders WHERE status = 'ACTIVE' ORDER BY cart_updated_at ASC LIMIT $1`,
          [limit]
        )
        for (const row of res.rows) {
          const mapped = this.mapCartReminder(row)
          map.set(mapped.reminderKey, mapped)
          this.cartRemindersMemoryCache.set(mapped.reminderKey, mapped)
        }
      } catch {
        // Fallback below
      }
    }

    try {
      const { data: evRows } = await this.supabase
        .from('events')
        .select('description')
        .eq('category', 'CART_REMINDER')
        .eq('status', 'ACTIVE')
        .limit(limit)

      for (const ev of evRows || []) {
        if (!ev.description) continue
        try {
          const mapped = this.mapCartReminder(JSON.parse(ev.description))
          if (mapped.status === 'ACTIVE' && !map.has(mapped.reminderKey)) {
            map.set(mapped.reminderKey, mapped)
            this.cartRemindersMemoryCache.set(mapped.reminderKey, mapped)
          }
        } catch {
          // Skip malformed entry
        }
      }
    } catch {
      // Ignore
    }

    return Array.from(map.values()).filter((rec) => rec.status === 'ACTIVE' && rec.items.length > 0)
  }

  async updateCartReminderProgress(
    reminderKey: string,
    updates: {
      sentStages: number[]
      lastSentStage: number
      lastRemindedAt: Date
      status?: CartReminderStatus
    }
  ): Promise<void> {
    const existing = await this.findCartReminderByKey(reminderKey)
    if (!existing) return
    const nextRecord: CartReminderRecord = {
      ...existing,
      sentStages: Array.from(new Set(updates.sentStages)).sort((a, b) => a - b),
      lastSentStage: updates.lastSentStage,
      lastRemindedAt: updates.lastRemindedAt.toISOString(),
      status: updates.status || existing.status,
      updatedAt: new Date().toISOString()
    }
    await this.persistCartReminderRecord(nextRecord)
  }

  // ==================== SITE VISITS & PRODUCT CHECKED ANALYTICS ====================
  private detectDeviceType(userAgent?: string | null): DeviceCategory {
    const ua = String(userAgent || '').toLowerCase()
    if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
      return 'tablet'
    }
    if (/mobi|iphone|ipod|blackberry|opera mini|iemobile/.test(ua)) {
      return 'mobile'
    }
    return 'desktop'
  }

  private shouldRecordAnalyticsEvent(dedupeKey: string, ttlMs: number): boolean {
    const now = Date.now()
    const prev = this.analyticsDedupeCache.get(dedupeKey)
    if (prev && now - prev < ttlMs) {
      return false
    }
    if (this.analyticsDedupeCache.size > 2000) {
      for (const [k, ts] of this.analyticsDedupeCache.entries()) {
        if (now - ts > 120000) {
          this.analyticsDedupeCache.delete(k)
        }
      }
    }
    this.analyticsDedupeCache.set(dedupeKey, now)
    return true
  }

  private normalizeReferrerLabel(referrer?: string | null): string {
    const raw = String(referrer || '').trim()
    if (!raw) return 'Direct'
    try {
      const parsed = new URL(raw)
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
      if (!host || host === 'driveflyelectric.shop' || host === 'localhost' || host === '127.0.0.1') {
        return 'Direct'
      }
      return host
    } catch {
      return raw.slice(0, 80) || 'Direct'
    }
  }

  private mapSiteVisit(raw: any): SiteVisitRecord {
    const dev = String(raw.device_type || raw.deviceType || 'desktop').toLowerCase()
    const deviceType: DeviceCategory = dev === 'mobile' || dev === 'tablet' ? dev : 'desktop'
    return {
      id: String(raw.id),
      visitorId: String(raw.visitor_id || raw.visitorId || 'anon'),
      sessionKey: String(raw.session_key || raw.sessionKey || raw.visitor_id || raw.visitorId || 'anon'),
      userId: raw.user_id ?? raw.userId ?? null,
      userEmail: raw.user_email ?? raw.userEmail ?? null,
      path: String(raw.path || '/'),
      referrer: raw.referrer || null,
      userAgent: raw.user_agent ?? raw.userAgent ?? null,
      deviceType,
      country: raw.country || null,
      ipHash: raw.ip_hash ?? raw.ipHash ?? null,
      createdAt: raw.created_at || raw.createdAt || new Date().toISOString()
    }
  }

  private mapProductView(raw: any): ProductViewRecord {
    return {
      id: String(raw.id),
      productId: String(raw.product_id || raw.productId),
      productName: String(raw.product_name || raw.productName || 'DriveFlyElectric Rig'),
      productSku: raw.product_sku ?? raw.productSku ?? null,
      category: raw.category ?? null,
      price: Number(raw.price || 0),
      imageUrl: raw.image_url ?? raw.imageUrl ?? null,
      visitorId: String(raw.visitor_id || raw.visitorId || 'anon'),
      sessionKey: raw.session_key ?? raw.sessionKey ?? null,
      userId: raw.user_id ?? raw.userId ?? null,
      userEmail: raw.user_email ?? raw.userEmail ?? null,
      source: (raw.source || 'PRODUCT_PAGE') as ProductViewSource,
      path: raw.path ?? null,
      createdAt: raw.created_at || raw.createdAt || new Date().toISOString()
    }
  }

  async recordSiteVisit(input: {
    visitorId: string
    sessionKey?: string
    userId?: string | null
    userEmail?: string | null
    path: string
    referrer?: string | null
    userAgent?: string | null
    country?: string | null
    ip?: string | null
  }): Promise<{ recorded: boolean; visit: SiteVisitRecord | null }> {
    const cleanPath = (input.path || '/').trim().slice(0, 300) || '/'
    if (cleanPath.startsWith('/admin')) {
      return { recorded: false, visit: null }
    }

    const sessionKey = (input.sessionKey || input.visitorId || `sess_${crypto.randomUUID()}`).slice(0, 120)
    const visitorId = (input.visitorId || sessionKey).slice(0, 120)
    if (!this.shouldRecordAnalyticsEvent(`visit:${sessionKey}:${cleanPath}`, 60 * 1000)) {
      return { recorded: false, visit: null }
    }

    const nowIso = new Date().toISOString()
    const ipHash = input.ip
      ? crypto.createHash('sha256').update(String(input.ip)).digest('hex').slice(0, 20)
      : null

    const visit: SiteVisitRecord = {
      id: `vis_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      visitorId,
      sessionKey,
      userId: input.userId || null,
      userEmail: input.userEmail || null,
      path: cleanPath,
      referrer: input.referrer ? String(input.referrer).trim().slice(0, 400) : null,
      userAgent: input.userAgent ? String(input.userAgent).trim().slice(0, 300) : null,
      deviceType: this.detectDeviceType(input.userAgent),
      country: input.country ? String(input.country).trim().slice(0, 64) : null,
      ipHash,
      createdAt: nowIso
    }

    this.siteVisitsMemoryCache = [visit, ...this.siteVisitsMemoryCache].slice(0, 1000)

    let persisted = false
    try {
      const { error } = await this.supabase.from('site_visits').insert({
        id: visit.id,
        visitor_id: visit.visitorId,
        session_key: visit.sessionKey,
        user_id: visit.userId,
        user_email: visit.userEmail,
        path: visit.path,
        referrer: visit.referrer,
        user_agent: visit.userAgent,
        device_type: visit.deviceType,
        country: visit.country,
        ip_hash: visit.ipHash,
        created_at: visit.createdAt
      })
      if (!error) persisted = true
    } catch {
      // Fallback below
    }

    if (!persisted && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO public.site_visits
           (id, visitor_id, session_key, user_id, user_email, path, referrer, user_agent, device_type, country, ip_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING`,
          [
            visit.id,
            visit.visitorId,
            visit.sessionKey,
            visit.userId,
            visit.userEmail,
            visit.path,
            visit.referrer,
            visit.userAgent,
            visit.deviceType,
            visit.country,
            visit.ipHash,
            visit.createdAt
          ]
        )
        persisted = true
      } catch {
        // Fallback below
      }
    }

    if (!persisted) {
      try {
        await this.supabase.from('events').upsert({
          id: visit.id,
          title: `VISIT:${visit.path.slice(0, 80)}`,
          description: JSON.stringify(visit),
          date: nowIso.slice(0, 10),
          time: nowIso,
          location: visit.userEmail || visit.visitorId,
          category: 'SITE_VISIT',
          status: 'past',
          updated_at: nowIso
        }, { onConflict: 'id' })
      } catch {
        // Memory cache retains live record
      }
    }

    return { recorded: true, visit }
  }

  async recordProductView(input: {
    productId: string
    productName?: string
    productSku?: string | null
    category?: string | null
    price?: number
    imageUrl?: string | null
    visitorId: string
    sessionKey?: string | null
    userId?: string | null
    userEmail?: string | null
    source?: ProductViewSource
    path?: string | null
  }): Promise<{ recorded: boolean; view: ProductViewRecord | null }> {
    const productId = String(input.productId || '').trim()
    if (!productId) return { recorded: false, view: null }

    const source: ProductViewSource = input.source || 'PRODUCT_PAGE'
    const sessionKey = (input.sessionKey || input.visitorId || 'anon').slice(0, 120)
    const visitorId = (input.visitorId || sessionKey).slice(0, 120)
    const dedupeTtl = source === 'PRODUCT_PAGE' ? 60 * 1000 : 8 * 1000
    if (!this.shouldRecordAnalyticsEvent(`pview:${sessionKey}:${productId}:${source}`, dedupeTtl)) {
      return { recorded: false, view: null }
    }

    let productName = (input.productName || '').trim()
    let productSku = input.productSku || null
    let category = input.category || null
    let price = Number(input.price || 0)
    let imageUrl = input.imageUrl || null

    if (!productName || !productSku || !price) {
      const dbProd = await this.findProductById(productId).catch(() => null)
      if (dbProd) {
        productName = productName || dbProd.name
        productSku = productSku || dbProd.sku
        category = category || dbProd.category
        price = price || Number(dbProd.price || 0)
        imageUrl = imageUrl || (Array.isArray(dbProd.images) ? dbProd.images[0] : null)
      }
    }

    const nowIso = new Date().toISOString()
    const view: ProductViewRecord = {
      id: `pview_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      productId,
      productName: (productName || 'DriveFlyElectric Rig').slice(0, 200),
      productSku: productSku ? String(productSku).slice(0, 100) : null,
      category: category ? String(category).slice(0, 100) : null,
      price: Number.isFinite(price) ? price : 0,
      imageUrl: imageUrl ? String(imageUrl).slice(0, 500) : null,
      visitorId,
      sessionKey,
      userId: input.userId || null,
      userEmail: input.userEmail || null,
      source,
      path: input.path ? String(input.path).slice(0, 300) : `/product/${productId}`,
      createdAt: nowIso
    }

    this.productViewsMemoryCache = [view, ...this.productViewsMemoryCache].slice(0, 1000)

    let persisted = false
    try {
      const { error } = await this.supabase.from('product_views').insert({
        id: view.id,
        product_id: view.productId,
        product_name: view.productName,
        product_sku: view.productSku,
        category: view.category,
        price: view.price,
        image_url: view.imageUrl,
        visitor_id: view.visitorId,
        session_key: view.sessionKey,
        user_id: view.userId,
        user_email: view.userEmail,
        source: view.source,
        path: view.path,
        created_at: view.createdAt
      })
      if (!error) persisted = true
    } catch {
      // Fallback below
    }

    if (!persisted && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO public.product_views
           (id, product_id, product_name, product_sku, category, price, image_url, visitor_id, session_key, user_id, user_email, source, path, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO NOTHING`,
          [
            view.id,
            view.productId,
            view.productName,
            view.productSku,
            view.category,
            view.price,
            view.imageUrl,
            view.visitorId,
            view.sessionKey,
            view.userId,
            view.userEmail,
            view.source,
            view.path,
            view.createdAt
          ]
        )
        persisted = true
      } catch {
        // Fallback below
      }
    }

    if (!persisted) {
      try {
        await this.supabase.from('events').upsert({
          id: view.id,
          title: `PVIEW:${view.productName.slice(0, 80)}`,
          description: JSON.stringify(view),
          date: nowIso.slice(0, 10),
          time: nowIso,
          location: view.productId,
          category: 'PRODUCT_VIEW',
          status: 'past',
          updated_at: nowIso
        }, { onConflict: 'id' })
      } catch {
        // Memory cache retains live record
      }
    }

    return { recorded: true, view }
  }

  private async listSiteVisitsSince(sinceIso: string, limit: number = 2500): Promise<SiteVisitRecord[]> {
    const map = new Map<string, SiteVisitRecord>()
    for (const item of this.siteVisitsMemoryCache) {
      if (item.createdAt >= sinceIso) {
        map.set(item.id, item)
      }
    }

    let readPrimary = false
    try {
      const { data, error } = await this.supabase
        .from('site_visits')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (!error && Array.isArray(data)) {
        readPrimary = true
        for (const row of data) {
          const mapped = this.mapSiteVisit(row)
          map.set(mapped.id, mapped)
        }
      }
    } catch {
      // Fallback below
    }

    if (!readPrimary && this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM public.site_visits WHERE created_at >= $1 ORDER BY created_at DESC LIMIT $2`,
          [sinceIso, limit]
        )
        for (const row of res.rows) {
          const mapped = this.mapSiteVisit(row)
          map.set(mapped.id, mapped)
        }
      } catch {
        // Fallback below
      }
    }

    if (!readPrimary) {
      try {
        const { data: evRows } = await this.supabase
          .from('events')
          .select('description')
          .eq('category', 'SITE_VISIT')
          .gte('time', sinceIso)
          .order('time', { ascending: false })
          .limit(limit)

        for (const ev of evRows || []) {
          if (!ev.description) continue
          try {
            const parsed = this.mapSiteVisit(JSON.parse(ev.description))
            if (!map.has(parsed.id)) map.set(parsed.id, parsed)
          } catch {
            // Skip malformed entry
          }
        }
      } catch {
        // Ignore
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  private async listProductViewsSince(sinceIso: string, limit: number = 2500): Promise<ProductViewRecord[]> {
    const map = new Map<string, ProductViewRecord>()
    for (const item of this.productViewsMemoryCache) {
      if (item.createdAt >= sinceIso) {
        map.set(item.id, item)
      }
    }

    let readPrimary = false
    try {
      const { data, error } = await this.supabase
        .from('product_views')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (!error && Array.isArray(data)) {
        readPrimary = true
        for (const row of data) {
          const mapped = this.mapProductView(row)
          map.set(mapped.id, mapped)
        }
      }
    } catch {
      // Fallback below
    }

    if (!readPrimary && this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM public.product_views WHERE created_at >= $1 ORDER BY created_at DESC LIMIT $2`,
          [sinceIso, limit]
        )
        for (const row of res.rows) {
          const mapped = this.mapProductView(row)
          map.set(mapped.id, mapped)
        }
      } catch {
        // Fallback below
      }
    }

    if (!readPrimary) {
      try {
        const { data: evRows } = await this.supabase
          .from('events')
          .select('description')
          .eq('category', 'PRODUCT_VIEW')
          .gte('time', sinceIso)
          .order('time', { ascending: false })
          .limit(limit)

        for (const ev of evRows || []) {
          if (!ev.description) continue
          try {
            const parsed = this.mapProductView(JSON.parse(ev.description))
            if (!map.has(parsed.id)) map.set(parsed.id, parsed)
          } catch {
            // Skip malformed entry
          }
        }
      } catch {
        // Ignore
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  async getTrafficAnalytics(periodDays: number = 30): Promise<TrafficAnalyticsSummary> {
    const safeDays = Math.min(365, Math.max(1, Math.round(periodDays || 30)))
    const now = Date.now()
    const sinceIso = new Date(now - safeDays * 24 * 60 * 60 * 1000).toISOString()
    const todayPrefix = new Date().toISOString().slice(0, 10)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

    const [visits, views] = await Promise.all([
      this.listSiteVisitsSince(sinceIso, 2500),
      this.listProductViewsSince(sinceIso, 2500)
    ])

    const allVisitorIds = new Set<string>()
    const todayVisitorIds = new Set<string>()
    const last7dVisitorIds = new Set<string>()
    let visitsToday = 0
    let visitsLast7d = 0

    const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 }
    const pageMap = new Map<string, { path: string; visits: number; visitors: Set<string>; lastVisitedAt: string }>()
    const referrerMap = new Map<string, number>()

    for (const v of visits) {
      allVisitorIds.add(v.visitorId)
      const tsMs = new Date(v.createdAt).getTime()
      const dateStr = v.createdAt.slice(0, 10)
      if (dateStr === todayPrefix) {
        visitsToday += 1
        todayVisitorIds.add(v.visitorId)
      }
      if (now - tsMs <= sevenDaysMs) {
        visitsLast7d += 1
        last7dVisitorIds.add(v.visitorId)
      }

      if (v.deviceType === 'mobile') deviceBreakdown.mobile += 1
      else if (v.deviceType === 'tablet') deviceBreakdown.tablet += 1
      else deviceBreakdown.desktop += 1

      const pEntry = pageMap.get(v.path) || {
        path: v.path,
        visits: 0,
        visitors: new Set<string>(),
        lastVisitedAt: v.createdAt
      }
      pEntry.visits += 1
      pEntry.visitors.add(v.visitorId)
      if (v.createdAt > pEntry.lastVisitedAt) pEntry.lastVisitedAt = v.createdAt
      pageMap.set(v.path, pEntry)

      const refLabel = this.normalizeReferrerLabel(v.referrer)
      referrerMap.set(refLabel, (referrerMap.get(refLabel) || 0) + 1)
    }

    let productViewsToday = 0
    const productStatsMap = new Map<
      string,
      {
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
        visitors: Set<string>
        lastViewedAt: string
      }
    >()

    for (const pv of views) {
      if (pv.createdAt.slice(0, 10) === todayPrefix) {
        productViewsToday += 1
      }
      const existing = productStatsMap.get(pv.productId) || {
        productId: pv.productId,
        productName: pv.productName,
        productSku: pv.productSku || null,
        category: pv.category || null,
        price: pv.price || 0,
        imageUrl: pv.imageUrl || null,
        totalViews: 0,
        pageViews: 0,
        cartAdds: 0,
        bookingChecks: 0,
        chatSelections: 0,
        visitors: new Set<string>(),
        lastViewedAt: pv.createdAt
      }
      existing.totalViews += 1
      if (pv.source === 'CART_ADD') existing.cartAdds += 1
      else if (pv.source === 'BOOKING_MODAL') existing.bookingChecks += 1
      else if (pv.source === 'LIVECHAT_SELECT') existing.chatSelections += 1
      else existing.pageViews += 1

      if (!existing.imageUrl && pv.imageUrl) existing.imageUrl = pv.imageUrl
      if (!existing.productSku && pv.productSku) existing.productSku = pv.productSku
      existing.visitors.add(pv.visitorId)
      if (pv.createdAt > existing.lastViewedAt) existing.lastViewedAt = pv.createdAt
      productStatsMap.set(pv.productId, existing)
    }

    // Build 14-day daily time-series (or fewer if periodDays < 14, min 7 buckets for crisp visual chart)
    const chartDays = Math.min(14, Math.max(7, safeDays))
    const dailyBuckets = new Map<string, { visits: number; visitors: Set<string>; productViews: number }>()
    for (let i = chartDays - 1; i >= 0; i -= 1) {
      const dStr = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      dailyBuckets.set(dStr, { visits: 0, visitors: new Set<string>(), productViews: 0 })
    }
    for (const v of visits) {
      const bucket = dailyBuckets.get(v.createdAt.slice(0, 10))
      if (bucket) {
        bucket.visits += 1
        bucket.visitors.add(v.visitorId)
      }
    }
    for (const pv of views) {
      const bucket = dailyBuckets.get(pv.createdAt.slice(0, 10))
      if (bucket) {
        bucket.productViews += 1
      }
    }

    const dailySeries = Array.from(dailyBuckets.entries()).map(([date, stats]) => ({
      date,
      label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
      }),
      visits: stats.visits,
      uniqueVisitors: stats.visitors.size,
      productViews: stats.productViews
    }))

    return {
      periodDays: safeDays,
      totalVisits: visits.length,
      visitsToday,
      visitsLast7d,
      uniqueVisitors: allVisitorIds.size,
      uniqueVisitorsToday: todayVisitorIds.size,
      uniqueVisitorsLast7d: last7dVisitorIds.size,
      totalProductViews: views.length,
      productViewsToday,
      uniqueProductsChecked: productStatsMap.size,
      deviceBreakdown,
      topPages: Array.from(pageMap.values())
        .map((p) => ({
          path: p.path,
          visits: p.visits,
          uniqueVisitors: p.visitors.size,
          lastVisitedAt: p.lastVisitedAt
        }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 12),
      topReferrers: Array.from(referrerMap.entries())
        .map(([referrer, visitsCount]) => ({ referrer, visits: visitsCount }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 10),
      topProductsChecked: Array.from(productStatsMap.values())
        .map((p) => ({
          productId: p.productId,
          productName: p.productName,
          productSku: p.productSku,
          category: p.category,
          price: p.price,
          imageUrl: p.imageUrl,
          totalViews: p.totalViews,
          pageViews: p.pageViews,
          cartAdds: p.cartAdds,
          bookingChecks: p.bookingChecks,
          chatSelections: p.chatSelections,
          uniqueVisitors: p.visitors.size,
          lastViewedAt: p.lastViewedAt
        }))
        .sort((a, b) => b.totalViews - a.totalViews)
        .slice(0, 15),
      dailySeries,
      recentVisits: visits.slice(0, 40),
      recentProductViews: views.slice(0, 40)
    }
  }

  // ==================== CONTROLLER COMPATIBILITY LAYER ====================
  // Provides clean Prisma-like signatures to prevent breaking any existing controller code
  public prisma = {
    user: {
      findUnique: async (args: any) => {
        if (args?.where?.id) return this.findUserById(args.where.id)
        if (args?.where?.email) return this.findUserByEmail(args.where.email)
        return null
      },
      findMany: async (args: any) => this.findUsers(args),
      count: async (_args?: any) => this.getUserCount(),
      create: async (args: any) => this.createUser(args.data),
      update: async (args: any) => this.updateUser(args.where.id, args.data)
    },
    product: {
      findUnique: async (args: any) => this.findProductById(args.where.id),
      findMany: async (args: any) => this.findProducts({
        category: args?.where?.category,
        limit: args?.take,
        offset: args?.skip
      }),
      count: async (args?: any) => this.getProductCount(args?.where),
      create: async (args: any) => this.createProduct(args.data),
      update: async (args: any) => this.updateProduct(args.where.id, args.data),
      delete: async (args: any) => this.deleteProduct(args.where.id)
    },
    order: {
      findUnique: async (args: any) => this.findOrderById(args.where.id),
      findMany: async (args: any) => this.findOrders({
        userId: args?.where?.userId,
        status: args?.where?.status,
        limit: args?.take,
        offset: args?.skip
      }),
      count: async (args?: any) => this.getOrderCount({
        status: args?.where?.status,
        userId: args?.where?.userId
      }),
      aggregate: async () => ({ _sum: { total: await this.getTotalRevenue() } })
    },
    cart: {
      findUnique: async (args: any) => {
        if (args?.where?.userId) return this.findOrCreateCart(args.where.userId)
        return null
      }
    },
    cartItem: {
      findUnique: async (args: any) => {
        const { data } = await this.supabase.from('cart_items').select('*, carts(*)').eq('id', args.where.id).maybeSingle()
        return data ? {
          id: data.id,
          cartId: data.cart_id,
          productId: data.product_id,
          quantity: data.quantity,
          cart: data.carts ? { userId: data.carts.user_id, id: data.carts.id } : { userId: '', id: data.cart_id }
        } : null
      },
      delete: async (args: any) => this.removeCartItem(args.where.id),
      deleteMany: async (args: any) => {
        if (args?.where?.cartId) await this.supabase.from('cart_items').delete().eq('cart_id', args.where.cartId)
      }
    },
    address: {
      findFirst: async (args: any) => {
        let q = this.supabase.from('addresses').select('*').eq('user_id', args.where.userId)
        if (args.where.id) q = q.eq('id', args.where.id)
        if (args.where.type) q = q.eq('type', args.where.type)
        const { data } = await q.maybeSingle()
        return data ? this.mapAddress(data) : null
      },
      findMany: async (args: any) => this.findAddressesByUserId(args.where.userId),
      count: async (args: any) => {
        const { count } = await this.supabase.from('addresses').select('*', { count: 'exact', head: true }).eq('user_id', args.where.userId)
        return count ?? 0
      },
      create: async (args: any) => this.createAddress(args.data),
      update: async (args: any) => this.updateAddress(args.where.id, args.data),
      updateMany: async (args: any) => {
        if (args.where.userId && args.where.type) {
          await this.unsetDefaultAddresses(args.where.userId, args.where.type)
        }
      },
      delete: async (args: any) => this.deleteAddress(args.where.id)
    }
  }
}

export const databaseService = new DatabaseService()