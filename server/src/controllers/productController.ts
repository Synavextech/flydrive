import { Request, Response } from 'express'
import { z } from 'zod'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'

const optionalNullableNumber = z.preprocess(
  (val) => (val === '' || val === undefined || val === null ? null : val),
  z.coerce.number().min(0).max(10000000).nullable()
)

const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required.').max(200),
  description: z.string().trim().max(10000).optional().nullable(),
  price: z.coerce.number().min(0, 'Price must be 0 or greater.').max(10000000),
  originalPrice: optionalNullableNumber.optional(),
  sku: z.string().trim().min(1, 'SKU is required.').max(100),
  stock: z.coerce.number().int().min(0).max(100000).default(0),
  images: z.array(z.string().trim().max(2048)).max(20).optional().default([]),
  category: z.string().trim().min(1, 'Category is required.').max(100),
  brand: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  isNew: z.boolean().optional().default(false),
  isComingSoon: z.boolean().optional().default(false),
  comingSoonRelease: z.string().trim().max(100).optional().nullable(),
  shippingRequired: z.boolean().optional().default(true),
  averageDeliveryTime: z.string().trim().max(100).optional().nullable(),
  weight: optionalNullableNumber.optional(),
  dimensions: z.string().trim().max(150).optional().nullable()
})

const productUpdateSchema = productInputSchema.partial()

const reviewInputSchema = z.object({
  reviewerName: z.string().trim().max(100).optional(),
  reviewerEmail: z.string().trim().email('Invalid email address.').max(254).optional().or(z.literal('')).nullable(),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  title: z.string().trim().max(150).optional().nullable(),
  comment: z.string().trim().min(2, 'Please write a review comment before submitting.').max(2000),
  images: z.array(z.string().trim().max(1024)).max(4).optional().default([])
})

const bookingInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name.').max(120),
  email: z.string().trim().email('Please provide a valid email address.').max(254),
  phone: z.string().trim().max(40).optional().nullable(),
  country: z.string().trim().min(2, 'Please select your country.').max(120),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  notes: z.string().trim().max(1000).optional().nullable()
})

function sanitizeReviewImages(rawImages: string[]): string[] {
  return rawImages.filter((url) => url.startsWith('/images/') || url.startsWith('https://'))
}

function sanitizePublicReview(rev: any) {
  return {
    id: rev.id,
    productId: rev.productId,
    reviewerName: rev.reviewerName,
    rating: rev.rating,
    title: rev.title,
    comment: rev.comment,
    images: Array.isArray(rev.images) ? rev.images : [],
    verifiedPurchase: Boolean(rev.verifiedPurchase),
    createdAt: rev.createdAt,
    updatedAt: rev.updatedAt
  }
}

// @desc    Get all products
// @route   GET /api/products
// @access  Public
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { category, search, comingSoon, limit = '100', page = '1' } = req.query

    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 100))
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const offset = (pageNum - 1) * limitNum
    const comingSoonFilter =
      comingSoon === 'true' ? true : comingSoon === 'false' ? false : undefined

    const products = await databaseService.findProducts({
      category: category as string,
      search: search as string,
      comingSoon: comingSoonFilter,
      limit: limitNum,
      offset
    })

    const totalProducts = await databaseService.getProductCount({
      category: category as string,
      search: search as string,
      comingSoon: comingSoonFilter
    })

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.max(1, Math.ceil(totalProducts / limitNum)),
        totalProducts
      }
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load products.'
    })
  }
}

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
export const getProduct = async (req: Request, res: Response) => {
  try {
    const product = await databaseService.findProductById(req.params.id)

    if (!product || (!product.isActive && req.user?.role !== 'ADMIN')) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      })
    }

    res.status(200).json({
      success: true,
      data: product
    })
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load product details.'
    })
  }
}

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
export const createProduct = async (req: Request, res: Response) => {
  try {
    const parsed = productInputSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid product payload.'
      })
    }

    const newProduct = await databaseService.createProduct(parsed.data)

    res.status(201).json({
      success: true,
      data: newProduct
    })
  } catch (error) {
    console.error('Error creating product:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to create product.'
    })
  }
}

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const parsed = productUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid product update payload.'
      })
    }

    const productId = req.params.id
    const updatedProduct = await databaseService.updateProduct(productId, parsed.data)

    res.status(200).json({
      success: true,
      data: updatedProduct
    })
  } catch (error) {
    console.error('Error updating product:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update product.'
    })
  }
}

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const productId = req.params.id

    await databaseService.deleteProduct(productId)

    res.status(200).json({
      success: true,
      data: {}
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to delete product.'
    })
  }
}

