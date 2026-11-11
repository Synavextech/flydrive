import express from 'express'
import multer from 'multer'
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
  downloadAdminOrderReceiptPdf
} from '../controllers/adminController.js'
import { protect, authorize } from '../middleware/auth.js'

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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, clientImagesDir)
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
    cb(null, `prod_${Date.now()}_${safeName}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (supporting higher-res images & video)
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image and video files are allowed.'))
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

// Real-time system activity notifications
router.get('/notifications', getNotifications)
router.get('/notifications/stream', streamNotifications)

// User management
router.get('/users', getUsers)
router.put('/users/:id/status', updateUserStatus)

export default router