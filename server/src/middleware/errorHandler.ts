import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export interface CustomError extends Error {
  statusCode?: number
  status?: number
  code?: string
  meta?: unknown
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = err.statusCode || err.status || 500
  let message = err.message || 'An unexpected error occurred.'

  // Log internally without leaking internals to the client in production
  console.error(`[ErrorHandler] ${req.method} ${req.originalUrl}:`, err.message)

  // Zod request validation errors
  if (err instanceof ZodError) {
    statusCode = 400
    const firstIssue = err.issues[0]
    message = firstIssue?.message || 'Invalid request input.'
  } else if (err.name === 'MulterError') {
    statusCode = 400
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed size.'
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded at once.'
    } else {
      message = 'File upload failed validation.'
    }
  } else if (err instanceof SyntaxError && statusCode === 400) {
    statusCode = 400
    message = 'Malformed JSON request body.'
  } else if (err.code === '23505') {
    statusCode = 409
    message = 'A record with this information already exists.'
  } else if (err.code === '23503') {
    statusCode = 400
    message = 'Referenced record does not exist.'
  } else if (err.code === '22P02') {
    statusCode = 400
    message = 'Invalid identifier format.'
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401
    message = 'Invalid authentication token.'
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401
    message = 'Authentication token has expired.'
  } else if (err.name === 'ValidationError') {
    statusCode = 400
    message = 'Validation failed.'
  } else if (err.message === 'CORS origin not allowed') {
    statusCode = 403
    message = 'Origin not authorized.'
  }

  const isDevelopment = process.env.NODE_ENV === 'development'
  if (statusCode >= 500 && !isDevelopment) {
    message = 'An unexpected server error occurred. Please try again later.'
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(isDevelopment && statusCode >= 500 ? { stack: err.stack } : {})
  })
}