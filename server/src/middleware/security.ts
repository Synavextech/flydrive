import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Request, Response, NextFunction } from 'express'

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || ''
  if (!secret || secret === 'your_jwt_secret_here' || secret.length < 32) {
    throw new Error('CRITICAL CONFIG ERROR: JWT_SECRET must be set to a strong key (>= 32 chars).')
  }
  return secret
}

export function validateStartupEnvironment(): void {
  getJwtSecret()
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('CRITICAL CONFIG ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.')
  }
}

export function getAllowedOrigins(): string[] {
  const envAllowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const candidates = [
    ...envAllowed,
    process.env.CLIENT_URL,
    process.env.PRODUCTION_URL,
    process.env.PRODUCTION_url,
    'https://driveflyelectric.shop',
    'https://www.driveflyelectric.shop',
    ...(process.env.NODE_ENV !== 'production'
      ? ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5000']
      : ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5000'])
  ].filter(Boolean) as string[]

  return Array.from(new Set(candidates.map((u) => u.replace(/\/+$/, ''))))
}

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true
  const normalized = origin.replace(/\/+$/, '')
  const allowed = getAllowedOrigins()
  if (allowed.includes(normalized)) return true
  try {
    const parsed = new URL(normalized)
    if (parsed.hostname === 'driveflyelectric.shop' || parsed.hostname.endsWith('.driveflyelectric.shop')) {
      return parsed.protocol === 'https:' || parsed.protocol === 'http:'
    }
  } catch {
    return false
  }
  return false
}

export function resolveSafeRedirectOrigin(req: Request): string {
  const defaultOrigin = (
    process.env.PRODUCTION_URL ||
    process.env.PRODUCTION_url ||
    process.env.CLIENT_URL ||
    'https://driveflyelectric.shop'
  ).replace(/\/+$/, '')

  const rawHeader = (req.headers.origin as string) || (req.headers.referer as string) || ''
  if (!rawHeader) return defaultOrigin

  try {
    const parsed = new URL(rawHeader)
    const candidateOrigin = parsed.origin.replace(/\/+$/, '')
    if (isAllowedOrigin(candidateOrigin)) {
      return candidateOrigin
    }
  } catch {
    // Ignore invalid Origin/Referer headers
  }
  return defaultOrigin
}

