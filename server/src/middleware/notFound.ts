import { Request, Response, NextFunction } from 'express'

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  // Enhanced logging for debugging /api requests
  if (req.originalUrl.startsWith('/api')) {
    console.log(`⚠️ Unmatched API Route: ${req.method} ${req.originalUrl} from ${req.ip}`)
  }

  res.status(404).json({
    success: false,
    error: `Resource not found: ${req.method} ${req.originalUrl}`
  })
}