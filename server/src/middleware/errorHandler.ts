import { Request, Response, NextFunction } from 'express'

export interface CustomError extends Error {
  statusCode?: number
  code?: string
  meta?: any
}

// Enhanced error handler for database operations
export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = { ...err }
  error.message = err.message

  // Log error
  console.error('Error:', err)

  // Prisma error handling
  if (err.name === 'PrismaClientKnownRequestError') {
    switch (err.code) {
      case 'P2002':
        // Unique constraint violation
        error.statusCode = 400
        error.message = 'A record with this information already exists'
        break
      case 'P2025':
        // Record not found
        error.statusCode = 404
        error.message = 'Record not found'
        break
      case 'P2003':
        // Foreign key constraint failed
        error.statusCode = 400
        error.message = 'Related record not found'
        break
      case 'P2014':
        // Invalid ID
        error.statusCode = 400
        error.message = 'Invalid ID format'
        break
      default:
        error.statusCode = 500
        error.message = 'Database operation failed'
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.statusCode = 401
    error.message = 'Invalid token'
  }

  if (err.name === 'TokenExpiredError') {
    error.statusCode = 401
    error.message = 'Token expired'
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error.statusCode = 400
    error.message = 'Validation failed'
  }

  // Default error response
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
}