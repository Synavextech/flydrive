import React, { createContext, useContext, useReducer, useCallback, useState, useEffect, ReactNode } from 'react'
import { Product, ProductState, ProductReview } from '../types'
import { productApi as reviewApi } from '../services/api'

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

interface SubmitReviewPayload {
  reviewerName: string
  reviewerEmail?: string
  rating: number
  title?: string
  comment: string
  images?: string[]
}

interface ProductContextType extends ProductState {
  reviewsByProduct: Record<string, ProductReview[]>
  reviewsLoading: boolean
  fetchProducts: (page?: number, limit?: number, overrides?: { category?: string | null; search?: string }) => Promise<void>
  fetchProduct: (id: string) => Promise<void>
  fetchProductById: (id: string) => Promise<void>
  searchProducts: (query: string) => Promise<void>
  filterByCategory: (category: string | null) => Promise<void>
  fetchAllReviews: () => Promise<void>
  fetchProductReviews: (productId: string) => Promise<ProductReview[]>
  getReviewsForProduct: (product: Product) => ProductReview[]
  submitProductReview: (productId: string, payload: SubmitReviewPayload, files?: File[]) => Promise<ProductReview>
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
        const errMessage = data?.error || data?.message || 'Unable to load catalog inventory right now. Please try again.'
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
        payload: error instanceof Error ? error.message : 'Unable to load catalog inventory right now.',
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
          const errMessage = data?.error || data?.message || 'Product details could not be loaded.'
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
          payload: error instanceof Error ? error.message : 'Product details could not be loaded.',
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

  const [reviewsByProduct, setReviewsByProduct] = useState<Record<string, ProductReview[]>>({})
  const [reviewsLoading, setReviewsLoading] = useState(false)

  const fetchAllReviews = useCallback(async () => {
    try {
      setReviewsLoading(true)
      const response = await reviewApi.getAllReviews()
      if (response.success) {
        if (response.grouped && typeof response.grouped === 'object') {
          setReviewsByProduct(response.grouped)
        } else if (Array.isArray(response.data)) {
          const grouped: Record<string, ProductReview[]> = {}
          for (const rev of response.data) {
            if (!grouped[rev.productId]) grouped[rev.productId] = []
            grouped[rev.productId].push(rev)
          }
          setReviewsByProduct(grouped)
        }
      }
    } catch (error) {
      console.error('Failed to fetch product reviews:', error)
    } finally {
      setReviewsLoading(false)
    }
  }, [])

  const fetchProductReviews = useCallback(async (productId: string): Promise<ProductReview[]> => {
    try {
      const response = await reviewApi.getProductReviews(productId)
      if (response.success && Array.isArray(response.data)) {
        setReviewsByProduct((prev) => ({
          ...prev,
          [productId]: response.data as ProductReview[],
        }))
        return response.data
      }
      return []
    } catch (error) {
      console.error(`Failed to fetch reviews for product ${productId}:`, error)
      return []
    }
  }, [])

  const getReviewsForProduct = useCallback(
    (product: Product): ProductReview[] => {
      return reviewsByProduct[product.id] || []
    },
    [reviewsByProduct]
  )

  const submitProductReview = useCallback(
    async (productId: string, payload: SubmitReviewPayload, files?: File[]): Promise<ProductReview> => {
      let uploadedUrls: string[] = []
      if (files && files.length > 0) {
        const uploadResponse = await reviewApi.uploadReviewImages(files)
        if (!uploadResponse.success) {
          throw new Error(uploadResponse.error || uploadResponse.message || 'Failed to upload review images')
        }
        uploadedUrls = uploadResponse.data?.urls || (uploadResponse.data?.url ? [uploadResponse.data.url] : [])
      }

      const finalImages = [...(payload.images || []), ...uploadedUrls]
      const response = await reviewApi.createProductReview(productId, {
        ...payload,
        images: finalImages,
      })

      if (!response.success || !response.data) {
        throw new Error(response.error || response.message || 'Failed to save review')
      }

      const created = response.data
      setReviewsByProduct((prev) => {
        const existing = prev[productId] || []
        return {
          ...prev,
          [productId]: [created, ...existing.filter((item) => item.id !== created.id)],
        }
      })

      return created
    },
    []
  )

  useEffect(() => {
    fetchAllReviews()
  }, [fetchAllReviews])

  // Clear error
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const value: ProductContextType = {
    ...state,
    reviewsByProduct,
    reviewsLoading,
    fetchProducts,
    fetchProduct,
    fetchProductById: fetchProduct,
    searchProducts,
    filterByCategory,
    fetchAllReviews,
    fetchProductReviews,
    getReviewsForProduct,
    submitProductReview,
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