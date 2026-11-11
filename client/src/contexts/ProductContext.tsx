import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react'
import { Product, ProductState } from '../types'

// Product actions
type ProductAction =
  | { type: 'PRODUCTS_LOADING' }
  | { type: 'PRODUCTS_LOADED'; payload: { products: Product[]; pagination: ProductState['pagination'] } }
  | { type: 'PRODUCT_LOADED'; payload: Product }
  | { type: 'PRODUCTS_ERROR'; payload: string }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_CATEGORY'; payload: string | null }
  | { type: 'CLEAR_ERROR' }

// Product reducer
const productReducer = (state: ProductState, action: ProductAction): ProductState => {
  switch (action.type) {
    case 'PRODUCTS_LOADING':
      return {
        ...state,
        isLoading: true,
        error: null,
      }
    case 'PRODUCTS_LOADED':
      return {
        ...state,
        products: action.payload.products,
        isLoading: false,
        error: null,
        pagination: action.payload.pagination,
      }
    case 'PRODUCT_LOADED':
      return {
        ...state,
        currentProduct: action.payload,
        isLoading: false,
        error: null,
      }
    case 'PRODUCTS_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      }
    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: action.payload,
      }
    case 'SET_CATEGORY':
      return {
        ...state,
        selectedCategory: action.payload,
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

// Initial state
const initialState: ProductState = {
  products: [],
  currentProduct: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  selectedCategory: null,
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalProducts: 0,
  },
}

interface ProductContextType extends ProductState {
  fetchProducts: (page?: number, limit?: number, overrides?: { category?: string | null; search?: string }) => Promise<void>
  fetchProduct: (id: string) => Promise<void>
  fetchProductById: (id: string) => Promise<void>
  searchProducts: (query: string) => Promise<void>
  filterByCategory: (category: string | null) => Promise<void>
  clearError: () => void
}

const ProductContext = createContext<ProductContextType | undefined>(undefined)

// Product provider props
interface ProductProviderProps {
  children: ReactNode
}

// API base URL
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

// Product provider component
export const ProductProvider: React.FC<ProductProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(productReducer, initialState)

  // Fetch products with optional filters
  const fetchProducts = useCallback(async (
    page = 1,
    limit = 100,
    overrides?: { category?: string | null; search?: string }
  ) => {
    dispatch({ type: 'PRODUCTS_LOADING' })

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })

      const effectiveCategory = overrides && 'category' in overrides ? overrides.category : state.selectedCategory
      const effectiveSearch = overrides && 'search' in overrides ? overrides.search : state.searchQuery

      if (effectiveCategory) {
        params.append('category', effectiveCategory)
      }

      if (effectiveSearch) {
        params.append('search', effectiveSearch)
      }

      const response = await fetch(`${API_URL}/products?${params}`)
      const contentType = response.headers.get('content-type') || ''
      let data: any = null
      if (contentType.includes('application/json')) {
        try {
          data = await response.json()
        } catch {
          data = null
        }
      }

      if (!response.ok) {
        const errMessage = data?.error || data?.message || `Failed to fetch products (${response.status} ${response.statusText || 'Error'})`
        throw new Error(errMessage)
      }

      if (!data || !Array.isArray(data.data)) {
        throw new Error('Invalid products data received from server')
      }

      dispatch({
        type: 'PRODUCTS_LOADED',
        payload: {
          products: data.data,
          pagination: data.pagination,
        },
      })
    } catch (error) {
      dispatch({
        type: 'PRODUCTS_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to fetch products',
      })
    }
  }, [state.selectedCategory, state.searchQuery, API_URL])

  // Fetch single product
  const fetchProduct = useCallback(async (id: string) => {
    // Check if product is already cached in state
    const cached = state.products.find(p => p.id === id)
    if (cached) {
      dispatch({ type: 'PRODUCT_LOADED', payload: cached })
    } else {
      dispatch({ type: 'PRODUCTS_LOADING' })
    }

    try {
      const response = await fetch(`${API_URL}/products/${id}`)
      const contentType = response.headers.get('content-type') || ''
      let data: any = null
      if (contentType.includes('application/json')) {
        try {
          data = await response.json()
        } catch {
          data = null
        }
      }

      if (!response.ok) {
        if (!cached) {
          const errMessage = data?.error || data?.message || `Failed to fetch product (${response.status} ${response.statusText || 'Error'})`
          throw new Error(errMessage)
        }
        return
      }

      if (!data || !data.data) {
        if (!cached) throw new Error('Product not found')
        return
      }

      dispatch({ type: 'PRODUCT_LOADED', payload: data.data })
    } catch (error) {
      if (!cached) {
        dispatch({
          type: 'PRODUCTS_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to fetch product',
        })
      }
    }
  }, [state.products, API_URL])

  // Search products
  const searchProducts = async (query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query })
    await fetchProducts(1, 100, { search: query }) // Reset to first page with fresh search query
  }

  // Filter by category
  const filterByCategory = async (category: string | null) => {
    dispatch({ type: 'SET_CATEGORY', payload: category })
    await fetchProducts(1, 100, { category }) // Reset to first page with fresh category filter
  }

  // Clear error
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const value: ProductContextType = {
    ...state,
    fetchProducts,
    fetchProduct,
    fetchProductById: fetchProduct,
    searchProducts,
    filterByCategory,
    clearError,
  }

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>
}

// Custom hook to use product context
export const useProducts = (): ProductContextType => {
  const context = useContext(ProductContext)
  if (context === undefined) {
    throw new Error('useProducts must be used within a ProductProvider')
  }
  return context
}