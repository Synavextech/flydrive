import express from 'express'
import multer from 'multer'
import crypto from 'crypto'
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
  createProductReview,
  createProductBooking
} from '../controllers/productController.js'
import { protect, authorize, optionalAuth } from '../middleware/auth.js'
import { createRateLimiter, isAllowedMediaExtension, validateUploadedFiles } from '../middleware/security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

const reviewUploadRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: 'review-upload',
  message: 'Too many image uploads. Please wait a few minutes before uploading more.'
})

const reviewSubmitRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'review-submit',
  message: 'Too many review submissions. Please try again later.'
})

const bookingRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'product-booking',
  message: 'Too many booking requests from this network. Please wait a few minutes.'
})

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
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg'
    cb(null, `rev_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`)
  }
})

const reviewUpload = multer({
  storage: reviewStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMediaExtension(file.originalname, file.mimetype, false)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed for review uploads.'))
    }
  }
})

// Public review routes (placed before /:id)
router.get('/reviews/all', getAllProductReviews)
router.post('/reviews/upload', reviewUploadRateLimit, reviewUpload.any(), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : [])
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No review image uploaded' })
  }

  if (files.length > 4) {
    for (const f of files) {
      if (f.path && fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path) } catch {}
      }
    }
    return res.status(400).json({ success: false, error: 'Maximum of 4 review images allowed.' })
  }

  const validation = validateUploadedFiles(files, { allowVideos: false })
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error })
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

// Public product, review & coming-soon reservation routes
router.get('/', getProducts)
router.get('/:id/reviews', getProductReviews)
router.post('/:id/reviews', reviewSubmitRateLimit, optionalAuth, createProductReview)
router.post('/:id/book', bookingRateLimit, optionalAuth, createProductBooking)
router.get('/:id', getProduct)

// Protected Admin routes
router.post('/', protect, authorize('ADMIN'), createProduct)
router.put('/:id', protect, authorize('ADMIN'), updateProduct)
router.delete('/:id', protect, authorize('ADMIN'), deleteProduct)

export default router