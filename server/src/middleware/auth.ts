import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { databaseService } from '../services/databaseService.js'

export interface AuthUser {
  id: string
  email: string
  role: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET environment variable must be configured with at least 32 characters')
  }
  return secret
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1]
  } else if (req.cookies?.token) {
    token = req.cookies.token
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    })
  }

  try {
    const secret = getJwtSecret()
    const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string }

    const user = await databaseService.findUserById(decoded.id)
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User not found or account is deactivated'
      })
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? null
    }

    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    })
  }
}

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'User role is not authorized to access this route'
      })
    }
    next()
  }
}

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  let token: string | undefined

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1]
  } else if (req.cookies?.token) {
    token = req.cookies.token
  }

  if (!token) {
    return next()
  }

  try {
    const secret = getJwtSecret()
    const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string }
    const user = await databaseService.findUserById(decoded.id)
    if (user && user.isActive) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? null
      }
    }
  } catch (error) {
    // Ignore invalid token in optionalAuth
  }

  next()
}
