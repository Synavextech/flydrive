import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables before reading config
dotenv.config()

// Import database connection & helpers
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
import { optionalAuth, protect } from './middleware/auth.js'
import {
  createRateLimiter,
  isAllowedOrigin,
  signSupportVisitorToken,
  validateStartupEnvironment,
  verifySupportVisitorToken
} from './middleware/security.js'
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

// Enforce required security environment configuration on boot
validateStartupEnvironment()

const app = express()
const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000

// Security middleware with tailored CSP supporting Stripe Elements & PayPal SDK / Card Fields
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://js.stripe.com',
          'https://www.paypal.com',
          'https://*.paypal.com',
          'https://www.sandbox.paypal.com',
          'https://*.paypalobjects.com'
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https://api.stripe.com',
          'https://*.stripe.com',
          'https://www.paypal.com',
          'https://*.paypal.com',
          'https://api-m.paypal.com',
          'https://api-m.sandbox.paypal.com',
          'https://*.paypalobjects.com',
          'https://*.supabase.co',
          'wss://*.supabase.co'
        ],
        frameSrc: [
          "'self'",
          'https://js.stripe.com',
          'https://hooks.stripe.com',
          'https://www.paypal.com',
          'https://*.paypal.com',
          'https://www.sandbox.paypal.com'
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://www.paypal.com', 'https://*.paypal.com']
      }
    }
  })
)

// Strict origin allowlist CORS policy
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true)
      }
      return callback(new Error('CORS origin not allowed'))
    },
    credentials: true
  })
)

// Preserve raw JSON payload strictly for Stripe webhook signature verification
app.use(
  '/api/payments/stripe/webhook',
  express.raw({ type: 'application/json', limit: '2mb' })
)

// Body parsing middleware
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))
app.use(cookieParser())

// Logging middleware
app.use(morgan('combined'))

// Static file serving: product images & media with nosniff defense
const clientPublicPath = path.resolve(__dirname, '../../client/public')
const distPath = path.resolve(__dirname, '../../dist')
const setMediaHeaders = (res: express.Response) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

app.use(
  '/images',
  express.static(path.join(clientPublicPath, 'images'), {
    maxAge: '1d',
    fallthrough: true,
    setHeaders: setMediaHeaders
  })
)

if (fs.existsSync(path.join(distPath, 'images'))) {
  app.use(
    '/images',
    express.static(path.join(distPath, 'images'), {
      maxAge: '1d',
      fallthrough: true,
      setHeaders: setMediaHeaders
    })
  )
}

// Serve Vite production build static assets (JS, CSS, fonts)
if (fs.existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      maxAge: '1d',
      index: false
    })
  )
}

// Also serve client public folder
app.use(
  express.static(clientPublicPath, {
    maxAge: '1d'
  })
)

// Serve favicon.ico
app.get('/favicon.ico', (_req, res) => {
  const faviconDist = path.join(distPath, 'favicon.ico')
  const faviconPublic = path.join(clientPublicPath, 'favicon.ico')
  if (fs.existsSync(faviconDist)) return res.sendFile(faviconDist)
  if (fs.existsSync(faviconPublic)) return res.sendFile(faviconPublic)
  res.status(204).end()
})

const getCanonicalSiteUrl = () =>
  (process.env.PRODUCTION_URL || process.env.PRODUCTION_url || 'https://driveflyelectric.shop').replace(/\/+$/, '')

