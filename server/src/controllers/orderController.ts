import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'
import { buildReceiptDataFromOrder, generateReceiptPdfBuffer } from '../utils/receiptPdf.js'

// @desc    Create new order
// @route   POST /api/orders
// @access  Public (Guest Checkout supported with optional inline account creation)
export const createOrder = async (req: Request, res: Response) => {
  try {
    let userId = req.user?.id
    const {
      customer,
      shippingAddressId,
      billingAddressId,
      shippingAddress: shippingAddressInput,
      paymentMethod = 'STRIPE',
      paymentId,
      paymentStatus,
      notes,
      items: bodyItems,
      password: customerPassword,
      createAccount
    } = req.body

    const customerEmail = customer?.email || shippingAddressInput?.email || req.user?.email

    let tokenToReturn: string | null = null
    let authUserToReturn: any = null

    // If unauthenticated, find or automatically create customer user account
    if (!userId) {
      if (!customerEmail) {
        return res.status(400).json({
          success: false,
          error: 'An email address is required to process your order'
        })
      }

      let existingUser = await databaseService.findUserByEmail(customerEmail)
      if (existingUser) {
        userId = existingUser.id
        authUserToReturn = existingUser
      } else {
        const salt = await bcrypt.genSalt(10)
        const passwordToHash = customerPassword || `DFE_${Math.random().toString(36).substring(2, 10)}!1A`
        const hashedPassword = await bcrypt.hash(passwordToHash, salt)
        const firstName = customer?.firstName || shippingAddressInput?.firstName || 'Customer'
        const lastName = customer?.lastName || shippingAddressInput?.lastName || ''
        const phone = customer?.phone || shippingAddressInput?.phone || ''

        const newUser = await databaseService.createUser({
          email: customerEmail,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          role: 'CUSTOMER'
        })
        userId = newUser.id
        authUserToReturn = newUser

        const secret = process.env.JWT_SECRET || 'your_jwt_secret_here'
        tokenToReturn = (jwt as any).sign(
          { id: newUser.id, email: newUser.email, role: newUser.role },
          secret,
          { expiresIn: process.env.JWT_EXPIRE || '30d' }
        )

        // Dispatch welcome & system notification emails for newly created customer account
        emailService
          .sendAccountRegistrationNotifications(newUser, 'Checkout Account Creation')
          .catch((err) => console.error('Checkout account registration email error:', err))
      }
    } else if (!authUserToReturn && userId) {
      // Fetch authenticated user's declared account email & profile
      authUserToReturn = await databaseService.findUserById(userId).catch(() => null)
    }

    // Determine order items (either from request body or user's database cart)
    let candidateItems: Array<{ productId: string; quantity: number }> = []

    if (Array.isArray(bodyItems) && bodyItems.length > 0) {
      candidateItems = bodyItems.map((item: any) => ({
        productId: item.productId || item.product?.id || item.id,
        quantity: Number(item.quantity) || 1
      }))
    } else if (userId) {
      const cart = await databaseService.findOrCreateCart(userId)
      if (cart.items && cart.items.length > 0) {
        candidateItems = cart.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      }
    }

    if (!candidateItems.length) {
      return res.status(400).json({
        success: false,
        error: 'Order items are required'
      })
    }

    // Process shipping address if passed as object
    let finalShippingAddressId = shippingAddressId
    if (!finalShippingAddressId && shippingAddressInput) {
      try {
        const createdAddr = await databaseService.createAddress({
          userId: userId!,
          type: 'SHIPPING',
          firstName: shippingAddressInput.firstName,
          lastName: shippingAddressInput.lastName,
          company: shippingAddressInput.company,
          address1: shippingAddressInput.address1,
          address2: shippingAddressInput.address2,
          city: shippingAddressInput.city,
          state: shippingAddressInput.state,
          postalCode: shippingAddressInput.postalCode || shippingAddressInput.zipCode || '',
          zipCode: shippingAddressInput.zipCode || shippingAddressInput.postalCode || '',
          country: shippingAddressInput.country || 'United States',
          phone: shippingAddressInput.phone,
          isDefault: true
        })
        finalShippingAddressId = createdAddr.id
      } catch (addrErr) {
        console.warn('Could not auto-create address:', addrErr)
      }
    }

    // Calculate totals and validate products
    let subtotal = 0
    const orderItems: Array<{ productId: string; quantity: number; price: number }> = []

    for (const item of candidateItems) {
      const product = await databaseService.findProductById(item.productId)

      if (!product || !product.isActive) {
        return res.status(400).json({
          success: false,
          error: `Product ${item.productId} is no longer available`
        })
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}`
        })
      }

      const itemTotal = Number(product.price) * item.quantity
      subtotal += itemTotal
      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: Number(product.price)
      })
    }

    // USD Calculations: 100% Free Worldwide & US Express Shipping on all orders, 5% sales tax
    const shipping = 0
    const tax = Math.round(subtotal * 0.05 * 100) / 100
    const total = Math.round((subtotal + tax + shipping) * 100) / 100

    // Create order in Supabase
    const isSettled = paymentStatus === 'COMPLETED' || !!paymentId
    const order = await databaseService.createOrder({
      userId,
      total,
      subtotal,
      tax,
      shipping,
      paymentMethod,
      paymentId: paymentId || undefined,
      paymentStatus: isSettled ? 'COMPLETED' : 'PENDING',
      status: isSettled ? 'PROCESSING' : 'PENDING',
      shippingAddressId: finalShippingAddressId,
      billingAddressId,
      notes,
      items: orderItems
    })

    // Build full shipping address string for notifications
    const fullAddress = shippingAddressInput
      ? `${shippingAddressInput.address1 || ''}${shippingAddressInput.address2 ? `, ${shippingAddressInput.address2}` : ''}, ${shippingAddressInput.city || ''}, ${shippingAddressInput.state || ''} ${shippingAddressInput.postalCode || shippingAddressInput.zipCode || ''}, ${shippingAddressInput.country || 'United States'}`
      : undefined

    // Dispatch real-time purchase confirmation & PDF receipt to user email (declared during account creation) AND system mail
    emailService
      .sendPurchaseNotifications(order, {
        accountEmail: authUserToReturn?.email || req.user?.email || customerEmail,
        shippingEmail: customerEmail,
        firstName: shippingAddressInput?.firstName || authUserToReturn?.firstName,
        lastName: shippingAddressInput?.lastName || authUserToReturn?.lastName,
        fullAddress
      })
      .catch((err) => console.error('Order purchase notification error:', err))

    if (tokenToReturn) {
      res.cookie('token', tokenToReturn, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      })
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order,
      token: tokenToReturn,
      user: authUserToReturn ? {
        id: authUserToReturn.id,
        email: authUserToReturn.email,
        firstName: authUserToReturn.firstName,
        lastName: authUserToReturn.lastName,
        role: authUserToReturn.role
      } : undefined
    })
  } catch (error) {
    console.error('Error creating order:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get user's orders
// @route   GET /api/orders
// @access  Private
export const getOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { status, limit = '10', page = '1' } = req.query

    const limitNum = parseInt(limit as string) || 10
    const offset = (parseInt(page as string) - 1) * limitNum

    const [orders, totalOrders] = await Promise.all([
      databaseService.findOrders({
        userId,
        status: status as string,
        limit: limitNum,
        offset
      }),
      databaseService.getOrderCount({
        userId,
        status: status as string
      })
    ])

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        currentPage: parseInt(page as string) || 1,
        totalPages: Math.ceil(totalOrders / limitNum),
        totalOrders
      }
    })
  } catch (error) {
    console.error('Error fetching orders:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
export const getOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const orderId = req.params.id

    const order = await databaseService.findOrderById(orderId)

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      })
    }

    if (order.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this order'
      })
    }

    res.status(200).json({
      success: true,
      data: order
    })
  } catch (error) {
    console.error('Error fetching order:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body
    const orderId = req.params.id

    // Check if user is admin
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const updatedOrder = await databaseService.updateOrderStatus(orderId, status)

    emailService
      .sendOrderStatusUpdate(updatedOrder, updatedOrder.user?.email)
      .catch((err) => console.error('Order status update email error:', err))

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: updatedOrder
    })
  } catch (error) {
    console.error('Error updating order status:', error)
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const orderId = req.params.id

    const order = await databaseService.findOrderById(orderId)

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      })
    }

    if (order.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this order'
      })
    }

    // Check if order can be cancelled
    if (!['PENDING', 'PROCESSING'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: 'Order cannot be cancelled at this stage'
      })
    }

    const updatedOrder = await databaseService.updateOrderStatus(orderId, 'CANCELLED')

    emailService
      .sendOrderStatusUpdate(updatedOrder, order.user?.email || req.user?.email)
      .catch((err) => console.error('Order cancellation email error:', err))

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: updatedOrder
    })
  } catch (error) {
    console.error('Error cancelling order:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get order statistics (Admin only)
// @route   GET /api/orders/stats
// @access  Private/Admin
export const getOrderStats = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const [
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue,
      recentOrders
    ] = await Promise.all([
      databaseService.getOrderCount(),
      databaseService.getOrderCount({ status: 'PENDING' }),
      databaseService.getOrderCount({ status: 'DELIVERED' }),
      databaseService.getTotalRevenue(),
      databaseService.findOrders({ limit: 5 })
    ])

    res.status(200).json({
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue,
        recentOrders
      }
    })
  } catch (error) {
    console.error('Error fetching order statistics:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Download generated PDF receipt for an order
// @route   GET /api/orders/:id/receipt.pdf
// @access  Private (Customer owner or Admin)
export const downloadOrderReceiptPdf = async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id
    const order = await databaseService.findOrderById(orderId)

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      })
    }

    if (req.user && req.user.role !== 'ADMIN' && order.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to download this receipt'
      })
    }

    const receiptData = buildReceiptDataFromOrder(order)
    const pdfBuffer = generateReceiptPdfBuffer(receiptData)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Receipt-${receiptData.orderNumber}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.status(200).send(pdfBuffer)
  } catch (error) {
    console.error('Error generating order receipt PDF:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate receipt PDF'
    })
  }
}