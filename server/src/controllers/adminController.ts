import { Request, Response } from 'express'
import { z } from 'zod'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'
import { buildReceiptDataFromOrder, generateReceiptPdfBuffer } from '../utils/receiptPdf.js'

const optionalNullableNumber = z.preprocess(
  (val) => (val === '' || val === undefined || val === null ? null : val),
  z.coerce.number().min(0).max(10000000).nullable()
)

const adminProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required.').max(200),
  description: z.string().trim().max(10000).optional().nullable(),
  price: z.coerce.number().min(0).max(10000000),
  originalPrice: optionalNullableNumber.optional(),
  sku: z.string().trim().min(1, 'SKU is required.').max(100),
  stock: z.coerce.number().int().min(0).max(100000).default(0),
  images: z.array(z.string().trim().max(2048)).max(20).optional().default([]),
  category: z.string().trim().min(1, 'Category is required.').max(100),
  brand: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  isNew: z.boolean().optional().default(false),
  isComingSoon: z.boolean().optional().default(false),
  comingSoonRelease: z.string().trim().max(100).optional().nullable(),
  shippingRequired: z.boolean().optional().default(true),
  averageDeliveryTime: z.string().trim().max(100).optional().nullable(),
  weight: optionalNullableNumber.optional(),
  dimensions: z.string().trim().max(150).optional().nullable()
})

const adminProductUpdateSchema = adminProductSchema.partial()

const orderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
})

const userStatusSchema = z.object({
  isActive: z.boolean()
})

const bookingStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'NOTIFIED', 'CANCELLED'])
})

const replySupportSchema = z.object({
  content: z.string().trim().min(1, 'Reply message content is required.').max(2000)
})

const sanitizeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
})

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
// @access  Private/Admin
export const getDashboard = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const [
      totalProducts,
      totalOrders,
      totalUsers,
      totalRevenue,
      recentOrders,
      lowStockProducts
    ] = await Promise.all([
      databaseService.getProductCount(),
      databaseService.getOrderCount(),
      databaseService.getUserCount(),
      databaseService.getTotalRevenue(),
      databaseService.findOrders({ limit: 5 }),
      databaseService.findProducts({ limit: 5 })
    ])

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        totalUsers,
        totalRevenue,
        stats: {
          totalProducts,
          totalOrders,
          totalUsers,
          totalRevenue
        },
        recentOrders,
        lowStockProducts
      }
    })
  } catch (error) {
    console.error('Error fetching admin dashboard:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get all products (Admin)
// @route   GET /api/admin/products
// @access  Private/Admin
export const getProducts = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const { category, search, comingSoon, limit = '100', page = '1' } = req.query

    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 100))
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const offset = (pageNum - 1) * limitNum
    const comingSoonFilter =
      comingSoon === 'true' ? true : comingSoon === 'false' ? false : undefined

    const [products, totalProducts] = await Promise.all([
      databaseService.findProducts({
        category: category as string,
        search: search as string,
        comingSoon: comingSoonFilter,
        includeInactive: true,
        limit: limitNum,
        offset
      }),
      databaseService.getProductCount({
        category: category as string,
        search: search as string,
        comingSoon: comingSoonFilter,
        includeInactive: true
      })
    ])

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.max(1, Math.ceil(totalProducts / limitNum)),
        totalProducts
      }
    })
  } catch (error) {
    console.error('Error fetching admin products:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to fetch products.'
    })
  }
}

// @desc    Create product (Admin)
// @route   POST /api/admin/products
// @access  Private/Admin
export const createProduct = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const parsed = adminProductSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid product payload.'
      })
    }

    const newProduct = await databaseService.createProduct(parsed.data)

    emailService.recordActivity({
      type: 'PRODUCT_UPDATED',
      title: `New Fleet Item Added • ${newProduct.name}`,
      message: `Created ${newProduct.name} (SKU: ${newProduct.sku} | Category: ${newProduct.category}) at $${Number(newProduct.price).toLocaleString()} USD.`,
      amount: Number(newProduct.price),
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: newProduct
    })
  } catch (error) {
    console.error('Error creating product:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to create product.'
    })
  }
}

