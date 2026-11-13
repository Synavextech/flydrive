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
import { createRateLimiter } from '../middleware/security.js'

const router = express.Router()

const orderTrackRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  keyPrefix: 'order-track',
  message: 'Too many shipment tracking requests. Please wait a few minutes and try again.'
})

const orderCreateRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: 'order-create',
  message: 'Too many order submission attempts. Please wait a moment before retrying.'
})

const receiptRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: 'order-receipt',
  message: 'Too many receipt requests. Please wait a moment and try again.'
})

// Public order tracking lookup by Tracking Number or Order Number (requires owner or email/zip verification)
router.get('/track/:identifier', orderTrackRateLimit, optionalAuth, trackOrder)

// Customer order placement allows verified guest checkout or authenticated checkout
router.post('/', orderCreateRateLimit, optionalAuth, createOrder)
router.get('/:id/receipt.pdf', receiptRateLimit, optionalAuth, downloadOrderReceiptPdf)

// Protected customer and admin routes
router.use(protect)
router.get('/', getOrders)
router.get('/stats', authorize('ADMIN'), getOrderStats)
router.get('/:id', getOrder)
router.put('/:id/cancel', cancelOrder)

// Admin order management
router.put('/:id/status', authorize('ADMIN'), updateOrderStatus)

export default router