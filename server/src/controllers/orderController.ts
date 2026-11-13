import { Request, Response } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'
import { buildReceiptDataFromOrder, generateReceiptPdfBuffer } from '../utils/receiptPdf.js'
import {
  getJwtSecret,
  signReceiptAccessToken,
  verifyReceiptAccessToken
} from '../middleware/security.js'
import {
  computeAuthoritativeOrderPricing,
  verifyPayPalPayment,
  verifyStripePaymentIntent
} from '../utils/paymentVerification.js'

const createOrderSchema = z.object({
  customer: z
    .object({
      email: z.string().trim().email().max(254).optional(),
      firstName: z.string().trim().max(100).optional(),
      lastName: z.string().trim().max(100).optional(),
      phone: z.string().trim().max(40).optional()
    })
    .optional(),
  shippingAddressId: z.string().trim().max(100).optional().nullable(),
  billingAddressId: z.string().trim().max(100).optional().nullable(),
  shippingAddress: z
    .object({
      email: z.string().trim().email().max(254).optional(),
      firstName: z.string().trim().max(100).optional(),
      lastName: z.string().trim().max(100).optional(),
      phone: z.string().trim().max(40).optional(),
      company: z.string().trim().max(150).optional(),
      address1: z.string().trim().max(255).optional(),
      address2: z.string().trim().max(255).optional(),
      city: z.string().trim().max(120).optional(),
      state: z.string().trim().max(120).optional(),
      zipCode: z.string().trim().max(30).optional(),
      postalCode: z.string().trim().max(30).optional(),
      country: z.string().trim().max(120).optional(),
      countryCode: z.string().trim().max(5).optional()
    })
    .optional(),
  paymentMethod: z.enum(['STRIPE', 'PAYPAL']).default('PAYPAL'),
  paymentId: z.string().trim().min(3, 'A verified payment transaction ID is required.').max(200),
  paypalOrderId: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().trim().optional(),
        id: z.string().trim().optional(),
        product: z.object({ id: z.string().trim().optional() }).optional(),
        quantity: z.coerce.number().int().min(1).max(50).default(1)
      })
    )
    .optional(),
  password: z.string().max(128).optional().or(z.literal('')),
  createAccount: z.boolean().optional()
})

const orderStatusUpdateSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
})

function extractGuestMetadataFromNotes(notes?: string | null): {
  emails: string[]
  zips: string[]
} {
  if (!notes) return { emails: [], zips: [] }
  const emails: string[] = []
  const zips: string[] = []

  const emailMatches = notes.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
  if (emailMatches) {
    emails.push(...emailMatches.map((e) => e.toLowerCase()))
  }

  const postalMatch = notes.match(/Postal:\s*([A-Za-z0-9 -]{2,20})/i)
  if (postalMatch?.[1]) {
    zips.push(postalMatch[1].trim().toLowerCase())
  }

  return { emails, zips }
}

