import express from 'express'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  getDashboard,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  updateOrderStatus,
  getUsers,
  updateUserStatus,
  getAnalytics,
  getNotifications,
  streamNotifications,
  downloadAdminOrderReceiptPdf,
  getSupportSessions,
  replySupportSession,
  updateSupportSessionStatus,
  getProductBookings,
  updateProductBookingStatus
} from '../controllers/adminController.js'
import { protect, authorize } from '../middleware/auth.js'
import { isAllowedMediaExtension, validateUploadedFiles } from '../middleware/security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Configure Multer storage for product uploads with dual-write into client/public/images and dist/images
const clientImagesDir = path.resolve(__dirname, '../../../client/public/images')
const distImagesDir = path.resolve(__dirname, '../../../dist/images')

if (!fs.existsSync(clientImagesDir)) {
  fs.mkdirSync(clientImagesDir, { recursive: true })
}
if (!fs.existsSync(distImagesDir)) {
  fs.mkdirSync(distImagesDir, { recursive: true })
}

const allowedAdminExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.webm'])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, clientImagesDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safeExt = allowedAdminExtensions.has(ext) ? ext : '.jpg'
    cb(null, `prod_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }, // 50MB (supporting higher-res images & video)
  fileFilter: (_req, file, cb) => {
    if (isAllowedMediaExtension(file.originalname, file.mimetype, true)) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported file format. Allowed: JPG, PNG, WEBP, GIF images and MP4, MOV, WEBM videos.'))
    }
  }
})

// All admin routes require authentication and ADMIN role
router.use(protect, authorize('ADMIN'))

// File upload endpoint for admin catalog items (supports single or multiple media files)
router.post('/upload', upload.any(), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : [])
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No media file uploaded' })
  }

  const validation = validateUploadedFiles(files, { allowVideos: true })
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error })
  }

  // Dual-write sync: copy uploaded file(s) to dist/images for immediate live serving
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
    console.warn('Notice: Could not sync media to dist/images:', syncErr)
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
      count: urls.length,
      filename: files[0].filename
    }
  })
})

// Dashboard and analytics
router.get('/dashboard', getDashboard)
router.get('/analytics', getAnalytics)

// Product management
router.get('/products', getProducts)
router.post('/products', createProduct)
router.put('/products/:id', updateProduct)
router.delete('/products/:id', deleteProduct)

// Order management
router.get('/orders', getOrders)
router.get('/orders/:id/receipt.pdf', downloadAdminOrderReceiptPdf)
router.put('/orders/:id/status', updateOrderStatus)

// Coming-soon booking management
router.get('/bookings', getProductBookings)
router.put('/bookings/:id/status', updateProductBookingStatus)

// Real-time system activity notifications
router.get('/notifications', getNotifications)
router.get('/notifications/stream', streamNotifications)

// User management
router.get('/users', getUsers)
router.put('/users/:id/status', updateUserStatus)

// LiveChat & Support session management
router.get('/support/sessions', getSupportSessions)
router.post('/support/sessions/:id/reply', replySupportSession)
router.put('/support/sessions/:id/status', updateSupportSessionStatus)

export default router