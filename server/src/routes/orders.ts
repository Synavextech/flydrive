import express from 'express'
import {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  getOrderStats,
  downloadOrderReceiptPdf,
  trackOrder
} from '../controllers/orderController.js'
import { protect, authorize, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Public order tracking lookup by Tracking Number or Order Number
router.get('/track/:identifier', optionalAuth, trackOrder)

// Customer order placement allows guest checkout with optional authentication
router.post('/', optionalAuth, createOrder)
router.get('/:id/receipt.pdf', optionalAuth, downloadOrderReceiptPdf)

// Protected customer and admin routes
router.use(protect)
router.get('/', getOrders)
router.get('/stats', authorize('ADMIN'), getOrderStats)
router.get('/:id', getOrder)
router.put('/:id/cancel', cancelOrder)

// Admin order management
router.put('/:id/status', authorize('ADMIN'), updateOrderStatus)

export default router