// @desc    Create new order
// @route   POST /api/orders
// @access  Public (Verified payment required; guest checkout never collides with existing accounts)
export const createOrder = async (req: Request, res: Response) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid order submission payload.'
      })
    }

    const {
      customer,
      shippingAddressId,
      billingAddressId,
      shippingAddress: shippingAddressInput,
      paymentMethod,
      paymentId,
      paypalOrderId,
      notes,
      items: bodyItems,
      password: customerPassword,
      createAccount
    } = parsed.data

    const rawCustomerEmail =
      customer?.email || shippingAddressInput?.email || req.user?.email || ''
    const customerEmail = rawCustomerEmail.trim().toLowerCase()

    // 1. Idempotency check on raw paymentId before allocating any order/user resources
    const existingByPayment = await databaseService.findOrderByPaymentId(paymentId)
    if (existingByPayment) {
      const guestMeta = extractGuestMetadataFromNotes(existingByPayment.notes)
      const callerOwnsOrder =
        req.user?.role === 'ADMIN' ||
        Boolean(req.user?.id && existingByPayment.userId === req.user.id) ||
        Boolean(
          customerEmail &&
            (existingByPayment.user?.email?.toLowerCase() === customerEmail ||
              guestMeta.emails.includes(customerEmail))
        )

      if (!callerOwnsOrder) {
        return res.status(409).json({
          success: false,
          error: 'This payment reference has already been redeemed for another order.'
        })
      }

      const tokenForExisting =
        existingByPayment.receiptToken || signReceiptAccessToken(existingByPayment.id)
      return res.status(200).json({
        success: true,
        message: 'Order already recorded',
        data: { ...existingByPayment, receiptToken: tokenForExisting }
      })
    }

    let userId: string | null = req.user?.id || null
    let tokenToReturn: string | null = null
    let authUserToReturn: any = null

    if (userId) {
      authUserToReturn = await databaseService.findUserById(userId).catch(() => null)
    } else {
      if (!customerEmail) {
        return res.status(400).json({
          success: false,
          error: 'A valid email address is required to complete your order.'
        })
      }

      // CRITICAL SECURITY FIX: Never attach an unauthenticated checkout order to an existing account by email!
      const existingUser = await databaseService.findUserByEmail(customerEmail)
      if (!existingUser && createAccount && customerPassword && customerPassword.length >= 8) {
        const salt = await bcrypt.genSalt(12)
        const hashedPassword = await bcrypt.hash(customerPassword, salt)
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

        tokenToReturn = (jwt as any).sign(
          { id: newUser.id, email: newUser.email, role: newUser.role },
          getJwtSecret(),
          { expiresIn: process.env.JWT_EXPIRE || '30d' }
        )

        emailService
          .sendAccountRegistrationNotifications(newUser, 'Checkout Account Creation')
          .catch((err) => console.error('Checkout account registration email error:', err))
      } else {
        // Proceed cleanly as a guest checkout (userId stays null)
        userId = null
      }
    }

    // 2. Resolve items & compute authoritative USD totals on the server
    let candidateItems: Array<{ productId: string; quantity: number }> = []
    if (Array.isArray(bodyItems) && bodyItems.length > 0) {
      candidateItems = bodyItems.map((item) => ({
        productId: item.productId || item.product?.id || item.id || '',
        quantity: Number(item.quantity) || 1
      }))
    } else if (userId) {
      const cart = await databaseService.findOrCreateCart(userId)
      if (cart.items && cart.items.length > 0) {
        candidateItems = cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      }
    }

    if (!candidateItems.length) {
      return res.status(400).json({
        success: false,
        error: 'Order items are required.'
      })
    }

    let pricing
    try {
      pricing = await computeAuthoritativeOrderPricing(candidateItems)
    } catch (pricingErr: any) {
      return res.status(400).json({
        success: false,
        error: pricingErr?.message || 'Unable to verify selected items and pricing.'
      })
    }

    // 3. Mandatory live gateway verification BEFORE recording settled order
    const verification =
      paymentMethod === 'STRIPE'
        ? await verifyStripePaymentIntent(paymentId, pricing.total)
        : await verifyPayPalPayment(paymentId, pricing.total, paypalOrderId)

    if (!verification.verified) {
      return res.status(402).json({
        success: false,
        error:
          verification.reason ||
          'Payment verification failed with the processor. Your order has not been finalized.'
      })
    }

    const verifiedPaymentId = verification.paymentId || paymentId
    if (verifiedPaymentId !== paymentId) {
      const duplicateVerified = await databaseService.findOrderByPaymentId(verifiedPaymentId)
      if (duplicateVerified) {
        return res.status(409).json({
          success: false,
          error: 'This captured payment has already been assigned to an order.'
        })
      }
    }

    // 4. Persist shipping address record only for resolved user accounts
    let finalShippingAddressId: string | undefined = shippingAddressId || undefined
    if (!finalShippingAddressId && shippingAddressInput && userId) {
      try {
        const createdAddr = await databaseService.createAddress({
          userId,
          type: 'SHIPPING',
          firstName: shippingAddressInput.firstName || 'Customer',
          lastName: shippingAddressInput.lastName || '',
          company: shippingAddressInput.company,
          address1: shippingAddressInput.address1 || '',
          address2: shippingAddressInput.address2,
          city: shippingAddressInput.city || '',
          state: shippingAddressInput.state || '',
          zipCode: shippingAddressInput.zipCode || shippingAddressInput.postalCode || '',
          country: shippingAddressInput.country || 'United States',
          phone: shippingAddressInput.phone,
          isDefault: true
        })
        finalShippingAddressId = createdAddr.id
      } catch (addrErr) {
        console.warn('Could not auto-create saved address:', addrErr)
      }
    }

    // Build structured notes so guest orders always retain buyer/address details for PDF receipt & tracking lookup
    const zipValue = shippingAddressInput?.zipCode || shippingAddressInput?.postalCode || ''
    const fullAddress = shippingAddressInput
      ? `${shippingAddressInput.address1 || ''}${shippingAddressInput.address2 ? `, ${shippingAddressInput.address2}` : ''}, ${shippingAddressInput.city || ''}, ${shippingAddressInput.state || ''} ${zipValue}, ${shippingAddressInput.country || 'United States'}`
          .replace(/^,\s*/, '')
          .trim()
      : undefined

    const structuredSegments: string[] = []
    if (notes && notes.trim()) structuredSegments.push(notes.trim())
    if (fullAddress) structuredSegments.push(`Delivery to ${fullAddress}.`)
    if (customerEmail || zipValue) {
      structuredSegments.push(
        `[Buyer: ${customerEmail || 'Verified Buyer'} | Postal: ${zipValue || 'N/A'}]`
      )
    }
    const mergedNotes = structuredSegments.join(' ')

    const generatedReceiptToken = crypto.randomBytes(24).toString('hex')
    const order = await databaseService.createOrder({
      userId,
      total: pricing.total,
      subtotal: pricing.subtotal,
      tax: pricing.tax,
      shipping: pricing.shipping,
      paymentMethod,
      paymentId: verifiedPaymentId,
      paymentStatus: 'COMPLETED',
      paymentVerified: true,
      receiptToken: generatedReceiptToken,
      status: 'PROCESSING',
      shippingAddressId: finalShippingAddressId,
      billingAddressId: billingAddressId || undefined,
      notes: mergedNotes,
      items: pricing.orderItems.map(({ productId, quantity, price }) => ({
        productId,
        quantity,
        price
      }))
    })

    const effectiveReceiptToken = order.receiptToken || signReceiptAccessToken(order.id)

    // Clear authenticated user's DB cart once order is finalized
    if (userId) {
      databaseService.clearCart(userId).catch(() => {})
    }

    emailService
      .sendPurchaseNotifications(order, {
        accountEmail: authUserToReturn?.email || req.user?.email || customerEmail,
        shippingEmail: customerEmail,
        firstName: shippingAddressInput?.firstName || authUserToReturn?.firstName || customer?.firstName,
        lastName: shippingAddressInput?.lastName || authUserToReturn?.lastName || customer?.lastName,
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
      data: {
        ...order,
        receiptToken: effectiveReceiptToken
      },
      token: tokenToReturn,
      user: authUserToReturn
        ? {
            id: authUserToReturn.id,
            email: authUserToReturn.email,
            firstName: authUserToReturn.firstName,
            lastName: authUserToReturn.lastName,
            role: authUserToReturn.role
          }
        : undefined
    })
  } catch (error) {
    console.error('Error creating order:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to finalize your order right now. Please contact support if payment was captured.'
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

    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 10))
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const offset = (pageNum - 1) * limitNum

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
        currentPage: pageNum,
        totalPages: Math.max(1, Math.ceil(totalOrders / limitNum)),
        totalOrders
      }
    })
  } catch (error) {
    console.error('Error fetching orders:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load orders.'
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

    if (order.userId !== userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this order'
      })
    }

    res.status(200).json({
      success: true,
      data: {
        ...order,
        receiptToken: order.receiptToken || signReceiptAccessToken(order.id)
      }
    })
  } catch (error) {
    console.error('Error fetching order:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load order details.'
    })
  }
}

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const parsed = orderStatusUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid order status value.'
      })
    }

    const orderId = req.params.id
    const updatedOrder = await databaseService.updateOrderStatus(orderId, parsed.data.status)

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
    res.status(500).json({
      success: false,
      error: 'Unable to update order status.'
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
      error: 'Unable to cancel order.'
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
      error: 'Unable to fetch order statistics.'
    })
  }
}

