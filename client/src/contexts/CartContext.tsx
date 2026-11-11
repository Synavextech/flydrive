import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { Cart, CartItem, Product, CartState } from '../types'
import { useAuth } from './AuthContext'

// Cart actions
type CartAction =
  | { type: 'CART_LOADING' }
  | { type: 'CART_LOADED'; payload: Cart }
  | { type: 'CART_ERROR'; payload: string }
  | { type: 'ADD_ITEM'; payload: { product: Product; quantity?: number } }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { itemId: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_ERROR' }

// Cart reducer
const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'CART_LOADING':
      return {
        ...state,
        isLoading: true,
        error: null,
      }
    case 'CART_LOADED':
      const items = action.payload.items || []
      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
      const totalPrice = items.reduce((sum, item) => sum + item.quantity * item.product.price, 0)

      return {
        ...state,
        cart: action.payload,
        items,
        isLoading: false,
        error: null,
        totalItems,
        totalPrice,
      }
    case 'CART_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      }
    case 'ADD_ITEM':
      const { product, quantity = 1 } = action.payload
      const existingItemIndex = state.items.findIndex(item => item.productId === product.id)

      if (existingItemIndex >= 0) {
        // Update existing item quantity
        const updatedItems = [...state.items]
        updatedItems[existingItemIndex].quantity += quantity

        const newTotalItems = state.totalItems + quantity
        const newTotalPrice = state.totalPrice + (product.price * quantity)

        return {
          ...state,
          items: updatedItems,
          totalItems: newTotalItems,
          totalPrice: newTotalPrice,
        }
      } else {
        // Add new item
        const newItem: CartItem = {
          id: `temp_${Date.now()}`, // Temporary ID until synced with backend
          cartId: state.cart?.id || '',
          productId: product.id,
          quantity,
          product,
        }

        const newTotalItems = state.totalItems + quantity
        const newTotalPrice = state.totalPrice + (product.price * quantity)

        return {
          ...state,
          items: [...state.items, newItem],
          totalItems: newTotalItems,
          totalPrice: newTotalPrice,
        }
      }
    case 'REMOVE_ITEM':
      const filteredItems = state.items.filter(item => item.id !== action.payload)
      const removedItem = state.items.find(item => item.id === action.payload)

      return {
        ...state,
        items: filteredItems,
        totalItems: state.totalItems - (removedItem?.quantity || 0),
        totalPrice: state.totalPrice - ((removedItem?.quantity || 0) * (removedItem?.product.price || 0)),
      }
    case 'UPDATE_QUANTITY':
      const { itemId, quantity: newQuantity } = action.payload
      const itemIndex = state.items.findIndex(item => item.id === itemId)

      if (itemIndex >= 0) {
        const oldQuantity = state.items[itemIndex].quantity
        const updatedItems = [...state.items]
        updatedItems[itemIndex].quantity = newQuantity

        const quantityDiff = newQuantity - oldQuantity
        const newTotalItems = state.totalItems + quantityDiff
        const newTotalPrice = state.totalPrice + (quantityDiff * state.items[itemIndex].product.price)

        return {
          ...state,
          items: updatedItems,
          totalItems: newTotalItems,
          totalPrice: newTotalPrice,
        }
      }
      return state
    case 'CLEAR_CART':
      return {
        ...state,
        cart: null,
        items: [],
        totalItems: 0,
        totalPrice: 0,
        error: null,
      }
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      }
    default:
      return state
  }
}

const getInitialCart = (): CartState => {
  try {
    const saved = localStorage.getItem('driveflyelectric_cart') || localStorage.getItem('trendstore_cart')
    if (saved) {
      const items: CartItem[] = JSON.parse(saved)
      if (Array.isArray(items)) {
        const totalItems = items.reduce((sum, item) => sum + (item.quantity || 1), 0)
        const totalPrice = items.reduce((sum, item) => sum + (item.quantity || 1) * (item.product?.price || 0), 0)
        return {
          cart: null,
          items,
          isLoading: false,
          error: null,
          totalItems,
          totalPrice,
        }
      }
    }
  } catch (e) {
    // ignore parse error
  }
  return {
    cart: null,
    items: [],
    isLoading: false,
    error: null,
    totalItems: 0,
    totalPrice: 0,
  }
}

