import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProductReviews,
  getProductReviews,
  createProductReview
} from '../controllers/productController.js'
import { protect, authorize, optionalAuth } from '../middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Configure Multer storage for customer review image uploads with dual-write into client/public/images and dist/images
const clientImagesDir = path.resolve(__dirname, '../../../client/public/images')
const distImagesDir = path.resolve(__dirname, '../../../dist/images')

if (!fs.existsSync(clientImagesDir)) {
  fs.mkdirSync(clientImagesDir, { recursive: true })
}
if (!fs.existsSync(distImagesDir)) {
  fs.mkdirSync(distImagesDir, { recursive: true })
}

const reviewStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, clientImagesDir)
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
    cb(null, `rev_${Date.now()}_${safeName}`)
  }
})

const reviewUpload = multer({
  storage: reviewStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per review photo
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed for review uploads.'))
    }
  }
})

// Public review routes (placed before /:id)
router.get('/reviews/all', getAllProductReviews)
router.post('/reviews/upload', reviewUpload.any(), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : [])
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No review image uploaded' })
  }

  const urls: string[] = []
  try {
    if (!fs.existsSync(distImagesDir)) {
      fs.mkdirSync(distImagesDir, { recursive: true })
    }
    for (const f of files) {
      const distTarget = path.join(distImagesDir, f.filename)
      fs.copyFileSync(f.path, distTarget)
      urls.push(`/images/${f.filename}`)
    }
  } catch (syncErr) {
    console.warn('Notice: Could not sync review image to dist/images:', syncErr)
    for (const f of files) {
      if (!urls.includes(`/images/${f.filename}`)) {
        urls.push(`/images/${f.filename}`)
      }
    }
  }

  res.status(200).json({
    success: true,
    data: {
      url: urls[0],
      urls,
      count: urls.length
    }
  })
})

// Public product & per-product review routes
router.get('/', getProducts)
router.get('/:id/reviews', getProductReviews)
router.post('/:id/reviews', optionalAuth, createProductReview)
router.get('/:id', getProduct)

// Protected Admin routes
router.post('/', protect, authorize('ADMIN'), createProduct)
router.put('/:id', protect, authorize('ADMIN'), updateProduct)
router.delete('/:id', protect, authorize('ADMIN'), deleteProduct)

export default router