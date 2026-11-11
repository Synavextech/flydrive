import { Request, Response } from 'express'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'
import { buildReceiptDataFromOrder, generateReceiptPdfBuffer } from '../utils/receiptPdf.js'

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

    const { category, search, limit = '100', page = '1' } = req.query

    const limitNum = parseInt(limit as string)
    const offset = (parseInt(page as string) - 1) * limitNum

    const where: any = {}
    if (category) where.category = category
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    const [products, totalProducts] = await Promise.all([
      databaseService.findProducts({
        category: category as string,
        search: search as string,
        limit: limitNum,
        offset
      }),
      databaseService.getProductCount({
        category: category as string,
        search: search as string
      })
    ])

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        currentPage: parseInt(page as string),
        totalPages: Math.ceil(totalProducts / limitNum),
        totalProducts
      }
    })
  } catch (error) {
    console.error('Error fetching admin products:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
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

    const productData = req.body

    const newProduct = await databaseService.createProduct(productData)

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: newProduct
    })
  } catch (error) {
    console.error('Error creating product:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
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

    const productId = req.params.id
    const updateData = req.body

    const updatedProduct = await databaseService.updateProduct(productId, updateData)

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    })
  } catch (error) {
    console.error('Error updating product:', error)
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

    const limitNum = parseInt(limit as string)
    const offset = (parseInt(page as string) - 1) * limitNum

    const where: any = {}
    if (status) where.status = status

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
        currentPage: parseInt(page as string),
        totalPages: Math.ceil(totalOrders / limitNum),
        totalOrders
      }
    })
  } catch (error) {
    console.error('Error fetching admin orders:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
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

    const { status } = req.body
    const orderId = req.params.id

    const updatedOrder = await databaseService.updateOrderStatus(orderId, status)

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

    const { isActive } = req.body
    const userId = req.params.id

    const updatedUser = await databaseService.updateUser(userId, { isActive })

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedUser
    })
  } catch (error) {
    console.error('Error updating user status:', error)
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
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