// @desc    Get all product reviews grouped by productId
// @route   GET /api/products/reviews/all
// @access  Public
export const getAllProductReviews = async (_req: Request, res: Response) => {
  try {
    const reviews = (await databaseService.getProductReviews()).map(sanitizePublicReview)
    const grouped: Record<string, any[]> = {}
    for (const rev of reviews) {
      if (!grouped[rev.productId]) grouped[rev.productId] = []
      grouped[rev.productId].push(rev)
    }

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
      grouped
    })
  } catch (error) {
    console.error('Error fetching all product reviews:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load product reviews'
    })
  }
}

// @desc    Get reviews for a single product
// @route   GET /api/products/:id/reviews
// @access  Public
export const getProductReviews = async (req: Request, res: Response) => {
  try {
    const productId = req.params.id
    const reviews = (await databaseService.getProductReviews(productId)).map(sanitizePublicReview)

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews
    })
  } catch (error) {
    console.error('Error fetching product reviews:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load product reviews'
    })
  }
}

// @desc    Create a new customer review for a product (supports uploaded review images)
// @route   POST /api/products/:id/reviews
// @access  Public (Optional Auth)
export const createProductReview = async (req: Request, res: Response) => {
  try {
    const productId = req.params.id
    const parsed = reviewInputSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Please check your review inputs and try again.'
      })
    }

    const { reviewerName, reviewerEmail, rating, title, comment, images } = parsed.data

    const product = await databaseService.findProductById(productId)
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      })
    }

    const userFullName = req.user
      ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
      : ''

    const created = await databaseService.createProductReview({
      productId,
      userId: req.user?.id || null,
      reviewerName: reviewerName || userFullName || req.user?.email?.split('@')[0] || 'Verified Buyer',
      reviewerEmail: (reviewerEmail && reviewerEmail.trim()) || req.user?.email || null,
      rating,
      title: title || null,
      comment,
      images: sanitizeReviewImages(images)
    })

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: sanitizePublicReview(created)
    })
  } catch (error) {
    console.error('Error creating product review:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to submit product review'
    })
  }
}

// @desc    Create a pre-order / reservation booking for a Coming Soon vehicle
// @route   POST /api/products/:id/book
// @access  Public (Optional Auth)
export const createProductBooking = async (req: Request, res: Response) => {
  try {
    const productId = req.params.id
    const parsed = bookingInputSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Please complete all required booking fields.'
      })
    }

    const product = await databaseService.findProductById(productId)
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found or not currently available for booking.'
      })
    }

    const booking = await databaseService.createProductBooking({
      productId,
      userId: req.user?.id || null,
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone || undefined,
      country: parsed.data.country,
      quantity: parsed.data.quantity,
      notes: parsed.data.notes || undefined
    })

    emailService
      .sendBookingNotifications(booking, product)
      .catch((err) => console.error('Booking notification email error:', err))

    res.status(201).json({
      success: true,
      message: 'Reservation request received successfully.',
      data: {
        id: booking.id,
        bookingReference: booking.bookingReference,
        productId: booking.productId,
        productName: product.name,
        fullName: booking.fullName,
        country: booking.country,
        quantity: booking.quantity,
        status: booking.status,
        createdAt: booking.createdAt
      }
    })
  } catch (error) {
    console.error('Error creating product booking:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to complete booking reservation right now. Please try again.'
    })
  }
}