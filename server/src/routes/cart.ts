import express from 'express'
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  syncCartReminderSnapshot,
  clearCartReminderSnapshot
} from '../controllers/cartController.js'
import { optionalAuth, protect } from '../middleware/auth.js'
import { createRateLimiter } from '../middleware/security.js'

const router = express.Router()

const reminderSnapshotLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyPrefix: 'cart-reminder-snapshot',
  message: 'Too many cart sync requests. Please wait a moment.'
})

// Guest & authenticated abandoned-cart reminder snapshot sync
router.post('/reminder-snapshot', reminderSnapshotLimiter, optionalAuth, syncCartReminderSnapshot)
router.delete('/reminder-snapshot', reminderSnapshotLimiter, optionalAuth, clearCartReminderSnapshot)

// All cart mutation & read routes below require authentication
router.use(protect)

// Cart operations
router.get('/', getCart)
router.delete('/', clearCart)

// Item operations - support both /items and direct path for seamless client compatibility
router.post('/', addToCart)
router.post('/items', addToCart)

router.put('/items/:itemId', updateCartItem)
router.put('/:itemId', updateCartItem)

router.delete('/items/:itemId', removeFromCart)
router.delete('/:itemId', removeFromCart)

export default router