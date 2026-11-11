import express from 'express'
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
} from '../controllers/cartController.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

// All cart routes require authentication
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