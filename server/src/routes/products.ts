import express from 'express'
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/productController.js'
import { protect, authorize } from '../middleware/auth.js'

const router = express.Router()

// Public routes
router.get('/', getProducts)
router.get('/:id', getProduct)

// Protected Admin routes
router.post('/', protect, authorize('ADMIN'), createProduct)
router.put('/:id', protect, authorize('ADMIN'), updateProduct)
router.delete('/:id', protect, authorize('ADMIN'), deleteProduct)

export default router