// @desc    Update product (Admin)
// @route   PUT /api/admin/products/:id
// @access  Private/Admin
export const updateProduct = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const parsed = adminProductUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid product update payload.'
      })
    }

    const productId = req.params.id
    const updatedProduct = await databaseService.updateProduct(productId, parsed.data)

    emailService.recordActivity({
      type: 'PRODUCT_UPDATED',
      title: `Fleet Item Updated • ${updatedProduct.name}`,
      message: `Updated ${updatedProduct.name} (SKU: ${updatedProduct.sku} | Stock: ${updatedProduct.stock}).`,
      amount: Number(updatedProduct.price),
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    })
  } catch (error) {
    console.error('Error updating product:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update product.'
    })
  }
}

// @desc    Delete product (Admin)
// @route   DELETE /api/admin/products/:id
// @access  Private/Admin
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const productId = req.params.id

    await databaseService.deleteProduct(productId)

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get all orders (Admin)
// @route   GET /api/admin/orders
// @access  Private/Admin
export const getOrders = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const { status, limit = '20', page = '1' } = req.query

    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20))
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const offset = (pageNum - 1) * limitNum

    const [orders, totalOrders] = await Promise.all([
      databaseService.findOrders({
        status: status as string,
        limit: limitNum,
        offset
      }),
      databaseService.getOrderCount({
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
    console.error('Error fetching admin orders:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load orders.'
    })
  }
}

// @desc    Update order status (Admin)
// @route   PUT /api/admin/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const parsed = orderStatusSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid order status.'
      })
    }

    const orderId = req.params.id
    const updatedOrder = await databaseService.updateOrderStatus(orderId, parsed.data.status)

    emailService
      .sendOrderStatusUpdate(updatedOrder, updatedOrder.user?.email)
      .catch((err) => console.error('Admin order status update email error:', err))

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

// @desc    Get all users (Admin)
// @route   GET /api/admin/users
// @access  Private/Admin
export const getUsers = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const { limit = '20', page = '1' } = req.query

    const limitNum = parseInt(limit as string)
    const offset = (parseInt(page as string) - 1) * limitNum

    const [users, totalUsers] = await Promise.all([
      databaseService.findUsers({
        limit: limitNum,
        offset
      }),
      databaseService.getUserCount()
    ])

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page as string),
        totalPages: Math.ceil(totalUsers / limitNum),
        totalUsers
      }
    })
  } catch (error) {
    console.error('Error fetching admin users:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Update user status (Admin)
// @route   PUT /api/admin/users/:id/status
// @access  Private/Admin
export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const parsed = userStatusSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'isActive must be a boolean.'
      })
    }

    const userId = req.params.id
    if (req.user!.id === userId && !parsed.data.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Administrators cannot deactivate their own account.'
      })
    }

    const updatedUser = await databaseService.updateUser(userId, { isActive: parsed.data.isActive })

    res.status(200).json({
      success: true,
      message: `User ${parsed.data.isActive ? 'activated' : 'deactivated'} successfully`,
      data: sanitizeUser(updatedUser)
    })
  } catch (error) {
    console.error('Error updating user status:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update user status.'
    })
  }
}

// @desc    Get analytics data (Admin)
// @route   GET /api/admin/analytics
// @access  Private/Admin
export const getAnalytics = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const [
      ordersByStatusList,
      topProducts,
      recentActivity
    ] = await Promise.all([
      databaseService.findOrders({ limit: 100 }),
      databaseService.findProducts({ limit: 10 }),
      databaseService.findOrders({ limit: 10 })
    ])

    const ordersByStatus = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(s => ({
      status: s,
      _count: { id: ordersByStatusList.filter(o => o.status === s).length }
    }))

    const revenueByMonth = [
      { month: new Date().toISOString().substring(0, 7), revenue: await databaseService.getTotalRevenue(), orders: ordersByStatusList.length }
    ]

    res.status(200).json({
      success: true,
      data: {
        revenueByMonth,
        ordersByStatus,
        topProducts,
        recentActivity
      }
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get recent real-time system activity notifications (Admin)
// @route   GET /api/admin/notifications
// @access  Private/Admin
export const getNotifications = async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: emailService.getRecentActivities(30)
  })
}

