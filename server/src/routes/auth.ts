import express from 'express'
import {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  getUsers,
  updateUserStatus
} from '../controllers/authController.js'
import { protect, authorize } from '../middleware/auth.js'
import { createRateLimiter } from '../middleware/security.js'

const router = express.Router()

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please try again in 15 minutes.'
})

const passwordRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'auth-password',
  message: 'Too many password update attempts. Please try again later.'
})

// Public authentication routes
router.post('/register', authRateLimit, register)
router.post('/login', authRateLimit, login)
router.post('/logout', logout)

// Authenticated user profile routes
router.get('/profile', protect, getProfile)
router.get('/verify', protect, getProfile)
router.get('/me', protect, getProfile)
router.get('/user', protect, getProfile)
router.put('/profile', protect, updateProfile)
router.put('/change-password', protect, passwordRateLimit, changePassword)

// Admin user management routes
router.get('/users', protect, authorize('ADMIN'), getUsers)
router.put('/users/:id/status', protect, authorize('ADMIN'), updateUserStatus)

export default router