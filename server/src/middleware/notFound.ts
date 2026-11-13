import { Request, Response } from 'express'

export const notFound = (req: Request, res: Response) => {
  if (req.originalUrl.startsWith('/api')) {
    console.warn(`⚠️ Unmatched API Route: ${req.method} ${req.originalUrl}`)
  }

  res.status(404).json({
    success: false,
    error: 'The requested resource could not be found.'
  })
}