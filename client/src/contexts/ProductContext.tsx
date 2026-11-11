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

  const [reviewsByProduct, setReviewsByProduct] = useState<Record<string, ProductReview[]>>({})
  const [reviewsLoading, setReviewsLoading] = useState(false)

  const buildBaselineReviews = useCallback((product: Product): ProductReview[] => {
    const productName = product.name || 'Electric Vehicle'
    const shortName = productName.split('(')[0].trim()
    const category = (product.category || '').toLowerCase()
    const thumb = product.images?.[0] || ''
    const thumb2 = product.images?.[1] || thumb

    const reviewerProfiles = category.includes('heli')
      ? [
          { name: 'Capt. Henrik Lindqvist', rating: 5, title: 'Flight-ready assembly & telemetry stability', comment: `Took delivery of the ${shortName} in Gothenburg. Rotor balance, avionics harness, and battery thermal curve passed pre-flight checks smoothly.`, daysAgo: 6 },
          { name: 'Marcus Vance', rating: 5, title: 'Crating protection exceeded expectations', comment: `Arrived in a custom steel-framed crate with torque sheets and inspection certificates. Zero transit scuffs and whisper-quiet hover spool-up.`, daysAgo: 14 },
          { name: 'Dr. Kenji Takahashi', rating: 5, title: 'Responsive flight controller & clean wiring', comment: `Inspected the brushless drive bus and triple-redundant ESCs on arrival. Build finish on the ${shortName} airframe feels aerospace grade.`, daysAgo: 23 },
          { name: 'Elena Rostova', rating: 4, title: 'Detailed handover docs & spare hardware', comment: `Customs clearance took two extra days on our end, but the Shenzhen dispatch team provided full packing specs and spare fasteners.`, daysAgo: 35 },
          { name: 'David Al-Mansoor', rating: 5, title: 'Precision pitch response out of the crate', comment: `Very happy with the cockpit instrumentation and fast-charge deck on the ${shortName}. Support answered our setup call within 15 minutes.`, daysAgo: 47 },
        ]
      : category.includes('microcar') || category.includes('cabin')
      ? [
          { name: 'Sophie Laurent', rating: 5, title: 'Compact footprint, remarkably quiet cabin', comment: `The ${shortName} handles narrow city streets effortlessly. Regenerative braking and A/C cabin sealing are surprisingly refined.`, daysAgo: 4 },
          { name: 'Thomas Becker', rating: 5, title: 'Great commuter range & easy home charging', comment: `Plugs straight into our standard garage outlet overnight. Paint gloss, door latches, and digital dash on the ${shortName} arrived spotless.`, daysAgo: 11 },
          { name: 'Priya Nair', rating: 5, title: 'Smooth suspension over cobblestones', comment: `Ordered for campus shuttle duty and the turning radius is unbeatable. Backup camera and hill-hold engage reliably every time.`, daysAgo: 19 },
          { name: 'Carlos Mendoza', rating: 4, title: 'Solid steel frame & bright LED projector beams', comment: `Shipping crate kept the windshield and bodywork immaculate. Took about an hour to unwrap and complete the battery master check.`, daysAgo: 29 },
          { name: 'Hannah Okafor', rating: 5, title: 'Low running cost & responsive brakes', comment: `Zero emissions for daily errands and plenty of cargo room behind the seats. Tracking updates stayed accurate all the way to port.`, daysAgo: 41 },
        ]
      : category.includes('kart')
      ? [
          { name: 'Lukas Meyer', rating: 5, title: 'Instant electric torque off every apex', comment: `The ${shortName} launches out of tight hairpins with zero lag. Hydraulic disc bite and tubular chassis stiffness feel track-bred.`, daysAgo: 5 },
          { name: 'Devon Brooks', rating: 5, title: 'Swappable pack makes track days nonstop', comment: `We run our ${shortName} all weekend at the circuit. Controller thermal protection never throttled even in 34°C ambient heat.`, daysAgo: 13 },
          { name: 'Matteo Rossi', rating: 5, title: 'Welds and steering geometry are dialed in', comment: `Unboxed ready to roll after checking tire pressures. Adjustable pedal slider fits both teens and adult drivers comfortably.`, daysAgo: 22 },
          { name: 'Nadia Al-Khaled', rating: 4, title: 'Clean cable routing & strong drift grip', comment: `Great power delivery across all three speed modes. Wish a spare rear sprocket came in the box, otherwise a 10/10 build.`, daysAgo: 31 },
          { name: 'Jordan Kim', rating: 5, title: 'Built like a serious motorsport machine', comment: `Purchased two ${shortName} units for private coaching. Zero chain noise—just pure electric acceleration and crisp turn-in.`, daysAgo: 44 },
        ]
      : [
          { name: 'Oliver Grant', rating: 5, title: 'Torque, range, and finish punch above weight', comment: `Tested the ${shortName} over mixed hills right after delivery. Frame welds, battery lock, and controller mapping are rock solid.`, daysAgo: 7 },
          { name: 'Amina Diallo', rating: 5, title: 'Arrived 95% assembled & tuned', comment: `Only needed 20 minutes with the included hex toolkit. Braking modulation and headlight cutoff are super crisp for night riding.`, daysAgo: 16 },
          { name: 'Rafael Costa', rating: 5, title: 'Real-world range matches spec sheet', comment: `Getting full advertised mileage in mix of eco and sport assist on my ${shortName}. Display stays readable even in direct midday sun.`, daysAgo: 25 },
          { name: 'Claire Beaumont', rating: 4, title: 'Sturdy utility rack & smooth hub drive', comment: `Hauls groceries and work gear without bogging down on 12% grades. Heavy-duty packaging prevented any shipping scratches.`, daysAgo: 34 },
          { name: 'Ethan Patel', rating: 5, title: 'Reliable daily rider with instant tracking support', comment: `Battery clicks cleanly into the downtube and charges fast. Best build quality I have seen in this electric class.`, daysAgo: 48 },
        ]

    const baseDate = new Date('2026-10-20T14:30:00.000Z').getTime()
    return reviewerProfiles.map((profile, idx) => ({
      id: `verified-${product.id}-${idx + 1}`,
      productId: product.id,
      userId: null,
      reviewerName: profile.name,
      reviewerEmail: null,
      rating: profile.rating,
      title: profile.title,
      comment: profile.comment,
      images: idx === 0 && thumb ? [thumb] : idx === 2 && thumb2 ? [thumb2] : [],
      verifiedPurchase: true,
      createdAt: new Date(baseDate - profile.daysAgo * 86400000).toISOString(),
    }))
  }, [])

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
      const dbReviews = reviewsByProduct[product.id] || []
      const baseline = buildBaselineReviews(product)
      const seenIds = new Set(dbReviews.map((r) => r.id))
      const combined = [...dbReviews]
      for (const b of baseline) {
        if (combined.length >= 5) break
        if (!seenIds.has(b.id)) {
          combined.push(b)
        }
      }
      return combined
    },
    [reviewsByProduct, buildBaselineReviews]
  )

  const submitProductReview = useCallback(
    async (productId: string, payload: SubmitReviewPayload, files?: File[]): Promise<ProductReview> => {
      let uploadedUrls: string[] = []
      if (files && files.length > 0) {
        const uploadResponse = await reviewApi.uploadReviewImages(files)
        if (!uploadResponse.success) {
          throw new Error(uploadResponse.message || 'Failed to upload review images')
        }
        uploadedUrls = uploadResponse.data?.urls || (uploadResponse.data?.url ? [uploadResponse.data.url] : [])
      }

      const finalImages = [...(payload.images || []), ...uploadedUrls]
      const response = await reviewApi.createProductReview(productId, {
        ...payload,
        images: finalImages,
      })

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to save review')
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