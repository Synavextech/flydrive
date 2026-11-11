import express from 'express'
import {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getUsers,
  updateUserStatus
} from '../controllers/authController.js'
import { protect, authorize } from '../middleware/auth.js'

const router = express.Router()

// Public authentication routes
router.post('/register', register)
router.post('/login', login)

// Authenticated user profile routes
router.get('/profile', protect, getProfile)
router.get('/verify', protect, getProfile)
router.get('/me', protect, getProfile)
router.get('/user', protect, getProfile)
router.put('/profile', protect, updateProfile)
router.put('/change-password', protect, changePassword)

// Admin user management routes
router.get('/users', protect, authorize('ADMIN'), getUsers)
router.put('/users/:id/status', protect, authorize('ADMIN'), updateUserStatus)

export default router