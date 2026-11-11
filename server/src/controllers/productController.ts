import { Request, Response, NextFunction } from 'express'
import { databaseService } from '../services/databaseService.js'

// @desc    Get all products
// @route   GET /api/products
// @access  Public
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { category, search, limit = '100', page = '1' } = req.query

    // Parse pagination parameters
    const limitNum = parseInt(limit as string)
    const pageNum = parseInt(page as string)
    const offset = (pageNum - 1) * limitNum

    // Get products from database
    const products = await databaseService.findProducts({
      category: category as string,
      search: search as string,
      limit: limitNum,
      offset
    })

    // Get total count for pagination
    const totalProducts = await databaseService.getProductCount({
      category: category as string,
      search: search as string
    })

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalProducts / limitNum),
        totalProducts
      }
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
export const getProduct = async (req: Request, res: Response) => {
  try {
    const product = await databaseService.findProductById(req.params.id)

    if (!product) {
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
      error: 'Server Error'
    })
  }
}

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
export const createProduct = async (req: Request, res: Response) => {
  try {
    const productData = req.body

    const newProduct = await databaseService.createProduct(productData)

    res.status(201).json({
      success: true,
      data: newProduct
    })
  } catch (error) {
    console.error('Error creating product:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const productId = req.params.id
    const updateData = req.body

    const updatedProduct = await databaseService.updateProduct(productId, updateData)

    res.status(200).json({
      success: true,
      data: updatedProduct
    })
  } catch (error) {
    console.error('Error updating product:', error)
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
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
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get all product reviews grouped by productId
// @route   GET /api/products/reviews/all
// @access  Public
export const getAllProductReviews = async (_req: Request, res: Response) => {
  try {
    const reviews = await databaseService.getProductReviews()
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
    const reviews = await databaseService.getProductReviews(productId)

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
    const { reviewerName, reviewerEmail, rating = 5, title, comment, images } = req.body

    if (!comment || !String(comment).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please write a review comment before submitting'
      })
    }

    const userFullName = req.user
      ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
      : ''

    const created = await databaseService.createProductReview({
      productId,
      userId: req.user?.id || null,
      reviewerName: reviewerName || userFullName || req.user?.email?.split('@')[0] || 'Verified Buyer',
      reviewerEmail: reviewerEmail || req.user?.email || null,
      rating: Number(rating || 5),
      title: title || null,
      comment: String(comment).trim(),
      images: Array.isArray(images) ? images : []
    })

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: created
    })
  } catch (error) {
    console.error('Error creating product review:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to submit product review'
    })
  }
}