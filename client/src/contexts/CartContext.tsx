import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback, ReactNode } from 'react'
import { Cart, CartItem, Product, CartState } from '../types'
import { useAuth } from './AuthContext'

const CART_VISITOR_ID_KEY = 'dfe_cart_visitor_id'
const CHECKOUT_EMAIL_KEY = 'dfe_checkout_email'
const CHECKOUT_NAME_KEY = 'dfe_checkout_name'

function getOrCreateCartVisitorId(): string {
  try {
    const existing = localStorage.getItem(CART_VISITOR_ID_KEY)
    if (existing) return existing
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `vis_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(CART_VISITOR_ID_KEY, created)
    return created
  } catch {
    return ''
  }
}

function getStoredGuestCheckoutEmail(): string {
  try {
    const email = (localStorage.getItem(CHECKOUT_EMAIL_KEY) || '').trim().toLowerCase()
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : ''
  } catch {
    return ''
  }
}

function getStoredGuestCheckoutName(): string {
  try {
    return (localStorage.getItem(CHECKOUT_NAME_KEY) || '').trim()
  } catch {
    return ''
  }
}

function buildOptionalAuthHeaders(includeJsonContentType = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json'
  }
  try {
    const token = localStorage.getItem('token')
    if (token && token !== 'null' && token !== 'undefined') {
      headers['Authorization'] = `Bearer ${token}`
    }
  } catch {
    // Cookie authentication handles session seamlessly
  }
  return headers
}

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
        // Update existing item quantity immutably
        const currentExisting = state.items[existingItemIndex]
        const updatedItems = [...state.items]
        updatedItems[existingItemIndex] = {
          ...currentExisting,
          quantity: currentExisting.quantity + quantity,
        }

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
        updatedItems[itemIndex] = {
          ...state.items[itemIndex],
          quantity: newQuantity,
        }

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
  addToCart: (product: Product, quantity?: number) => Promise<void> | void
  removeFromCart: (itemId: string) => Promise<void> | void
  updateQuantity: (itemId: string, quantity: number) => Promise<void> | void
  clearCart: () => Promise<void>
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
  const itemsRef = useRef<CartItem[]>(state.items)
  const wasAuthenticatedRef = useRef<boolean>(isAuthenticated)
  const syncingRef = useRef<boolean>(false)

  // Keep latest items ref & save local cart copy for page reload resilience
  useEffect(() => {
    itemsRef.current = state.items
    try {
      localStorage.setItem('driveflyelectric_cart', JSON.stringify(state.items))
      localStorage.removeItem('trendstore_cart')
    } catch {
      // ignore storage error
    }
  }, [state.items])

  const syncGuestReminderSnapshot = useCallback(
    async (itemsSnapshot: CartItem[]) => {
      if (isAuthenticated) return
      const guestEmail = getStoredGuestCheckoutEmail()
      const visitorId = getOrCreateCartVisitorId()
      if (!guestEmail && itemsSnapshot.length === 0 && visitorId) {
        await fetch(`${API_URL}/cart/reminder-snapshot`, {
          method: 'DELETE',
          credentials: 'include',
          headers: buildOptionalAuthHeaders(true),
          body: JSON.stringify({ visitorId }),
        }).catch(() => {})
        return
      }
      if (!guestEmail) return

      const payloadItems = itemsSnapshot
        .filter((it) => it.productId && it.quantity > 0)
        .map((it) => ({ productId: it.productId, quantity: it.quantity }))

      await fetch(`${API_URL}/cart/reminder-snapshot`, {
        method: 'POST',
        credentials: 'include',
        headers: buildOptionalAuthHeaders(true),
        body: JSON.stringify({
          email: guestEmail,
          customerName: getStoredGuestCheckoutName() || undefined,
          visitorId: visitorId || undefined,
          items: payloadItems,
        }),
      }).catch(() => {})
    },
    [isAuthenticated]
  )

  // Load cart from backend
  const loadCart = useCallback(async () => {
    if (!isAuthenticated) return

    dispatch({ type: 'CART_LOADING' })

    try {
      const response = await fetch(`${API_URL}/cart`, {
        credentials: 'include',
        headers: buildOptionalAuthHeaders(false),
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
        const errMessage = data?.error || data?.message || 'Unable to load your saved cart right now.'
        throw new Error(errMessage)
      }
    } catch (error) {
      dispatch({
        type: 'CART_ERROR',
        payload: error instanceof Error ? error.message : 'Unable to load cart right now.',
      })
    }
  }, [isAuthenticated])

  // Sync unpersisted guest (temp_*) items to backend and reload authoritative DB cart
  const syncCart = useCallback(async () => {
    if (!isAuthenticated) {
      await syncGuestReminderSnapshot(itemsRef.current)
      return
    }
    if (syncingRef.current) return
    syncingRef.current = true

    try {
      const unsyncedGuestItems = itemsRef.current.filter(
        (item) => item.productId && String(item.id || '').startsWith('temp_')
      )
      for (const item of unsyncedGuestItems) {
        try {
          await fetch(`${API_URL}/cart/items`, {
            method: 'POST',
            credentials: 'include',
            headers: buildOptionalAuthHeaders(true),
            body: JSON.stringify({
              productId: item.productId,
              quantity: item.quantity,
            }),
          })
        } catch {
          // continue syncing remaining items
        }
      }
      await loadCart()
    } finally {
      syncingRef.current = false
    }
  }, [isAuthenticated, loadCart, syncGuestReminderSnapshot])

  // Load & merge cart on sign-in, and clear account cart cleanly on logout
  useEffect(() => {
    if (isAuthenticated && user) {
      wasAuthenticatedRef.current = true
      syncCart()
    } else if (wasAuthenticatedRef.current && !isAuthenticated) {
      wasAuthenticatedRef.current = false
      try {
        localStorage.removeItem('driveflyelectric_cart')
        localStorage.removeItem('trendstore_cart')
      } catch {
        // ignore storage error
      }
      dispatch({ type: 'CLEAR_CART' })
    }
  }, [isAuthenticated, user?.id, syncCart])

  // Add item to cart
  const addToCart = async (product: Product, quantity = 1) => {
    if (product?.isComingSoon) {
      dispatch({ type: 'CART_ERROR', payload: 'This upcoming model is available by reservation request only.' })
      return
    }
    dispatch({ type: 'ADD_ITEM', payload: { product, quantity } })

    if (isAuthenticated) {
      try {
        const response = await fetch(`${API_URL}/cart/items`, {
          method: 'POST',
          credentials: 'include',
          headers: buildOptionalAuthHeaders(true),
          body: JSON.stringify({
            productId: product.id,
            quantity,
          }),
        })

        if (response.ok) {
          await loadCart()
        }
      } catch {
        // optimistic update is retained locally
      }
    } else {
      const existing = itemsRef.current.find((i) => i.productId === product.id)
      const nextItems = existing
        ? itemsRef.current.map((i) =>
            i.productId === product.id ? { ...i, quantity: i.quantity + quantity } : i
          )
        : [
            ...itemsRef.current,
            {
              id: `temp_${Date.now()}`,
              cartId: '',
              productId: product.id,
              quantity,
              product,
            },
          ]
      syncGuestReminderSnapshot(nextItems).catch(() => {})
    }
  }

  // Remove item from cart
  const removeFromCart = async (itemId: string) => {
    const targetItem = itemsRef.current.find((i) => i.id === itemId)
    const remainingItems = itemsRef.current.filter((i) => i.id !== itemId)
    dispatch({ type: 'REMOVE_ITEM', payload: itemId })

    if (isAuthenticated) {
      try {
        let backendItemId = itemId
        if (itemId.startsWith('temp_') && targetItem?.productId) {
          const cartRes = await fetch(`${API_URL}/cart`, {
            credentials: 'include',
            headers: buildOptionalAuthHeaders(false),
          })
          const cartJson = await cartRes.json().catch(() => null)
          const matched = cartJson?.data?.items?.find((ci: any) => ci.productId === targetItem.productId)
          if (matched?.id) {
            backendItemId = matched.id
          } else {
            await loadCart()
            return
          }
        }

        await fetch(`${API_URL}/cart/items/${encodeURIComponent(backendItemId)}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: buildOptionalAuthHeaders(false),
        })
      } catch {
        await loadCart()
      }
    } else {
      syncGuestReminderSnapshot(remainingItems).catch(() => {})
    }
  }

  // Update item quantity
  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      await removeFromCart(itemId)
      return
    }

    const targetItem = itemsRef.current.find((i) => i.id === itemId)
    const nextItems = itemsRef.current.map((i) =>
      i.id === itemId ? { ...i, quantity } : i
    )
    dispatch({ type: 'UPDATE_QUANTITY', payload: { itemId, quantity } })

    if (isAuthenticated) {
      try {
        let backendItemId = itemId
        if (itemId.startsWith('temp_') && targetItem?.productId) {
          const cartRes = await fetch(`${API_URL}/cart`, {
            credentials: 'include',
            headers: buildOptionalAuthHeaders(false),
          })
          const cartJson = await cartRes.json().catch(() => null)
          const matched = cartJson?.data?.items?.find((ci: any) => ci.productId === targetItem.productId)
          if (matched?.id) {
            backendItemId = matched.id
          } else {
            await loadCart()
            return
          }
        }

        await fetch(`${API_URL}/cart/items/${encodeURIComponent(backendItemId)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: buildOptionalAuthHeaders(true),
          body: JSON.stringify({ quantity }),
        })
      } catch {
        await loadCart()
      }
    } else {
      syncGuestReminderSnapshot(nextItems).catch(() => {})
    }
  }

  // Clear cart locally, in backend database, and cancel unpaid cart reminders
  const clearCart = async () => {
    itemsRef.current = []
    try {
      localStorage.removeItem('driveflyelectric_cart')
      localStorage.removeItem('trendstore_cart')
    } catch {
      // ignore storage error
    }
    dispatch({ type: 'CLEAR_CART' })

    const visitorId = getOrCreateCartVisitorId()
    const guestEmail = getStoredGuestCheckoutEmail()

    if (isAuthenticated) {
      try {
        await fetch(`${API_URL}/cart`, {
          method: 'DELETE',
          credentials: 'include',
          headers: buildOptionalAuthHeaders(true),
          body: JSON.stringify({ visitorId }),
        })
      } catch {
        // local cart remains cleared
      }
    }

    if (guestEmail || (!isAuthenticated && visitorId)) {
      await fetch(`${API_URL}/cart/reminder-snapshot`, {
        method: 'DELETE',
        credentials: 'include',
        headers: buildOptionalAuthHeaders(true),
        body: JSON.stringify({
          ...(guestEmail ? { email: guestEmail } : {}),
          visitorId,
        }),
      }).catch(() => {})
    }
  }

  // Clear error
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
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