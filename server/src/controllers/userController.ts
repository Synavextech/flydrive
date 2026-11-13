import { Request, Response } from 'express'
import { z } from 'zod'
import { databaseService } from '../services/databaseService.js'

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(100),
  lastName: z.string().trim().min(1, 'Last name is required.').max(100),
  phone: z.string().trim().max(40).optional().nullable()
})

const addressSchema = z.object({
  type: z.enum(['SHIPPING', 'BILLING']).optional().default('SHIPPING'),
  firstName: z.string().trim().min(1, 'First name is required.').max(100),
  lastName: z.string().trim().min(1, 'Last name is required.').max(100),
  company: z.string().trim().max(150).optional().nullable(),
  address1: z.string().trim().min(1, 'Street address is required.').max(255),
  address2: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().min(1, 'City is required.').max(120),
  state: z.string().trim().min(1, 'State or province is required.').max(120),
  zipCode: z.string().trim().min(1).max(30).optional(),
  postalCode: z.string().trim().min(1).max(30).optional(),
  country: z.string().trim().min(2, 'Country is required.').max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  isDefault: z.boolean().optional().default(false)
})

const updateAddressSchema = addressSchema.partial()

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    const user = await databaseService.findUserById(userId)

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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
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
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid profile data.'
      })
    }

    const userId = req.user!.id
    const updatedUser = await databaseService.updateUser(userId, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone ?? undefined
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
      error: 'Unable to update profile.'
    })
  }
}

// @desc    Get user addresses
// @route   GET /api/users/addresses
// @access  Private
export const getAddresses = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    const addresses = await databaseService.findAddressesByUserId(userId)

    res.status(200).json({
      success: true,
      data: addresses
    })
  } catch (error) {
    console.error('Error fetching user addresses:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load saved addresses.'
    })
  }
}

// @desc    Create user address
// @route   POST /api/users/addresses
// @access  Private
export const createAddress = async (req: Request, res: Response) => {
  try {
    const parsed = addressSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid address data.'
      })
    }

    const userId = req.user!.id
    const resolvedZip = parsed.data.zipCode || parsed.data.postalCode || ''
    if (!resolvedZip) {
      return res.status(400).json({
        success: false,
        error: 'Postal / ZIP code is required.'
      })
    }

    const { postalCode: _ignoredPostal, ...restCreate } = parsed.data
    const address = await databaseService.createAddress({
      ...restCreate,
      zipCode: resolvedZip,
      company: parsed.data.company || undefined,
      address2: parsed.data.address2 || undefined,
      phone: parsed.data.phone || undefined,
      userId
    })

    res.status(201).json({
      success: true,
      message: 'Address created successfully',
      data: address
    })
  } catch (error) {
    console.error('Error creating address:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to save address.'
    })
  }
}

// @desc    Update user address
// @route   PUT /api/users/addresses/:id
// @access  Private
export const updateAddress = async (req: Request, res: Response) => {
  try {
    const parsed = updateAddressSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid address update data.'
      })
    }

    const userId = req.user!.id
    const addressId = req.params.id
    const { postalCode, zipCode, ...restUpdate } = parsed.data
    const updateData = {
      ...restUpdate,
      ...(zipCode || postalCode ? { zipCode: zipCode || postalCode } : {})
    }

    // Check if address belongs to user
    const address = await databaseService.prisma.address.findFirst({
      where: {
        id: addressId,
        userId
      }
    })

    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Address not found'
      })
    }

    // If setting as default, unset other defaults
    if (updateData.isDefault) {
      await databaseService.prisma.address.updateMany({
        where: {
          userId,
          type: updateData.type || address.type,
          isDefault: true
        },
        data: { isDefault: false }
      })
    }

    const updatedAddress = await databaseService.prisma.address.update({
      where: { id: addressId },
      data: updateData
    })

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      data: updatedAddress
    })
  } catch (error) {
    console.error('Error updating address:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update address.'
    })
  }
}

// @desc    Delete user address
// @route   DELETE /api/users/addresses/:id
// @access  Private
export const deleteAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const addressId = req.params.id

    // Check if address belongs to user
    const address = await databaseService.prisma.address.findFirst({
      where: {
        id: addressId,
        userId
      }
    })

    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Address not found'
      })
    }

    await databaseService.prisma.address.delete({
      where: { id: addressId }
    })

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting address:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get user order history
// @route   GET /api/users/orders
// @access  Private
export const getOrderHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { limit = '10', page = '1' } = req.query

    const limitNum = parseInt(limit as string)
    const offset = (parseInt(page as string) - 1) * limitNum

    const [orders, totalOrders] = await Promise.all([
      databaseService.findOrders({
        userId,
        limit: limitNum,
        offset
      }),
      databaseService.getOrderCount({ userId })
    ])

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        currentPage: parseInt(page as string),
        totalPages: Math.ceil(totalOrders / limitNum),
        totalOrders
      }
    })
  } catch (error) {
    console.error('Error fetching order history:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get user dashboard data
// @route   GET /api/users/dashboard
// @access  Private
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    const [
      totalOrders,
      pendingOrders,
      deliveredOrders,
      userOrders,
      addresses
    ] = await Promise.all([
      databaseService.getOrderCount({ userId }),
      databaseService.getOrderCount({ userId, status: 'PENDING' }),
      databaseService.getOrderCount({ userId, status: 'DELIVERED' }),
      databaseService.findOrders({ userId, limit: 100 }),
      databaseService.findAddressesByUserId(userId)
    ])

    const totalSpent = userOrders
      .filter(o => o.paymentStatus === 'COMPLETED')
      .reduce((sum, o) => sum + Number(o.total || 0), 0)
    const recentOrders = userOrders.slice(0, 3)

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalOrders,
          pendingOrders,
          deliveredOrders,
          totalSpent: totalSpent || 0,
          totalAddresses: addresses.length
        },
        recentOrders
      }
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}