// @desc    Download generated PDF receipt for an order
// @route   GET /api/orders/:id/receipt.pdf
// @access  Private (Customer owner, Admin, or holder of signed receipt token)
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

    const isAdmin = req.user?.role === 'ADMIN'
    const isOwner = Boolean(req.user?.id && order.userId && order.userId === req.user.id)
    const providedToken = String(
      (req.query.token as string) || (req.headers['x-receipt-token'] as string) || ''
    ).trim()

    let matchesStoredToken = false
    if (providedToken && order.receiptToken) {
      const providedBuf = Buffer.from(providedToken, 'utf8')
      const storedBuf = Buffer.from(order.receiptToken, 'utf8')
      matchesStoredToken =
        providedBuf.length === storedBuf.length && crypto.timingSafeEqual(providedBuf, storedBuf)
    }

    const hasValidReceiptToken =
      Boolean(providedToken) && (matchesStoredToken || verifyReceiptAccessToken(order.id, providedToken))

    if (!isAdmin && !isOwner && !hasValidReceiptToken) {
      return res.status(403).json({
        success: false,
        error: 'Please sign in or provide a valid receipt access token to download this receipt.'
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

// @desc    Track an order by Tracking Number (TRK-...) or Order Number (DFE-...)
// @route   GET /api/orders/track/:identifier
// @access  Owner, Admin, or verified email/zip holder
export const trackOrder = async (req: Request, res: Response) => {
  try {
    const rawIdentifier = (req.params.identifier || (req.query.q as string) || '').trim()
    if (!rawIdentifier) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid Tracking Number or Order Number.'
      })
    }

    const order = await databaseService.findOrderByTrackingOrNumber(rawIdentifier)
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'No shipment found matching that tracking or order number. Please check your confirmation email and try again.'
      })
    }

    const isOwnerOrAdmin =
      req.user?.role === 'ADMIN' ||
      Boolean(req.user?.id && order.userId && order.userId === req.user.id)

    const queryEmail = String(req.query.email || '').trim().toLowerCase()
    const queryZip = String(req.query.zip || '').trim().toLowerCase()
    const guestMeta = extractGuestMetadataFromNotes(order.notes)

    const knownEmails = [
      ...(order.user?.email ? [order.user.email.toLowerCase()] : []),
      ...guestMeta.emails
    ]
    const knownZips = [
      ...(order.shippingAddress?.zipCode ? [order.shippingAddress.zipCode.toLowerCase()] : []),
      ...guestMeta.zips
    ]

    const matchesEmail = Boolean(queryEmail && knownEmails.includes(queryEmail))
    const matchesZip = Boolean(queryZip && knownZips.includes(queryZip))

    if (!isOwnerOrAdmin && !matchesEmail && !matchesZip) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        error: 'Please enter the order email address or delivery postal code to view full shipment details.'
      })
    }

    const createdMs = order.createdAt ? new Date(order.createdAt).getTime() : Date.now()
    const updatedMs = order.updatedAt ? new Date(order.updatedAt).getTime() : createdMs
    const estStart = new Date(createdMs + 12 * 24 * 60 * 60 * 1000)
    const estEnd = new Date(createdMs + 20 * 24 * 60 * 60 * 1000)
    const estimatedDelivery = `${estStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${estEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    const addr = order.shippingAddress
    const destinationSummary = addr
      ? `${addr.city || ''}${addr.state ? `, ${addr.state}` : ''} ${addr.zipCode || ''}, ${addr.country || ''}`.replace(/^,\s*/, '').trim()
      : 'Customer Delivery Address on File'

    const statusOrder = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED']
    const currentIdx = Math.max(0, statusOrder.indexOf(order.status))
    const isCancelledOrRefunded = order.status === 'CANCELLED' || order.status === 'REFUNDED'

    const timeline = [
      {
        step: 1,
        key: 'ORDER_CONFIRMED',
        title: 'Order Confirmed & Payment Verified',
        location: 'DriveFlyElectric Order Desk',
        description: `Order #${order.orderNumber} verified and assigned Tracking #${order.trackingNumber}.`,
        completed: !isCancelledOrRefunded && currentIdx >= 0,
        active: !isCancelledOrRefunded && currentIdx === 0,
        timestamp: new Date(createdMs).toISOString()
      },
      {
        step: 2,
        key: 'WAREHOUSE_QC',
        title: 'Quality Control & Protective Crating',
        location: 'DriveFlyElectric Fulfillment & QC Hub',
        description: 'Engineering inspection, battery & powertrain diagnostics, and reinforced export packaging.',
        completed: !isCancelledOrRefunded && currentIdx >= 1,
        active: !isCancelledOrRefunded && currentIdx === 1,
        timestamp: new Date(createdMs + 2 * 60 * 60 * 1000).toISOString()
      },
      {
        step: 3,
        key: 'INTERNATIONAL_TRANSIT',
        title: 'International Express Freight & Customs Clearance',
        location: 'Global Air & Sea Freight Network',
        description: 'Dispatched with priority customs documentation and live freight monitoring.',
        completed: !isCancelledOrRefunded && currentIdx >= 2,
        active: !isCancelledOrRefunded && currentIdx === 2,
        timestamp: currentIdx >= 2 ? new Date(updatedMs).toISOString() : null
      },
      {
        step: 4,
        key: 'FINAL_DELIVERY',
        title: 'Delivered to Destination',
        location: destinationSummary,
        description: 'Delivered directly to the recipient address.',
        completed: !isCancelledOrRefunded && currentIdx >= 3,
        active: !isCancelledOrRefunded && currentIdx === 3,
        timestamp: currentIdx >= 3 ? new Date(updatedMs).toISOString() : null
      }
    ]

    return res.status(200).json({
      success: true,
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        trackingNumber: order.trackingNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        total: order.total,
        subtotal: order.subtotal,
        tax: order.tax,
        shipping: order.shipping,
        carrier: 'DriveFlyExpress Global Freight',
        dispatchWarehouse: 'DriveFlyElectric International Fulfillment Center',
        destination: destinationSummary,
        estimatedDelivery,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: (order.items || []).map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product?.name || 'DriveFlyElectric Performance Vehicle',
          image: item.product?.images?.[0] || '/images/MicroHelicpter.jpeg',
          category: item.product?.category || 'Fleet',
          quantity: item.quantity,
          price: item.price,
          total: item.total
        })),
        timeline
      }
    })
  } catch (error) {
    console.error('Error tracking order:', error)
    return res.status(500).json({
      success: false,
      error: 'Unable to retrieve tracking status right now.'
    })
  }
}