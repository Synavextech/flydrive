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
  OrderItem,
  Address
} from '../types/database.js'
import crypto from 'crypto'
import { sanitizePostgrestSearch, getFormattedSupportWhatsApp } from '../middleware/security.js'

const { Pool } = pg

export class DatabaseService {
  public supabase: SupabaseClient
  public pool: pg.Pool | null = null
  private reviewsMemoryCache: Map<string, ProductReview[]> = new Map()

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
    const { data, error } = await this.supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, order_items(*, products(*)), users(*), shipping_address:addresses!orders_shipping_address_id_fkey(*)')
      .single()

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

  private enrichSupportSession(session: any): any {
    const presence = this.formatRelativePresence(session.lastSeenAt, session.isOnline)
    return {
      ...session,
      isOnline: presence.isOnline,
      lastSeenText: presence.lastSeenText,
      selectedProducts: Array.isArray(session.selectedProducts) ? session.selectedProducts : [],
      messages: Array.isArray(session.messages) ? session.messages : []
    }
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

      if (!sessionErr && Array.isArray(session.messages) && session.messages.length > 0) {
        const lastMsg = session.messages[session.messages.length - 1]
        if (lastMsg && lastMsg.id) {
          await this.supabase
            .from('support_messages')
            .upsert({
              id: lastMsg.id,
              session_id: session.id,
              sender_role: lastMsg.senderRole || 'CLIENT',
              sender_name: lastMsg.senderName || 'Visitor',
              content: lastMsg.content || '',
              metadata: lastMsg.metadata || {},
              created_at: lastMsg.createdAt || new Date().toISOString()
            }, { onConflict: 'id' })
        }
        return
      }
    } catch {
      // Fallback to public.events below
    }

    // 2. Fallback persistence in public.events (category = 'LIVECHAT_SESSION') so database persistence works even before running SQL migration
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
          location: session.visitorEmail || session.visitorId || session.id,
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

    return Array.from(sessionMap.values())
      .map(s => this.enrichSupportSession(s))
      .sort((a, b) => new Date(b.updatedAt || b.lastSeenAt).getTime() - new Date(a.updatedAt || a.lastSeenAt).getTime())
  }

  async upsertSupportSession(payload: {
    sessionId?: string
    visitorId?: string
    userId?: string
    visitorName?: string
    visitorEmail?: string
    visitorPhone?: string
    topic?: string
    selectedProducts?: any[]
  }): Promise<any> {
    const sessionId = payload.sessionId || payload.visitorId || `chat_${crypto.randomUUID()}`
    const nowIso = new Date().toISOString()
    const existing = await this.getSupportSession(sessionId)

    const mergedProducts = payload.selectedProducts !== undefined
      ? payload.selectedProducts
      : (existing?.selectedProducts || [])

    const nextTopic = payload.topic || existing?.topic || 'General Inquiry'

    const session: any = {
      id: sessionId,
      visitorId: payload.visitorId || existing?.visitorId || sessionId,
      userId: payload.userId || existing?.userId,
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

    // Seed welcome message if new session
    if (session.messages.length === 0) {
      const welcomeMsg = {
        id: `msg_${crypto.randomUUID()}`,
        sessionId,
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
    if (visitorMeta?.visitorName) existing.visitorName = visitorMeta.visitorName
    if (visitorMeta?.visitorEmail) existing.visitorEmail = visitorMeta.visitorEmail

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

  async updateSupportSessionStatus(sessionId: string, status: 'OPEN' | 'RESOLVED'): Promise<any | null> {
    const existing = await this.getSupportSession(sessionId)
    if (!existing) return null

    existing.status = status
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
    return `${capturedContactNote}🏢 **DriveFlyElectric Store & Support Details**:\n• **Brand**: DriveFlyElectric (https://driveflyelectric.shop)\n• **Fleet Categories**: MiniHeliCopters, Electric Microcars, Go Karts, Electric Drift Trikes & Dirtbikes\n• **Head Office**: Austin, Texas, USA\n• **Official Support Email**: info-eurotopmobility@driveflyelectric.shop\n• **WhatsApp Support Line**: ${getFormattedSupportWhatsApp()}\n• **Warranty & Shipping**: 100% Free Express Shipping + 12-Month Factory Warranty.\n\nHow can we help you with your fleet selection today?${contactPrompt}`
  }

  async appendSupportMessage(
    sessionId: string,
    messageInput: {
      senderRole: 'CLIENT' | 'ADMIN' | 'AI_ASSISTANT'
      senderName?: string
      content: string
      topic?: string
      selectedProducts?: any[]
      visitorName?: string
      visitorEmail?: string
      visitorPhone?: string
    }
  ): Promise<{ session: any; newMessages: any[] }> {
    let session = await this.getSupportSession(sessionId)
    if (!session) {
      session = await this.upsertSupportSession({
        sessionId,
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
    }

    await this.persistSupportSessionToDb(session)
    const createdList: any[] = [primaryMsg]

    // If message is from CLIENT, generate an immediate intelligent assistant reply unless an ADMIN just replied within the last 2 minutes
    if (messageInput.senderRole === 'CLIENT') {
      const recentAdminMsg = (session.messages || [])
        .slice()
        .reverse()
        .find((m: any) => m.senderRole === 'ADMIN')
      const adminRecentlyActive =
        recentAdminMsg &&
        Date.now() - new Date(recentAdminMsg.createdAt).getTime() < 2 * 60 * 1000

      if (!adminRecentlyActive) {
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
      count: async (args?: any) => this.getUserCount(),
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