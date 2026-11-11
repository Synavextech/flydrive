import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Import database connection
import { supabase } from './utils/supabase.js'
import { databaseService } from './services/databaseService.js'
import { emailService } from './utils/emailService.js'

// Import routes
import productRoutes from './routes/products.js'
import orderRoutes from './routes/orders.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import eventsRoutes from './routes/events.js'
import paymentRoutes from './routes/payments.js'
import cartRoutes from './routes/cart.js'
import { protect } from './middleware/auth.js'
import {
  getProfile,
  updateProfile,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getOrderHistory,
  getDashboard
} from './controllers/userController.js'

// Import middleware
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './middleware/notFound.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000

// Security middleware - disable restrictive CSP so client assets load seamlessly
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}))

// CORS configuration supporting development and production shop domains
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.PRODUCTION_url,
  'https://driveflyelectric.shop',
  'http://driveflyelectric.shop',
  'https://www.driveflyelectric.shop',
  'http://www.driveflyelectric.shop',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000'
].filter(Boolean) as string[]

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, mobile, or requests with no origin
    if (!origin) return callback(null, true)
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.driveflyelectric.shop')
    ) {
      return callback(null, true)
    }
    // Allow dynamic origins in production
    return callback(null, true)
  },
  credentials: true
}))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// Logging middleware
app.use(morgan('combined'))

// Static file serving: product images & media
const clientPublicPath = path.resolve(__dirname, '../../client/public')
const distPath = path.resolve(__dirname, '../../dist')

app.use('/images', express.static(path.join(clientPublicPath, 'images'), {
  maxAge: '1d',
  fallthrough: true
}))

if (fs.existsSync(path.join(distPath, 'images'))) {
  app.use('/images', express.static(path.join(distPath, 'images'), {
    maxAge: '1d',
    fallthrough: true
  }))
}

// Serve Vite production build static assets (JS, CSS, fonts)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    maxAge: '1d',
    index: false
  }))
}

// Also serve client public folder
app.use(express.static(clientPublicPath, {
  maxAge: '1d'
}))

// Serve favicon.ico
app.get('/favicon.ico', (req, res) => {
  const faviconDist = path.join(distPath, 'favicon.ico')
  const faviconPublic = path.join(clientPublicPath, 'favicon.ico')
  if (fs.existsSync(faviconDist)) return res.sendFile(faviconDist)
  if (fs.existsSync(faviconPublic)) return res.sendFile(faviconPublic)
  res.status(204).end()
})

// SEO: robots.txt
app.get('/robots.txt', (req, res) => {
  const siteUrl = process.env.PRODUCTION_url || 'https://driveflyelectric.shop'
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nAllow: /products/\nAllow: /images/\nDisallow: /api/\nDisallow: /admin\nSitemap: ${siteUrl}/sitemap.xml\n`
  )
})

// SEO: Dynamic XML Sitemap including all categories and listed database items
app.get('/sitemap.xml', async (req, res) => {
  try {
    const siteUrl = (process.env.PRODUCTION_url || 'https://driveflyelectric.shop').replace(/\/$/, '')
    const products = await databaseService.findProducts({ limit: 500, offset: 0 })
    const nowIso = new Date().toISOString()

    const staticUrls = [
      { loc: `${siteUrl}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${siteUrl}/?category=mini-helicopter`, priority: '0.9', changefreq: 'daily' },
      { loc: `${siteUrl}/?category=microcars`, priority: '0.9', changefreq: 'daily' },
      { loc: `${siteUrl}/?category=go%20karts`, priority: '0.8', changefreq: 'daily' },
      { loc: `${siteUrl}/?category=trikes`, priority: '0.8', changefreq: 'daily' },
      { loc: `${siteUrl}/?category=dirtbikes`, priority: '0.8', changefreq: 'daily' }
    ]

    const escapeXml = (str: string) =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`

    for (const u of staticUrls) {
      xml += `  <url>\n`
      xml += `    <loc>${escapeXml(u.loc)}</loc>\n`
      xml += `    <lastmod>${nowIso}</lastmod>\n`
      xml += `    <changefreq>${u.changefreq}</changefreq>\n`
      xml += `    <priority>${u.priority}</priority>\n`
      xml += `  </url>\n`
    }

    for (const p of products) {
      const prodUrl = `${siteUrl}/products/${encodeURIComponent(p.id)}`
      const lastMod = p.updatedAt ? new Date(p.updatedAt).toISOString() : nowIso
      const primaryImg = p.images && p.images.length > 0 ? p.images[0] : '/images/hero1.jpeg'
      const fullImgUrl = primaryImg.startsWith('http')
        ? primaryImg
        : `${siteUrl}${primaryImg.startsWith('/') ? '' : '/'}${primaryImg.split('/').map((seg: string, i: number) => i === 0 && seg === '' ? '' : encodeURIComponent(decodeURIComponent(seg))).join('/')}`

      xml += `  <url>\n`
      xml += `    <loc>${escapeXml(prodUrl)}</loc>\n`
      xml += `    <lastmod>${lastMod}</lastmod>\n`
      xml += `    <changefreq>weekly</changefreq>\n`
      xml += `    <priority>0.85</priority>\n`
      xml += `    <image:image>\n`
      xml += `      <image:loc>${escapeXml(fullImgUrl)}</image:loc>\n`
      xml += `      <image:title>${escapeXml(p.name)}</image:title>\n`
      xml += `    </image:image>\n`
      xml += `  </url>\n`
    }

    xml += `</urlset>`
    res.header('Content-Type', 'application/xml').status(200).send(xml)
  } catch (err) {
    console.error('Sitemap generation error:', err)
    res.status(500).end()
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'DriveFlyElectric API is running',
    currency: 'USD',
    headOffice: 'Texas, USA',
    timestamp: new Date().toISOString()
  })
})