interface RateLimitOptions {
  windowMs: number
  max: number
  keyPrefix: string
  message?: string
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateBuckets.entries()) {
    if (entry.resetAt <= now) {
      rateBuckets.delete(key)
    }
  }
}, 5 * 60 * 1000).unref?.()

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix, message = 'Too many requests. Please wait a moment and try again.' } = options

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown'
    const bucketKey = `${keyPrefix}:${clientIp}`
    const now = Date.now()
    const current = rateBuckets.get(bucketKey)

    if (!current || current.resetAt <= now) {
      rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (current.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      return res.status(429).json({
        success: false,
        error: message
      })
    }

    current.count += 1
    next()
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizePostgrestSearch(raw: string): string {
  return String(raw || '')
    .replace(/[,().*\\;%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm'])
const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])
const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

function hasValidMagicBytes(buffer: Buffer, ext: string): boolean {
  if (!buffer || buffer.length < 12) return false
  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (ext === '.png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    )
  }
  if (ext === '.gif') {
    const header = buffer.subarray(0, 6).toString('ascii')
    return header === 'GIF87a' || header === 'GIF89a'
  }
  if (ext === '.webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }
  if (ext === '.mp4' || ext === '.mov') {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  }
  if (ext === '.webm') {
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  }
  return false
}

export function isAllowedMediaExtension(filename: string, mimetype: string, allowVideos: boolean): boolean {
  const ext = path.extname(filename || '').toLowerCase()
  const mime = (mimetype || '').toLowerCase()
  if (mime.includes('svg') || ext === '.svg' || ext === '.html' || ext === '.htm' || ext === '.js') {
    return false
  }
  if (IMAGE_EXTENSIONS.has(ext) && IMAGE_MIMES.has(mime)) return true
  if (allowVideos && VIDEO_EXTENSIONS.has(ext) && VIDEO_MIMES.has(mime)) return true
  return false
}

export function validateUploadedFiles(
  files: Express.Multer.File[],
  options: { allowVideos: boolean }
): { valid: true } | { valid: false; error: string } {
  for (const file of files) {
    const ext = path.extname(file.originalname || file.filename || '').toLowerCase()
    if (!isAllowedMediaExtension(file.originalname || file.filename, file.mimetype, options.allowVideos)) {
      cleanupFiles(files)
      return {
        valid: false,
        error: options.allowVideos
          ? 'Unsupported file type. Only JPG, PNG, WEBP, GIF images and MP4, MOV, WEBM videos are allowed.'
          : 'Unsupported file type. Only JPG, PNG, WEBP, and GIF images are allowed.'
      }
    }

    try {
      const fd = fs.openSync(file.path, 'r')
      const header = Buffer.alloc(16)
      const bytesRead = fs.readSync(fd, header, 0, 16, 0)
      fs.closeSync(fd)
      if (!hasValidMagicBytes(header.subarray(0, bytesRead), ext)) {
        cleanupFiles(files)
        return {
          valid: false,
          error: 'File contents do not match a valid image or video signature.'
        }
      }
    } catch {
      cleanupFiles(files)
      return { valid: false, error: 'Failed to inspect uploaded media file.' }
    }
  }
  return { valid: true }
}

function cleanupFiles(files: Express.Multer.File[]): void {
  for (const file of files) {
    try {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path)
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

export function signReceiptAccessToken(orderId: string): string {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`receipt:${orderId}`)
    .digest('hex')
}

export function verifyReceiptAccessToken(orderId: string, token?: string): boolean {
  if (!token || !orderId) return false
  const expected = signReceiptAccessToken(orderId)
  const expectedBuf = Buffer.from(expected, 'utf8')
  const providedBuf = Buffer.from(String(token), 'utf8')
  if (expectedBuf.length !== providedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, providedBuf)
}

export function signSupportVisitorToken(sessionId: string): string {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`support-session:${sessionId}`)
    .digest('hex')
}

export function verifySupportVisitorToken(sessionId: string, token?: string): boolean {
  if (!token || !sessionId) return false
  const expected = signSupportVisitorToken(sessionId)
  const expectedBuf = Buffer.from(expected, 'utf8')
  const providedBuf = Buffer.from(String(token), 'utf8')
  if (expectedBuf.length !== providedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, providedBuf)
}

export function getFormattedSupportWhatsApp(): string {
  const digits = (process.env.VITE_WHATSAPP_NUMBER || '19785236630').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return `+${digits || '19785236630'}`
}

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

export function isValidEmailAddress(email?: unknown): email is string {
  if (typeof email !== 'string') return false
  return VALID_EMAIL_REGEX.test(email.trim())
}

/**
 * Returns valid system/admin notification contact email(s) configured via SYSTEM_NOTIFICATION_EMAIL.
 * Never mixes ADMIN_EMAIL (portal login username) or outbound SMTP sender addresses into alert recipients.
 */
export function getSystemNotificationEmails(): string[] {
  const raw = String(process.env.SYSTEM_NOTIFICATION_EMAIL || 'support@driveflyelectric.shop')
  const valid = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => isValidEmailAddress(entry))

  return valid.length > 0 ? Array.from(new Set(valid)) : ['support@driveflyelectric.shop']
}

/**
 * Primary public/admin customer support contact email (SYSTEM_NOTIFICATION_EMAIL first entry).
 */
export function getAdminContactEmail(): string {
  return getSystemNotificationEmails()[0] || 'support@driveflyelectric.shop'
}

/**
 * Outbound SMTP mailbox used for sending system & customer inquiry emails.
 */
export function getInquirySenderEmail(): string {
  const candidates = [process.env.SMTP_EMAIL, process.env.SMTP_USER]
  for (const candidate of candidates) {
    if (isValidEmailAddress(candidate)) {
      return candidate.trim()
    }
  }
  return 'info-eurotopmobility@driveflyelectric.shop'
}

/**
 * Extracts buyer email(s) and postal code persisted inside structured guest order notes.
 */
export function extractGuestMetadataFromNotes(notes?: string | null): {
  emails: string[]
  zips: string[]
} {
  if (!notes) return { emails: [], zips: [] }
  const emails: string[] = []
  const zips: string[] = []

  const emailMatches = notes.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
  if (emailMatches) {
    emails.push(...Array.from(new Set(emailMatches.map((e) => e.trim().toLowerCase()))))
  }

  const postalMatch = notes.match(/Postal:\s*([A-Za-z0-9 -]{2,20})/i)
  if (postalMatch?.[1]) {
    zips.push(postalMatch[1].trim().toLowerCase())
  }

  return { emails, zips }
}

/**
 * Resolves all unique, valid recipient email addresses for an order (explicit + user + guest notes).
 */
export function resolveOrderCustomerEmails(
  order: any,
  ...explicitEmails: Array<string | null | undefined>
): string[] {
  const noteEmails = extractGuestMetadataFromNotes(order?.notes).emails
  const candidates = [
    ...explicitEmails,
    order?.user?.email,
    order?.shippingAddress?.email,
    ...noteEmails
  ]

  const deduped = new Set<string>()
  for (const candidate of candidates) {
    if (isValidEmailAddress(candidate)) {
      deduped.add(candidate.trim())
    }
  }
  return Array.from(deduped)
}