// SEO: robots.txt
app.get('/robots.txt', (_req, res) => {
  const siteUrl = getCanonicalSiteUrl()
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nAllow: /product/\nAllow: /products/\nAllow: /images/\nDisallow: /api/\nDisallow: /admin\nSitemap: ${siteUrl}/sitemap.xml\n`
  )
})

// SEO: Dynamic XML Sitemap including all categories and listed database items
app.get('/sitemap.xml', async (_req, res) => {
  try {
    const siteUrl = getCanonicalSiteUrl()
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
      const prodUrl = `${siteUrl}/product/${encodeURIComponent(p.id)}`
      const lastMod = p.updatedAt ? new Date(p.updatedAt).toISOString() : nowIso
      const primaryImg = p.images && p.images.length > 0 ? p.images[0] : '/images/hero1.jpeg'
      const fullImgUrl = primaryImg.startsWith('http')
        ? primaryImg
        : `${siteUrl}${primaryImg.startsWith('/') ? '' : '/'}${primaryImg
            .split('/')
            .map((seg: string, i: number) => (i === 0 && seg === '' ? '' : encodeURIComponent(decodeURIComponent(seg))))
            .join('/')}`

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
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    currency: 'USD',
    timestamp: new Date().toISOString()
  })
})

// Minimal API status endpoint
app.get('/api', (_req, res) => {
  res.status(200).json({
    success: true,
    service: 'DriveFlyElectric API',
    currency: 'USD',
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

// Public Real-Time Client LiveChat & Support Routes (unlimited messaging; session-token & registered-account scoped)
const supportSelectedProductSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(120).optional().default(''),
  price: z.coerce.number().finite().min(0).max(10000000),
  category: z.string().trim().max(120).optional().default(''),
  image: z.string().trim().max(500).optional().default('')
})

const supportSelectedProductItemSchema = z.union([
  supportSelectedProductSchema,
  z.string().trim().min(1).max(120).transform((id) => ({
    id,
    name: id,
    sku: '',
    price: 0,
    category: '',
    image: ''
  }))
])

const supportSessionInitSchema = z.object({
  id: z.string().trim().max(120).optional(),
  sessionId: z.string().trim().max(120).optional(),
  visitorId: z.string().trim().max(120).optional(),
  topic: z.string().trim().max(200).optional(),
  selectedProducts: z.array(supportSelectedProductItemSchema).max(20).optional(),
  visitorName: z.string().trim().max(120).optional(),
  visitorEmail: z.string().trim().email().max(254).optional().or(z.literal('')),
  visitorPhone: z.string().trim().max(40).optional(),
  resumeOnly: z.boolean().optional()
})

const supportMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content is required.').max(2000),
  topic: z.string().trim().max(200).optional(),
  selectedProducts: z.array(supportSelectedProductItemSchema).max(20).optional(),
  visitorName: z.string().trim().max(120).optional(),
  visitorEmail: z.string().trim().email().max(254).optional().or(z.literal('')),
  visitorPhone: z.string().trim().max(40).optional()
})

function hasSupportSessionAccess(req: express.Request, sessionId: string, existingSession?: any): boolean {
  if (req.user?.role === 'ADMIN') return true
  if (req.user?.id && existingSession) {
    if (existingSession.userId && existingSession.userId === req.user.id) return true
    if (
      existingSession.visitorEmail &&
      req.user.email &&
      String(existingSession.visitorEmail).trim().toLowerCase() === String(req.user.email).trim().toLowerCase()
    ) {
      return true
    }
  }
  const token = String(
    (req.headers['x-support-token'] as string) || (req.query.token as string) || ''
  ).trim()
  return verifySupportVisitorToken(sessionId, token)
}

app.post('/api/support/session', optionalAuth, async (req, res) => {
  try {
    const parsed = supportSessionInitSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid support session payload.'
      })
    }

    const requestedId = parsed.data.id || parsed.data.sessionId || parsed.data.visitorId
    if (requestedId) {
      const existing = await databaseService.getSupportSession(requestedId)
      if (existing && !hasSupportSessionAccess(req, requestedId, existing)) {
        if (parsed.data.resumeOnly) {
          return res.status(200).json({ success: true, data: null })
        }
        return res.status(403).json({
          success: false,
          error: 'Support session token mismatch. Please start a new chat session.'
        })
      }
    }

    const session = await databaseService.upsertSupportSession({
      ...parsed.data,
      userId: req.user?.id,
      registeredUser: req.user
    })
    if (!session) {
      return res.status(200).json({ success: true, data: null })
    }
    const visitorToken = signSupportVisitorToken(session.id)
    emailService.emitSupportSync(session, 'session_updated')
    res.status(200).json({ success: true, data: session, visitorToken })
  } catch (err) {
    console.error('Support session init error:', err)
    res.status(500).json({ success: false, error: 'Failed to initialize support session' })
  }
})

app.get('/api/support/session/:id/stream', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.params.id
    const existing = await databaseService.getSupportSession(sessionId)
    if (!hasSupportSessionAccess(req, sessionId, existing)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to stream this support session.'
      })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    res.write(
      `event: connected\ndata: ${JSON.stringify({ connected: true, sessionId, timestamp: new Date().toISOString() })}\n\n`
    )

    const onUpdate = (payload: any) => {
      if (payload?.session) {
        res.write(`event: session_update\ndata: ${JSON.stringify(payload.session)}\n\n`)
      }
    }

    emailService.supportEmitter.on(`session:${sessionId}`, onUpdate)

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`)
    }, 25000)

    req.on('close', () => {
      clearInterval(heartbeat)
      emailService.supportEmitter.off(`session:${sessionId}`, onUpdate)
    })
  } catch (err) {
    console.error('Support stream error:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to open support stream' })
    }
  }
})