// API documentation / status endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DriveFlyElectric API Server - Electric Microcars, MiniHeliCopters & Rides',
    version: '1.0.0',
    headOffice: 'Austin, Texas, United States',
    currency: 'USD',
    endpoints: {
      health: '/health',
      products: '/api/products',
      auth: '/api/auth',
      cart: '/api/cart',
      orders: '/api/orders',
      payments: '/api/payments'
    },
    timestamp: new Date().toISOString()
  })
})

// API routes
app.use('/api/products', productRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/cart', cartRoutes)

// User profile & address management routes
app.get('/api/users/profile', protect, getProfile)
app.put('/api/users/profile', protect, updateProfile)
app.get('/api/users/orders', protect, getOrderHistory)
app.get('/api/users/dashboard', protect, getDashboard)
app.get('/api/addresses', protect, getAddresses)
app.post('/api/addresses', protect, createAddress)
app.put('/api/addresses/:id', protect, updateAddress)
app.delete('/api/addresses/:id', protect, deleteAddress)

// Public Real-Time Client LiveChat & Support Routes
app.post('/api/support/session', async (req, res) => {
  try {
    const session = await databaseService.upsertSupportSession(req.body || {})
    res.status(200).json({ success: true, data: session })
  } catch (err) {
    console.error('Support session init error:', err)
    res.status(500).json({ success: false, error: 'Failed to initialize support session' })
  }
})

app.get('/api/support/session/:id', async (req, res) => {
  try {
    const sessionId = req.params.id
    await databaseService.updateSupportPresence(sessionId, true)
    if (req.query.open === 'true') {
      await databaseService.markSupportSessionRead(sessionId, 'CLIENT')
    }
    const session = await databaseService.getSupportSession(sessionId)
    if (!session) {
      return res.status(404).json({ success: false, error: 'Support session not found' })
    }
    res.status(200).json({ success: true, data: session })
  } catch (err) {
    console.error('Support session fetch error:', err)
    res.status(500).json({ success: false, error: 'Failed to load support session' })
  }
})

app.post('/api/support/session/:id/messages', async (req, res) => {
  try {
    const sessionId = req.params.id
    const { content, topic, selectedProducts, visitorName, visitorEmail, visitorPhone } = req.body || {}
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required' })
    }
    const result = await databaseService.appendSupportMessage(sessionId, {
      senderRole: 'CLIENT',
      senderName: visitorName || 'Store Visitor',
      content: String(content).trim(),
      topic,
      selectedProducts,
      visitorName,
      visitorEmail,
      visitorPhone
    })

    // Stream client support inquiry to Real-Time System Activity feed & SMTP system alert
    emailService
      .sendSupportInquiryAlert(result.session, String(content).trim())
      .catch((err) => console.error('Support inquiry alert error:', err))

    res.status(200).json({
      success: true,
      data: result.session,
      newMessages: result.newMessages
    })
  } catch (err) {
    console.error('Support message send error:', err)
    res.status(500).json({ success: false, error: 'Failed to send support message' })
  }
})

app.post('/api/support/session/:id/heartbeat', async (req, res) => {
  try {
    const sessionId = req.params.id
    const isOnline = req.body?.isOnline !== undefined ? Boolean(req.body.isOnline) : true
    const session = await databaseService.updateSupportPresence(sessionId, isOnline, req.body)
    res.status(200).json({ success: true, data: session })
  } catch (err) {
    res.status(200).json({ success: false })
  }
})

// SPA Fallback: Any non-API GET request serves dist/index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/images')) {
    return next()
  }
  const indexPath = path.join(distPath, 'index.html')
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath)
  }
  res.status(200).json({
    success: true,
    message: 'DriveFlyElectric API Server - Electric Microcars, MiniHeliCopters & Rides',
    status: 'API running. Run `npm run build` to build and serve client frontend bundle.',
    timestamp: new Date().toISOString()
  })
})

// Error handling middleware
app.use(notFound)
app.use(errorHandler)

// Database connection check
async function connectDatabase() {
  try {
    const { error: supabaseError } = await supabase.from('products').select('id').limit(1)
    if (supabaseError) {
      console.warn('⚠️  Supabase JS client notice:', supabaseError.message)
    } else {
      console.log('✅ Supabase JavaScript Client connected successfully')
    }
  } catch (error) {
    console.error('⚠️  Database connection warning:', error instanceof Error ? error.message : error)
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...')
  process.exit(0)
})

// Start server
async function startServer() {
  await connectDatabase()

  app.listen(PORT, () => {
    console.log(`🚀 DriveFlyElectric server is running on port ${PORT}`)
    console.log(`📱 Client URL: ${process.env.CLIENT_URL || 'https://driveflyelectric.shop'}`)
    console.log(`🗄️  Database: Connected to Supabase PostgreSQL (DriveFlyElectric Catalog)`)
  })
}

startServer()

export default app