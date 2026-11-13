import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'
import { getJwtSecret } from '../middleware/security.js'

const registerSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address.').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128, 'Password must be 128 characters or fewer.'),
  firstName: z.string().trim().min(1, 'First name is required.').max(100),
  lastName: z.string().trim().min(1, 'Last name is required.').max(100),
  phone: z.string().trim().max(40).optional()
})

const loginSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address.').max(254),
  password: z.string().min(1, 'Password is required.').max(128)
})

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(100),
  lastName: z.string().trim().min(1, 'Last name is required.').max(100),
  phone: z.string().trim().max(40).optional().nullable()
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.').max(128),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters long.')
    .max(128, 'New password must be 128 characters or fewer.')
})

const updateUserStatusSchema = z.object({
  isActive: z.boolean()
})

const generateToken = (userId: string, email: string, role: string): string => {
  const secret = getJwtSecret()
  return (jwt as any).sign(
    { id: userId, email, role },
    secret,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  )
}

const setAuthCookie = (res: Response, token: string) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  })
}

const sanitizeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt
})

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid registration data.'
      })
    }

    const email = parsed.data.email.toLowerCase()
    const { password, firstName, lastName, phone } = parsed.data

    const existingUser = await databaseService.findUserByEmail(email)
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists.'
      })
    }

    const salt = await bcrypt.genSalt(12)
    const hashedPassword = await bcrypt.hash(password, salt)

    const user = await databaseService.createUser({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone: phone || undefined,
      role: 'CUSTOMER'
    })

    const token = generateToken(user.id, user.email, user.role)
    setAuthCookie(res, token)

    emailService
      .sendAccountRegistrationNotifications(user, 'Account Registration')
      .catch((err) => console.error('Registration notification error:', err))

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: sanitizeUser(user)
      }
    })
  } catch (error) {
    console.error('Error registering user:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to complete registration right now. Please try again.'
    })
  }
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Please enter your email and password.'
      })
    }

    const email = parsed.data.email.toLowerCase()
    const { password } = parsed.data

    const user = await databaseService.findUserByEmail(email)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password. Please check your credentials and try again.'
      })
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated. Please contact support.'
      })
    }

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

    const token = generateToken(user.id, user.email, user.role)
    setAuthCookie(res, token)

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
        user: sanitizeUser(user)
      }
    })
  } catch (error) {
    console.error('Error logging in user:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to sign in right now. Please try again.'
    })
  }
}

// @desc    Logout user (clear HttpOnly cookie)
// @route   POST /api/auth/logout
// @access  Public
export const logout = async (_req: Request, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  })
  res.status(200).json({
    success: true,
    message: 'Signed out successfully'
  })
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
      data: sanitizeUser(user)
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load profile.'
    })
  }
}

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid profile update payload.'
      })
    }

    const updatedUser = await databaseService.updateUser(req.user!.id, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone ?? undefined
    })

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: sanitizeUser(updatedUser)
    })
  } catch (error) {
    console.error('Error updating user profile:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update profile.'
    })
  }
}

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req: Request, res: Response) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid password change payload.'
      })
    }

    const { currentPassword, newPassword } = parsed.data
    const user = await databaseService.findUserById(req.user!.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

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

    const salt = await bcrypt.genSalt(12)
    const hashedNewPassword = await bcrypt.hash(newPassword, salt)

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
      error: 'Unable to update password.'
    })
  }
}

// @desc    Admin: Get all users
// @route   GET /api/auth/users
// @access  Private/Admin
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users = await databaseService.findUsers()

    res.status(200).json({
      success: true,
      data: users.map(sanitizeUser)
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to fetch users.'
    })
  }
}

// @desc    Admin: Update user status
// @route   PUT /api/auth/users/:id/status
// @access  Private/Admin
export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const parsed = updateUserStatusSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'isActive must be a boolean.'
      })
    }

    const userId = req.params.id
    if (req.user && req.user.id === userId && !parsed.data.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Administrators cannot deactivate their own account.'
      })
    }

    const updatedUser = await databaseService.updateUser(userId, {
      isActive: parsed.data.isActive
    })

    emailService.recordActivity({
      type: 'USER_STATUS_UPDATED',
      title: `Account ${parsed.data.isActive ? 'Activated' : 'Deactivated'} • ${updatedUser.email}`,
      message: `Administrator marked ${updatedUser.email} as ${parsed.data.isActive ? 'ACTIVE' : 'DEACTIVATED'}.`,
      userEmail: updatedUser.email,
      metadata: {
        userId: updatedUser.id,
        isActive: parsed.data.isActive
      },
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      message: `User ${parsed.data.isActive ? 'activated' : 'deactivated'} successfully`,
      data: sanitizeUser(updatedUser)
    })
  } catch (error) {
    console.error('Error updating user status:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update user status.'
    })
  }
}