app.get('/api/support/session/:id', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.params.id
    const existing = await databaseService.getSupportSession(sessionId)
    if (!hasSupportSessionAccess(req, sessionId, existing)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this support session.'
      })
    }

    const hadUnreadClient = Boolean(existing && Number(existing.unreadClientCount || 0) > 0)
    await databaseService.updateSupportPresence(sessionId, true)
    if (req.query.open === 'true' && hadUnreadClient) {
      await databaseService.markSupportSessionRead(sessionId, 'CLIENT')
    }
    const session = await databaseService.getSupportSession(sessionId)
    if (!session) {
      return res.status(404).json({ success: false, error: 'Support session not found' })
    }
    if (req.query.open === 'true' && hadUnreadClient) {
      emailService.emitSupportSync(session, 'client_read')
    }
    const visitorToken = signSupportVisitorToken(session.id)
    res.status(200).json({ success: true, data: session, visitorToken })
  } catch (err) {
    console.error('Support session fetch error:', err)
    res.status(500).json({ success: false, error: 'Failed to load support session' })
  }
})

app.post('/api/support/session/:id/messages', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.params.id
    const parsed = supportMessageSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Message content is required.'
      })
    }

    const existing = await databaseService.getSupportSession(sessionId)
    if (existing && !hasSupportSessionAccess(req, sessionId, existing)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to post to this support session.'
      })
    }

    const { content, topic, selectedProducts, visitorName, visitorEmail, visitorPhone } = parsed.data
    const result = await databaseService.appendSupportMessage(sessionId, {
      senderRole: 'CLIENT',
      senderName: visitorName || undefined,
      content,
      topic,
      selectedProducts,
      userId: req.user?.id,
      registeredUser: req.user,
      visitorName,
      visitorEmail: visitorEmail || undefined,
      visitorPhone
    })

    emailService.emitSupportSync(result.session, 'client_message')
    emailService
      .sendSupportInquiryAlert(result.session, content)
      .catch((err) => console.error('Support inquiry alert error:', err))

    const visitorToken = signSupportVisitorToken(result.session.id)
    res.status(200).json({
      success: true,
      data: result.session,
      newMessages: result.newMessages,
      visitorToken
    })
  } catch (err) {
    console.error('Support message send error:', err)
    res.status(500).json({ success: false, error: 'Failed to send support message' })
  }
})

app.post('/api/support/session/:id/heartbeat', optionalAuth, async (req, res) => {
  try {
    const sessionId = req.params.id
    const existing = await databaseService.getSupportSession(sessionId)
    if (!hasSupportSessionAccess(req, sessionId, existing)) {
      return res.status(403).json({ success: false })
    }
    const isOnline =
      req.body?.isOnline !== undefined
        ? Boolean(req.body.isOnline)
        : req.query.isOnline !== undefined
        ? req.query.isOnline !== 'false'
        : true
    const session = await databaseService.updateSupportPresence(sessionId, isOnline, req.body)
    if (session && (!existing || Boolean(existing.isOnline) !== Boolean(session.isOnline))) {
      emailService.emitSupportSync(session, 'presence')
    }
    res.status(200).json({ success: true, data: session })
  } catch {
    res.status(200).json({ success: false })
  }
})