// @desc    Stream real-time system activity notifications via SSE (Admin)
// @route   GET /api/admin/notifications/stream
// @access  Private/Admin
export const streamNotifications = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const onActivity = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  emailService.activityEmitter.on('activity', onActivity)

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`)
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    emailService.activityEmitter.off('activity', onActivity)
  })
}

// @desc    Download generated PDF receipt for an order (Admin)
// @route   GET /api/admin/orders/:id/receipt.pdf
// @access  Private/Admin
export const downloadAdminOrderReceiptPdf = async (req: Request, res: Response) => {
  try {
    const order = await databaseService.findOrderById(req.params.id)
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      })
    }

    const receiptData = buildReceiptDataFromOrder(order)
    const pdfBuffer = generateReceiptPdfBuffer(receiptData)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Receipt-${receiptData.orderNumber}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.status(200).send(pdfBuffer)
  } catch (error) {
    console.error('Error generating admin order receipt PDF:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate receipt PDF'
    })
  }
}

// @desc    Get all LiveChat support sessions (Admin)
// @route   GET /api/admin/support/sessions
// @access  Private/Admin
export const getSupportSessions = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const sessions = await databaseService.listSupportSessions()
    res.status(200).json({
      success: true,
      data: sessions
    })
  } catch (error) {
    console.error('Error fetching support sessions:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch support sessions'
    })
  }
}

// @desc    Reply to a client LiveChat support session (Admin)
// @route   POST /api/admin/support/sessions/:id/reply
// @access  Private/Admin
export const replySupportSession = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const sessionId = req.params.id
    const parsed = replySupportSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Reply message content is required.'
      })
    }

    const cleanContent = parsed.data.content
    const adminFirstName = (req.user as any)?.firstName
    const senderName = adminFirstName
      ? `${adminFirstName} (DriveFlyElectric Support)`
      : 'DriveFlyElectric Support Specialist'

    const result = await databaseService.appendSupportMessage(sessionId, {
      senderRole: 'ADMIN',
      senderName,
      content: cleanContent
    })

    // Dispatch SMTP email copy to client (if visitorEmail is provided) and log to Real-Time System Activity stream
    emailService
      .sendSupportReplyNotification(result.session, cleanContent, senderName)
      .catch((err) => console.error('Support reply notification error:', err))

    res.status(200).json({
      success: true,
      data: result.session
    })
  } catch (error) {
    console.error('Error replying to support session:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to send support reply'
    })
  }
}

// @desc    Update LiveChat support session status or mark read (Admin)
// @route   PUT /api/admin/support/sessions/:id/status
// @access  Private/Admin
export const updateSupportSessionStatus = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const sessionId = req.params.id
    const { status, markRead } = req.body

    let session = null
    if (markRead) {
      session = await databaseService.markSupportSessionRead(sessionId, 'ADMIN')
    }
    if (status === 'OPEN' || status === 'RESOLVED') {
      session = await databaseService.updateSupportSessionStatus(sessionId, status)
    }
    if (!session) {
      session = await databaseService.getSupportSession(sessionId)
    }

    res.status(200).json({
      success: true,
      data: session
    })
  } catch (error) {
    console.error('Error updating support session status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update support session'
    })
  }
}

// @desc    Get all Coming Soon vehicle booking requests (Admin)
// @route   GET /api/admin/bookings
// @access  Private/Admin
export const getProductBookings = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const bookings = await databaseService.listProductBookings()
    res.status(200).json({
      success: true,
      data: bookings
    })
  } catch (error) {
    console.error('Error fetching product bookings:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to fetch reservation bookings.'
    })
  }
}

// @desc    Update a Coming Soon vehicle booking status (Admin)
// @route   PUT /api/admin/bookings/:id/status
// @access  Private/Admin
export const updateProductBookingStatus = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const parsed = bookingStatusSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid booking status.'
      })
    }

    const updated = await databaseService.updateProductBookingStatus(req.params.id, parsed.data.status)
    res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: updated
    })
  } catch (error) {
    console.error('Error updating product booking status:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update booking status.'
    })
  }
}