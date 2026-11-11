import { supabase } from '../utils/supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import type {
  User,
  Product,
  Cart,
  CartItem,
  Order,
  OrderItem,
  Address
} from '../types/database.js'
import crypto from 'crypto'

const { Pool } = pg

export class DatabaseService {
  public supabase: SupabaseClient
  public pool: pg.Pool | null = null

  constructor(client: SupabaseClient = supabase) {
    this.supabase = client
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      })
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
      shippingRequired: raw.shipping_required ?? true,
      averageDeliveryTime: raw.average_delivery_time || null,
      weight: raw.weight ? Number(raw.weight) : null,
      dimensions: raw.dimensions || null,
      rating: raw.rating ? Number(raw.rating) : 4.9,
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
    return {
      id: raw.id,
      userId: raw.user_id,
      orderNumber: raw.order_number,
      status: raw.status,
      total: Number(raw.total),
      subtotal: Number(raw.subtotal),
      tax: Number(raw.tax || 0),
      shipping: Number(raw.shipping || 0),
      discount: Number(raw.discount || 0),
      paymentMethod: raw.payment_method,
      paymentStatus: raw.payment_status,
      paymentId: raw.payment_id || null,
      shippingAddressId: raw.shipping_address_id || null,
      billingAddressId: raw.billing_address_id || null,
      notes: raw.notes || null,
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
    let query = this.supabase.from('users').select('*').order('created_at', { ascending: false })
    if (options?.role) query = query.eq('role', options.role)
    if (options?.limit) query = query.limit(options.limit)
    if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(u => this.mapUser(u))
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
    return query.ilike('category', `%${category}%`)
  }

  async findProducts(filters?: {
    category?: string
    search?: string
    limit?: number
    offset?: number
  }): Promise<Product[]> {
    const { category, search, limit = 100, offset = 0 } = filters || {}
    try {
      let query = this.supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      query = this.applyCategoryFilter(query, category)

      if (search && search.trim()) {
        const s = search.trim()
        query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(p => this.mapProduct(p))
    } catch (err) {
      if (this.pool) {
        let sql = 'SELECT * FROM products WHERE is_active = true'
        const params: any[] = []
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
    const { data, error } = await this.supabase
      .from('products')
      .insert({
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
        average_delivery_time: productData.averageDeliveryTime || '2-4 business days',
        weight: productData.weight,
        dimensions: productData.dimensions
      })
      .select()
      .single()

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
    if (productData.shippingRequired !== undefined) payload.shipping_required = productData.shippingRequired
    if (productData.averageDeliveryTime !== undefined) payload.average_delivery_time = productData.averageDeliveryTime
    if (productData.weight !== undefined) payload.weight = productData.weight
    if (productData.dimensions !== undefined) payload.dimensions = productData.dimensions
    payload.updated_at = new Date().toISOString()

    const { data, error } = await this.supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

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

  async getProductCount(filters?: { category?: string; search?: string }): Promise<number> {
    try {
      let query = this.supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      query = this.applyCategoryFilter(query, filters?.category)

      if (filters?.search && filters.search.trim()) {
        const s = filters.search.trim()
        query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%`)
      }

      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    } catch (err) {
      if (this.pool) {
        let sql = 'SELECT count(*) FROM products WHERE is_active = true'
        const params: any[] = []
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
    userId: string
    total: number
    subtotal: number
    tax?: number
    shipping?: number
    discount?: number
    paymentMethod: 'STRIPE' | 'PAYPAL'
    paymentId?: string
    paymentStatus?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
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

    const { data: order, error: orderError } = await this.supabase
      .from('orders')
      .insert({
        id: orderId,
        user_id: orderData.userId,
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
        shipping_address_id: orderData.shippingAddressId,
        billing_address_id: orderData.billingAddressId,
        notes: orderData.notes
      })
      .select()
      .single()

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

    // Clear user cart
    await this.clearCart(orderData.userId).catch(() => {})

    return this.findOrderById(order.id) as Promise<Order>
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