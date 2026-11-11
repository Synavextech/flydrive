import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { Secret } from 'jsonwebtoken'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'

// Generate JWT token
const generateToken = (userId: string, email: string, role: string): string => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set')
  }

  // Use type assertion to bypass strict typing issues
  return (jwt as any).sign(
    { id: userId, email, role },
    secret,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  )
}

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body

    // Check if user already exists
    const existingUser = await databaseService.findUserByEmail(email)
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Create user
    const user = await databaseService.createUser({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      role: 'CUSTOMER' // Default role
    })

    // Generate token
    const token = generateToken(user.id, user.email, user.role)

    // Dispatch real-time account creation emails (welcome email to user + system activity alert to admin mail)
    emailService
      .sendAccountRegistrationNotifications(user, 'Account Registration')
      .catch((err) => console.error('Registration notification error:', err))

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      }
    })
  } catch (error) {
    console.error('Error registering user:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    // Check if user exists
    const user = await databaseService.findUserByEmail(email)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password. Please check your credentials and try again.'
      })
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated. Please contact support.'
      })
    }

    // Check password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password. Please check your credentials and try again.'
      })
    }
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password. Please check your credentials and try again.'
      })
    }

    // Generate token
    const token = generateToken(user.id, user.email, user.role)

    emailService.recordActivity({
      type: 'USER_LOGIN',
      title: `User Sign-In • ${user.email}`,
      message: `${user.firstName || ''} ${user.lastName || ''} (${user.email}) signed in as ${user.role}.`,
      userEmail: user.email,
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      }
    })
  } catch (error) {
    console.error('Error logging in user:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await databaseService.findUserById(req.user!.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, phone } = req.body

    const updatedUser = await databaseService.updateUser(req.user!.id, {
      firstName,
      lastName,
      phone
    })

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        role: updatedUser.role
      }
    })
  } catch (error) {
    console.error('Error updating user profile:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body

    // Get user with password
    const user = await databaseService.findUserById(req.user!.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    // Check current password
    if (!user.password) {
      return res.status(400).json({
        success: false,
        error: 'Current password is not set'
      })
    }
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      })
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const hashedNewPassword = await bcrypt.hash(newPassword, salt)

    // Update password
    await databaseService.updateUser(req.user!.id, {
      password: hashedNewPassword
    })

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    })
  } catch (error) {
    console.error('Error changing password:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Admin: Get all users
// @route   GET /api/auth/users
// @access  Private/Admin
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await databaseService.findUsers()

    res.status(200).json({
      success: true,
      data: users
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Admin: Update user status
// @route   PUT /api/auth/users/:id/status
// @access  Private/Admin
export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body
    const userId = req.params.id

    const updatedUser = await databaseService.updateUser(userId, {
      isActive
    })

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedUser
    })
  } catch (error) {
    console.error('Error updating user status:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}