// Initial state
const initialState: CartState = getInitialCart()

// Create context
interface CartContextType extends CartState {
  addToCart: (product: Product, quantity?: number) => void
  removeFromCart: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
  clearError: () => void
  syncCart: () => Promise<void>
}

const CartContext = createContext<CartContextType | undefined>(undefined)

// Cart provider props
interface CartProviderProps {
  children: ReactNode
}

// API base URL
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

// Cart provider component
export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState)
  const { isAuthenticated, user } = useAuth()

  // Save guest cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('driveflyelectric_cart', JSON.stringify(state.items))
      localStorage.removeItem('trendstore_cart')
    } catch (e) {
      // ignore storage error
    }
  }, [state.items])

  // Load cart when user logs in & sync guest items
  useEffect(() => {
    if (isAuthenticated && user) {
      syncGuestCartAndLoad()
    }
  }, [isAuthenticated, user?.id])

  // Sync guest cart items to backend then load user's cart
  const syncGuestCartAndLoad = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    // If there were guest items, sync them to backend first
    if (state.items.length > 0) {
      for (const item of state.items) {
        if (item.productId) {
          try {
            await fetch(`${API_URL}/cart/items`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                productId: item.productId,
                quantity: item.quantity,
              }),
            })
          } catch (e) {
            // continue syncing others
          }
        }
      }
    }

    await loadCart()
  }

  // Load cart from backend
  const loadCart = async () => {
    if (!isAuthenticated) return

    dispatch({ type: 'CART_LOADING' })

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/cart`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const contentType = response.headers.get('content-type') || ''
      let data: any = null
      if (contentType.includes('application/json')) {
        try {
          data = await response.json()
        } catch {
          data = null
        }
      }

      if (response.ok && data?.data) {
        dispatch({ type: 'CART_LOADED', payload: data.data })
      } else {
        const errMessage = data?.error || data?.message || `Failed to load cart (${response.status})`
        throw new Error(errMessage)
      }
    } catch (error) {
      dispatch({ type: 'CART_ERROR', payload: error instanceof Error ? error.message : 'Failed to load cart' })
    }
  }

  // Add item to cart
  const addToCart = async (product: Product, quantity = 1) => {
    dispatch({ type: 'ADD_ITEM', payload: { product, quantity } })

    // Sync with backend if user is authenticated
    if (isAuthenticated) {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`${API_URL}/cart/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            productId: product.id,
            quantity,
          }),
        })

        if (response.ok) {
          loadCart()
        }
      } catch (error) {
        // optimistic update is retained locally
      }
    }
  }

  // Remove item from cart
  const removeFromCart = async (itemId: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: itemId })

    if (isAuthenticated) {
      try {
        const token = localStorage.getItem('token')
        await fetch(`${API_URL}/cart/items/${itemId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      } catch (error) {
        // Reload cart on error to restore correct state
        loadCart()
      }
    }
  }

  // Update item quantity
  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId)
      return
    }

    dispatch({ type: 'UPDATE_QUANTITY', payload: { itemId, quantity } })

    if (isAuthenticated) {
      try {
        const token = localStorage.getItem('token')
        await fetch(`${API_URL}/cart/items/${itemId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quantity }),
        })
      } catch (error) {
        // Reload cart on error to restore correct state
        loadCart()
      }
    }
  }

  // Clear cart
  const clearCart = () => {
    try {
      localStorage.removeItem('driveflyelectric_cart')
      localStorage.removeItem('trendstore_cart')
    } catch (e) {}
    dispatch({ type: 'CLEAR_CART' })
  }

  // Clear error
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  // Sync cart with backend (for guest users who log in)
  const syncCart = async () => {
    if (state.items.length > 0 && isAuthenticated) {
      // Here you would sync local cart items to backend
      // For now, just reload from backend
      loadCart()
    }
  }

  const value: CartContextType = {
    ...state,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    clearError,
    syncCart,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// Custom hook to use cart context
export const useCart = (): CartContextType => {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}