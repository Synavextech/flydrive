import { Request, Response } from 'express'
import { z } from 'zod'
import { databaseService } from '../services/databaseService.js'

const addToCartSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required.').max(100),
  quantity: z.coerce.number().int('Quantity must be a whole number.').min(1, 'Minimum quantity is 1.').max(50, 'Maximum quantity per item is 50.').default(1)
})

const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int('Quantity must be a whole number.').min(1, 'Quantity must be at least 1.').max(50, 'Maximum quantity per item is 50.')
})

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
export const getCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    const cart = await databaseService.findOrCreateCart(userId)

    res.status(200).json({
      success: true,
      data: cart
    })
  } catch (error) {
    console.error('Error fetching cart:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load shopping cart.'
    })
  }
}

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
export const addToCart = async (req: Request, res: Response) => {
  try {
    const parsed = addToCartSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid cart item payload.'
      })
    }

    const userId = req.user!.id
    const { productId, quantity } = parsed.data

    // Validate product exists and is active
    const product = await databaseService.findProductById(productId)
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      })
    }

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Product is not currently available for purchase.'
      })
    }

    if (product.isComingSoon) {
      return res.status(400).json({
        success: false,
        error: 'This upcoming vehicle is not yet open for direct cart checkout. Use Book Now to reserve an alert.'
      })
    }

    const existingCart = await databaseService.findOrCreateCart(userId)
    const existingItem = existingCart.items?.find((item: any) => item.productId === productId)
    const cumulativeQty = (existingItem ? Number(existingItem.quantity) : 0) + quantity

    if (product.stock < cumulativeQty) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Only ${product.stock} unit(s) available.`
      })
    }

    const cartItem = await databaseService.addToCart(userId, productId, quantity)

    res.status(201).json({
      success: true,
      message: 'Item added to cart',
      data: cartItem
    })
  } catch (error) {
    console.error('Error adding to cart:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to add item to cart.'
    })
  }
}

// @desc    Update cart item quantity
// @route   PUT /api/cart/:itemId
// @access  Private
export const updateCartItem = async (req: Request, res: Response) => {
  try {
    const parsed = updateCartItemSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid quantity specified.'
      })
    }

    const { quantity } = parsed.data
    const cartItemId = req.params.itemId

    // Check if cart item exists and belongs to user
    const cartItem = await databaseService.prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { cart: true }
    })

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: 'Cart item not found'
      })
    }

    if (cartItem.cart.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this cart item'
      })
    }

    // Check stock availability
    const product = await databaseService.findProductById(cartItem.productId)
    if (!product || !product.isActive || product.isComingSoon) {
      return res.status(400).json({
        success: false,
        error: 'This product is no longer available for direct purchase.'
      })
    }

    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Only ${product.stock} unit(s) available.`
      })
    }

    const updatedCartItem = await databaseService.updateCartItem(cartItemId, quantity)

    res.status(200).json({
      success: true,
      message: 'Cart item updated',
      data: updatedCartItem
    })
  } catch (error) {
    console.error('Error updating cart item:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to update cart item.'
    })
  }
}

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
export const removeFromCart = async (req: Request, res: Response) => {
  try {
    const cartItemId = req.params.itemId

    // Check if cart item exists and belongs to user
    const cartItem = await databaseService.prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { cart: true }
    })

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: 'Cart item not found'
      })
    }

    if (cartItem.cart.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to remove this cart item'
      })
    }

    await databaseService.removeCartItem(cartItemId)

    res.status(200).json({
      success: true,
      message: 'Item removed from cart'
    })
  } catch (error) {
    console.error('Error removing from cart:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
export const clearCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    await databaseService.clearCart(userId)

    res.status(200).json({
      success: true,
      message: 'Cart cleared'
    })
  } catch (error) {
    console.error('Error clearing cart:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}

// @desc    Get cart summary (for checkout)
// @route   GET /api/cart/summary
// @access  Private
export const getCartSummary = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    const cart = await databaseService.findOrCreateCart(userId)

    if (!cart.items.length) {
      return res.status(200).json({
        success: true,
        data: {
          items: [],
          subtotal: 0,
          totalItems: 0,
          totalQuantity: 0
        }
      })
    }

    const subtotal = cart.items.reduce((sum, item) => {
      return sum + ((item as any).product.price * item.quantity)
    }, 0)

    const totalItems = cart.items.length
    const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0)

    res.status(200).json({
      success: true,
      data: {
        items: cart.items,
        subtotal,
        totalItems,
        totalQuantity
      }
    })
  } catch (error) {
    console.error('Error getting cart summary:', error)
    res.status(500).json({
      success: false,
      error: 'Server Error'
    })
  }
}