// Storefront analytics tracking (site visits & checked products)
const analyticsRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: 'storefront-analytics',
  message: 'Analytics rate limit exceeded'
})

const analyticsVisitSchema = z.object({
  visitorId: z.string().trim().min(1).max(120),
  sessionKey: z.string().trim().min(1).max(120).optional(),
  path: z.string().trim().min(1).max(300),
  referrer: z.string().trim().max(400).nullable().optional()
})

const analyticsProductViewSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  productName: z.string().trim().max(200).optional(),
  productSku: z.string().trim().max(100).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  price: z.number().finite().nonnegative().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  visitorId: z.string().trim().min(1).max(120),
  sessionKey: z.string().trim().min(1).max(120).optional(),
  source: z.enum(['PRODUCT_PAGE', 'CART_ADD', 'BOOKING_MODAL', 'LIVECHAT_SELECT', 'SHARE']).default('PRODUCT_PAGE'),
  path: z.string().trim().max(300).nullable().optional()
})

function extractAnalyticsContext(req: express.Request, pathValue?: string | null) {
  const skip = req.user?.role === 'ADMIN' || Boolean(pathValue && pathValue.startsWith('/admin'))
  const forwarded = req.headers['x-forwarded-for']
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    null
  const country =
    (req.headers['cf-ipcountry'] as string) ||
    (req.headers['x-vercel-ip-country'] as string) ||
    null
  return {
    skip,
    ip,
    country,
    userAgent: req.get('user-agent') || null,
    userId: req.user?.id || null,
    userEmail: req.user?.email || null
  }
}

app.post('/api/analytics/visit', analyticsRateLimiter, optionalAuth, async (req, res) => {
  try {
    const parsed = analyticsVisitSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid visit payload' })
    }
    const ctx = extractAnalyticsContext(req, parsed.data.path)
    if (ctx.skip) {
      return res.status(200).json({ success: true, recorded: false })
    }
    const result = await databaseService.recordSiteVisit({
      visitorId: parsed.data.visitorId,
      sessionKey: parsed.data.sessionKey,
      path: parsed.data.path,
      referrer: parsed.data.referrer || req.get('referer') || null,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      userAgent: ctx.userAgent,
      country: ctx.country,
      ip: ctx.ip
    })
    if (result.recorded && result.visit) {
      emailService.emitAnalyticsSync('visit', result.visit)
    }
    res.status(200).json({ success: true, recorded: result.recorded })
  } catch (error) {
    console.error('Error recording site visit:', error)
    res.status(200).json({ success: false, recorded: false })
  }
})

app.post('/api/analytics/product-view', analyticsRateLimiter, optionalAuth, async (req, res) => {
  try {
    const parsed = analyticsProductViewSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid product view payload' })
    }
    const ctx = extractAnalyticsContext(req, parsed.data.path)
    if (ctx.skip) {
      return res.status(200).json({ success: true, recorded: false })
    }
    const result = await databaseService.recordProductView({
      ...parsed.data,
      userId: ctx.userId,
      userEmail: ctx.userEmail
    })
    if (result.recorded && result.view) {
      emailService.emitAnalyticsSync('product_view', result.view)
    }
    res.status(200).json({ success: true, recorded: result.recorded })
  } catch (error) {
    console.error('Error recording product view:', error)
    res.status(200).json({ success: false, recorded: false })
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
  res.status(404).json({
    success: false,
    error: 'Application bundle not found.'
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
  emailService.stopCartReminderScheduler()
  console.log('🛑 Shutting down server...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  emailService.stopCartReminderScheduler()
  console.log('🛑 Shutting down server...')
  process.exit(0)
})

// Start server
async function startServer() {
  await connectDatabase()
  emailService.loadRecentActivities(50).catch(() => {})
  emailService.verifySmtpConnection().catch(() => {})
  emailService.startCartReminderScheduler()

  app.listen(PORT, () => {
    console.log(`🚀 DriveFlyElectric server is running on port ${PORT}`)
    console.log(`📱 Storefront URL: ${getCanonicalSiteUrl()}`)
    console.log('🗄️  Database: Connected to Supabase PostgreSQL')
  })
}

startServer()

export default app