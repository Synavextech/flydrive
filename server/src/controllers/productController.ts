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