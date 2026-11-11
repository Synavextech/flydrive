import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  ShoppingCart,
  Check,
  Star,
  Truck,
  ShieldCheck,
  Zap,
  ArrowRight,
  Filter,
  ShoppingBag,
  Plus,
  Minus,
  Camera,
  Upload,
  X,
  CheckCircle2,
  MessageSquare,
  ZoomIn,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { Product } from '../types'
import { useProducts } from '../contexts/ProductContext'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from '../components/AuthModal'
import { QuickCartDrawer } from '../components/QuickCartDrawer'

const CATEGORIES = [
  { id: 'all', label: 'All Rigs' },
  { id: 'mini-helicopter', label: 'MiniHeliCopters' },
  { id: 'microcars', label: 'Microcars' },
  { id: 'go karts', label: 'Go Karts' },
  { id: 'trikes', label: 'Trikes' },
  { id: 'dirtbikes', label: 'Dirtbikes' },
]

// Safe URL encoder for filenames with spaces and special characters
const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts.map((p, idx) => idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p))).join('/')
}

export const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { products, isLoading, error, fetchProducts, getReviewsForProduct, submitProductReview } = useProducts()
  const { addToCart, totalItems, totalPrice } = useCart()
  const { isAuthenticated, user } = useAuth()

  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [addedProductIds, setAddedProductIds] = useState<Record<string, boolean>>({})

  // Modals state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false)

  // Quick Review Composer & Photo Zoom Modal state
  const [reviewModalProduct, setReviewModalProduct] = useState<Product | null>(null)
  const [reviewName, setReviewName] = useState('')
  const [reviewEmail, setReviewEmail] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewFiles, setReviewFiles] = useState<File[]>([])
  const [reviewPreviewUrls, setReviewPreviewUrls] = useState<string[]>([])
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [reviewFeedback, setReviewFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [zoomedReviewImage, setZoomedReviewImage] = useState<string | null>(null)
  const [expandedReviewProductIds, setExpandedReviewProductIds] = useState<Record<string, boolean>>({})

  const toggleProductReviews = (productId: string) => {
    setExpandedReviewProductIds((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }))
  }

  const openReviewModal = (product: Product) => {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    setReviewModalProduct(product)
    setReviewName(fullName || '')
    setReviewEmail(user?.email || '')
    setReviewRating(5)
    setReviewTitle('')
    setReviewComment('')
    reviewPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
    setReviewFiles([])
    setReviewPreviewUrls([])
    setReviewFeedback(null)
  }

  const closeReviewModal = () => {
    reviewPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
    setReviewModalProduct(null)
    setReviewFiles([])
    setReviewPreviewUrls([])
    setReviewFeedback(null)
  }

  const handleReviewFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    const combinedFiles = [...reviewFiles, ...selected].slice(0, 4)
    reviewPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
    setReviewFiles(combinedFiles)
    setReviewPreviewUrls(combinedFiles.map((file) => URL.createObjectURL(file)))
    e.target.value = ''
  }

  const handleRemoveReviewFile = (index: number) => {
    const nextFiles = reviewFiles.filter((_, idx) => idx !== index)
    reviewPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
    setReviewFiles(nextFiles)
    setReviewPreviewUrls(nextFiles.map((file) => URL.createObjectURL(file)))
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewModalProduct) return
    if (!reviewName.trim() || !reviewComment.trim()) {
      setReviewFeedback({ type: 'error', text: 'Please provide your name and review comment.' })
      return
    }

    try {
      setIsSubmittingReview(true)
      setReviewFeedback(null)
      await submitProductReview(
        reviewModalProduct.id,
        {
          reviewerName: reviewName.trim(),
          reviewerEmail: reviewEmail.trim() || undefined,
          rating: reviewRating,
          title: reviewTitle.trim() || undefined,
          comment: reviewComment.trim(),
        },
        reviewFiles
      )
      setReviewFeedback({ type: 'success', text: 'Thank you! Your verified review & photos are now live.' })
      setTimeout(() => {
        closeReviewModal()
      }, 900)
    } catch (err: any) {
      setReviewFeedback({
        type: 'error',
        text: err?.message || 'Unable to submit review right now. Please try again.',
      })
    } finally {
      setIsSubmittingReview(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const catParam = params.get('category')
    if (catParam) {
      const normalized = catParam.toLowerCase()
      if (normalized.includes('heli')) {
        setSelectedCategory('mini-helicopter')
      } else {
        setSelectedCategory(normalized)
      }
    }
    if (location.hash === '#store-catalog' || catParam) {
      setTimeout(() => {
        const el = document.getElementById('store-catalog')
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' })
        }
      }, 150)
    }
  }, [location.search, location.hash])

  const formatPrice = (price: number) => {
    return `$${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const safeProducts = Array.isArray(products) ? products : []

  // Dynamic SEO Title, Meta Description & JSON-LD ItemList Structured Data for Listed Items
  useEffect(() => {
    const categoryMeta: Record<string, { title: string; desc: string }> = {
      'all': {
        title: 'DriveFlyElectric — Electric Microcars, MiniHeliCopters, Drift Trikes & Go Karts',
        desc: 'Browse the complete DriveFlyElectric catalog of personal MiniHeliCopters, enclosed Electric Microcars, 3000W Drift Trikes, Off-Road Go Karts, and Electric Dirt Bikes.'
      },
      'mini-helicopter': {
        title: 'MiniHeliCopters & Personal Ultralight Rotorcraft | DriveFlyElectric',
        desc: 'Shop personal single-seat ultralight MiniHeliCopters with carbon-fiber composite airframes, digital flight telemetry, and precision rotor systems at DriveFlyElectric.'
      },
      'microcars': {
        title: 'Electric Microcars & Utility Mini Jeeps | DriveFlyElectric',
        desc: 'Explore street-smart enclosed Electric Microcars and rugged 200cc adult Mini Jeep Willys editions with free express delivery from DriveFlyElectric.'
      },
      'go karts': {
        title: 'Off-Road Go Karts & High-Torque Racing Buggy Rigs | DriveFlyElectric',
        desc: 'Shop heavy-duty off-road Go Karts, racing drift buggies, and steel roll-cage electric karts at DriveFlyElectric.'
      },
      'trikes': {
        title: 'Electric Drift Trikes & 3-Wheel Performance Rigs | DriveFlyElectric',
        desc: 'High-torque brushless Electric Drift Trikes engineered for controlled power slides and track performance at DriveFlyElectric.'
      },
      'dirtbikes': {
        title: 'Electric Dirt Bikes & Off-Road Trail Moto Rigs | DriveFlyElectric',
        desc: 'Conquer any trail with high-discharge lithium Electric Dirt Bikes and inverted-fork off-road motorcycles from DriveFlyElectric.'
      }
    }

    const currentMeta = categoryMeta[selectedCategory] || categoryMeta['all']
    document.title = currentMeta.title

    const descEl = document.querySelector('meta[name="description"]')
    if (descEl) descEl.setAttribute('content', currentMeta.desc)

    const ogTitleEl = document.querySelector('meta[property="og:title"]')
    if (ogTitleEl) ogTitleEl.setAttribute('content', currentMeta.title)

    const ogDescEl = document.querySelector('meta[property="og:description"]')
    if (ogDescEl) ogDescEl.setAttribute('content', currentMeta.desc)

    // Inject JSON-LD ItemList for listed products
    const scriptId = 'dfe-catalog-jsonld'
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!scriptEl) {
      scriptEl = document.createElement('script')
      scriptEl.id = scriptId
      scriptEl.type = 'application/ld+json'
      document.head.appendChild(scriptEl)
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://driveflyelectric.shop'
    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: currentMeta.title,
      description: currentMeta.desc,
      numberOfItems: safeProducts.length,
      itemListElement: safeProducts.slice(0, 50).map((prod, index) => {
        const rawImg = prod.images && prod.images.length > 0 ? prod.images[0] : '/images/hero1.jpeg'
        const fullImg = rawImg.startsWith('http') ? rawImg : `${origin}${getSafeMediaUrl(rawImg)}`
        return {
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Product',
            name: prod.name,
            description: prod.description,
            sku: prod.sku,
            category: prod.category,
            image: fullImg,
            url: `${origin}/products/${prod.id}`,
            brand: {
              '@type': 'Brand',
              name: prod.brand || 'DriveFlyElectric'
            },
            offers: {
              '@type': 'Offer',
              url: `${origin}/products/${prod.id}`,
              priceCurrency: 'USD',
              price: Number(prod.price || 0).toFixed(2),
              availability: prod.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              itemCondition: 'https://schema.org/NewCondition'
            }
          }
        }
      })
    }

    scriptEl.textContent = JSON.stringify(itemListSchema)
  }, [selectedCategory, safeProducts])

  // Filter products by selected category or keyword
  const filteredProducts = selectedCategory === 'all'
    ? safeProducts
    : safeProducts.filter(p => {
      const cat = (p.category || '').toLowerCase()
      const name = (p.name || '').toLowerCase()
      const sel = selectedCategory.toLowerCase()

      if (sel === 'mini-helicopter' || sel === 'minihelicopters') {
        return cat.includes('heli') || cat.includes('rotor') || cat.includes('aircraft') || cat.includes('copter') ||
          name.includes('heli') || name.includes('rotor') || name.includes('aircraft') || name.includes('copter')
      }
      if (sel === 'microcars') {
        return cat.includes('microcar') || cat.includes('car') || cat.includes('jeep') ||
          name.includes('microcar') || name.includes('car') || name.includes('jeep') || name.includes('willys')
      }
      if (sel === 'go karts') {
        return cat.includes('kart') || cat.includes('buggy') ||
          name.includes('kart') || name.includes('buggy')
      }
      if (sel === 'trikes') {
        return cat.includes('trike') || (cat.includes('drift') && !cat.includes('kart')) ||
          name.includes('trike')
      }
      if (sel === 'dirtbikes' || sel === 'dirt bikes') {
        return cat.includes('dirt') || cat.includes('bike') || cat.includes('enduro') || cat.includes('motorcycle') ||
          name.includes('dirt') || name.includes('bike') || name.includes('enduro') || name.includes('motorcycle')
      }
      return cat.includes(sel) || name.includes(sel)
    })

  const handleQuantityChange = (productId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[productId] || 1
      const updated = Math.max(1, current + delta)
      return { ...prev, [productId]: updated }
    })
  }

  const handleAddToCart = (product: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const quantity = quantities[product.id] || 1
    addToCart(product, quantity)

    // Visual feedback
    setAddedProductIds(prev => ({ ...prev, [product.id]: true }))
    setTimeout(() => {
      setAddedProductIds(prev => ({ ...prev, [product.id]: false }))
    }, 1500)

    // Open quick cart drawer for instant review & checkout trigger
    setIsCartDrawerOpen(true)
  }

  const handleInstantCheckout = () => {
    if (totalItems === 0) return
    if (!isAuthenticated) {
      setIsAuthModalOpen(true)
    } else {
      navigate('/checkout')
    }
  }

  // Helper to extract or generate realistic specs like edrifttrikes.shop
  const getProductSpecs = (product: any) => {
    const name = product.name?.toLowerCase() || ''
    const cat = product.category?.toLowerCase() || ''
    if (cat.includes('heli') || name.includes('heli') || name.includes('copter') || name.includes('rotor')) {
      return { speed: '165 km/h', range: '240 km Flight', power: 'Dual Electric Turbine' }
    }
    if (name.includes('trike') || name.includes('drift')) {
      return { speed: '70 km/h', range: '60 km', power: '5000W' }
    }
    if (name.includes('kart') || name.includes('buggy')) {
      return { speed: '60 km/h', range: 'Up to 85 KM', power: '72V Dual' }
    }
    if (name.includes('bike')) {
      return { speed: '>80 km/h', range: '55 KM', power: '6000W' }
    }
    return { speed: 'High Torque', range: 'Pro-Grade', power: 'Li-Ion 72V' }
  }

  if (isLoading) {
    return (
      <div className="pt-28 min-h-screen flex items-center justify-center bg-[#131316] text-white">
        <div className="text-center p-8 bg-[#17171c] rounded-2xl shadow-2xl border border-white/10 max-w-sm w-full mx-4">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="w-16 h-16 rounded-full border-4 border-gray-800 border-t-creamy-500 animate-spin" />
            <ShoppingBag className="w-6 h-6 text-creamy-500 absolute inset-0 m-auto" />
          </div>
          <h3 className="font-anton text-2xl uppercase tracking-wider text-white mb-1">Loading Fleet</h3>
          <p className="text-xs text-gray-400">Fetching DriveFlyElectric inventory...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pt-28 min-h-screen bg-[#131316] flex items-center justify-center p-4 text-white">
        <div className="text-center max-w-md w-full bg-[#17171c] p-8 rounded-2xl border border-white/10">
          <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="font-anton text-2xl uppercase tracking-wider text-white mb-2">Unable to Load Fleet</h3>
          <p className="text-xs text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => fetchProducts()}
            className="w-full bg-creamy-500 hover:bg-creamy-400 text-black font-extrabold py-3 px-6 rounded-xl uppercase tracking-widest text-xs transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#131316] text-gray-900 dark:text-white selection:bg-creamy-500 selection:text-black transition-colors duration-200">
      {/* High-Impact Hero Section — Locally Hosted Files & Brand Tagline */}
      <header className="relative w-full h-[64vh] min-h-[480px] max-h-[740px] flex items-center overflow-hidden bg-black border-b border-gray-200 dark:border-white/10">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/hero1.jpeg"
            alt="DriveFlyElectric Fleet"
            className="w-full h-full object-cover opacity-60"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.src = '/images/hero2.jpeg'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/70" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl space-y-5 md:space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-creamy-500/20 border border-creamy-500/40 text-creamy-400 text-xs font-bold uppercase tracking-widest backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-creamy-400 animate-pulse" />
              Nanshan, Shenzhen, Guangdong Province, China
            </div>

            <h1 className="font-anton text-5xl sm:text-7xl lg:text-8xl text-white leading-none tracking-tight uppercase">
              DRIVEFLY<span className="text-creamy-500">ELECTRIC</span>
            </h1>

            <p className="text-base sm:text-lg text-gray-300 max-w-2xl border-l-4 border-creamy-500 pl-6 leading-relaxed font-medium">
              <span className="font-extrabold text-creamy-400 block text-sm sm:text-base uppercase tracking-wider mb-1">
                Electric Microcars, MiniHeliCopters & Performance Rides
              </span>
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="#store-catalog"
                onClick={() => setSelectedCategory('mini-helicopter')}
                className="bg-creamy-500 hover:bg-creamy-400 text-black px-6 py-3.5 font-extrabold text-xs uppercase tracking-widest rounded-lg active:scale-95 transition-all shadow-lg shadow-creamy-500/20"
              >
                Shop MiniHeliCopters
              </a>
              <a
                href="#store-catalog"
                onClick={() => setSelectedCategory('microcars')}
                className="border-2 border-white/30 text-white px-6 py-3.5 font-extrabold text-xs uppercase tracking-widest rounded-lg hover:border-creamy-500 hover:text-creamy-500 active:scale-95 transition-all"
              >
                Shop Microcars
              </a>
              <a
                href="#store-catalog"
                onClick={() => setSelectedCategory('go karts')}
                className="border-2 border-white/30 text-white px-6 py-3.5 font-extrabold text-xs uppercase tracking-widest rounded-lg hover:border-creamy-500 hover:text-creamy-500 active:scale-95 transition-all"
              >
                Shop Go Karts
              </a>
              <a
                href="#store-catalog"
                onClick={() => setSelectedCategory('trikes')}
                className="border-2 border-white/30 text-white px-6 py-3.5 font-extrabold text-xs uppercase tracking-widest rounded-lg hover:border-creamy-500 hover:text-creamy-500 active:scale-95 transition-all"
              >
                Shop Trikes
              </a>
              <a
                href="#store-catalog"
                onClick={() => setSelectedCategory('dirtbikes')}
                className="border-2 border-white/30 text-white px-6 py-3.5 font-extrabold text-xs uppercase tracking-widest rounded-lg hover:border-creamy-500 hover:text-creamy-500 active:scale-95 transition-all"
              >
                Shop Dirtbikes
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Trust & Guarantee */}
      <section className="bg-gray-100/80 dark:bg-[#0f0f12] border-b border-gray-200 dark:border-white/10 py-5 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center text-creamy-500 flex-shrink-0 shadow-sm">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">Free Express Shipping</h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">$0.00 Delivery on All Orders</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center text-blue-500 dark:text-blue-400 flex-shrink-0 shadow-sm">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">Credit & Debit Card</h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Data Encrypted with 256-bit SSL</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center text-creamy-500 dark:text-creamy-400 flex-shrink-0 shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">PayPal Protection</h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">One time payment for full coverage</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400 flex-shrink-0 shadow-sm">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">Factory Verified</h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">100% Authentic Shipping Company</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Section: "The Full Range" — Exact edrifttrikes.shop Layout */}
      <section id="store-catalog" className="pt-14 pb-24 bg-gray-50 dark:bg-[#0d0d10] text-gray-900 dark:text-white transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
            <div>
              <span className="font-bold text-xs text-creamy-500 uppercase tracking-widest">
                Shop Everything
              </span>
              <h2 className="font-anton text-4xl sm:text-5xl uppercase tracking-tight text-gray-900 dark:text-white mt-1">
                The Full Range
              </h2>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${selectedCategory === cat.id
                    ? 'bg-creamy-500 text-black shadow-lg shadow-creamy-500/20'
                    : 'bg-white dark:bg-[#17171c] text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-white/10 hover:border-creamy-500/40 shadow-sm'
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-[#17171c] rounded-2xl border border-gray-200 dark:border-white/10 p-12 text-center text-gray-600 dark:text-gray-400 shadow-sm">
              <ShoppingBag className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
              <h3 className="font-anton text-2xl uppercase tracking-wider text-gray-900 dark:text-white mb-1">No products found</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">No rigs matching "{selectedCategory}" in catalog.</p>
              <button
                onClick={() => setSelectedCategory('all')}
                className="bg-creamy-500 text-black font-extrabold px-6 py-2.5 rounded-lg text-xs uppercase tracking-wider hover:bg-creamy-400 transition-colors"
              >
                View Full Range
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
              {filteredProducts.map((product) => {
                const qty = quantities[product.id] || 1
                const isAdded = !!addedProductIds[product.id]
                const specs = getProductSpecs(product)

                return (
                  <div
                    key={product.id}
                    className="group bg-white dark:bg-[#17171c] border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden flex flex-col hover-lift hover:border-creamy-500 transition-all shadow-sm dark:shadow-md"
                  >
                    {/* Aspect-square image container with Cut-Corner Badge */}
                    <Link
                      to={`/product/${product.id}`}
                      className="relative block aspect-square overflow-hidden bg-gray-100 dark:bg-black"
                    >
                      {product.images && product.images.length > 0 ? (
                        <img
                          src={getSafeMediaUrl(product.images[0])}
                          alt={product.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            if (!target.src.endsWith('/images/hero2.jpeg')) {
                              target.src = '/images/hero2.jpeg'
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600 text-xs">
                          No Image
                        </div>
                      )}

                      {/* Cut-Corner SALE / NEW Badge matching edrifttrikes.shop */}
                      <span className="absolute top-2.5 left-2.5 cut-corner-badge font-extrabold text-[10px] uppercase tracking-widest px-3 py-1 bg-creamy-500 text-black shadow-md">
                        {product.isNew ? 'NEW' : 'SALE'}
                      </span>

                      {product.stock <= 5 && product.stock > 0 && (
                        <span className="absolute top-2.5 right-2.5 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-red-600 text-white rounded">
                          {product.stock} Left
                        </span>
                      )}
                    </Link>

                    {/* Card Body */}
                    <div className="p-3.5 sm:p-4 flex flex-col flex-1 text-gray-900 dark:text-white">
                      <Link to={`/product/${product.id}`}>
                        <h3 className="font-anton text-base sm:text-lg uppercase leading-tight line-clamp-2 hover:text-creamy-500 transition-colors text-gray-900 dark:text-white">
                          {product.name}
                        </h3>
                      </Link>

                      <p className="text-gray-500 dark:text-gray-400 text-xs mt-1 line-clamp-1">
                        {product.description || 'High-performance electric power with precision handling'}
                      </p>

                      {/* 2-Column Key Specifications with orange left border */}
                      <div className="grid grid-cols-2 gap-2 my-3 text-[10px] uppercase font-bold border-t border-b border-gray-100 dark:border-white/5 py-2">
                        <div className="border-l-2 border-creamy-500 pl-2">
                          <p className="text-gray-500 dark:text-gray-400 text-[9px] uppercase tracking-widest font-medium">Top Speed</p>
                          <p className="font-extrabold text-gray-900 dark:text-white">{specs.speed}</p>
                        </div>
                        <div className="border-l-2 border-creamy-500 pl-2">
                          <p className="text-gray-500 dark:text-gray-400 text-[9px] uppercase tracking-widest font-medium">Range</p>
                          <p className="font-extrabold text-gray-900 dark:text-white">{specs.range}</p>
                        </div>
                      </div>

                      {/* Pricing & Free Shipping Tag */}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <div>
                          <span className="text-creamy-500 font-anton text-lg sm:text-xl">
                            {formatPrice(product.price)}
                          </span>
                          {product.originalPrice && product.originalPrice > product.price && (
                            <span className="block text-[10px] text-gray-400 dark:text-gray-500 line-through">
                              {formatPrice(product.originalPrice)}
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-[9px] uppercase tracking-widest text-creamy-600 dark:text-creamy-400 bg-creamy-50 dark:bg-transparent border border-creamy-500/40 rounded px-2 py-0.5">
                          Free shipping
                        </span>
                      </div>

                      {/* Quantity Controls & Full-Width Add to Cart Button */}
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex items-center border border-gray-200 dark:border-white/10 rounded bg-gray-100 dark:bg-[#131316]">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(product.id, -1)}
                            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-gray-900 dark:text-white">{qty}</span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(product.id, 1)}
                            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleAddToCart(product, e)}
                          className={`flex-1 py-2 sm:py-2.5 font-extrabold text-[10px] sm:text-xs uppercase tracking-widest rounded transition-all active:scale-95 flex items-center justify-center gap-1.5 ${isAdded
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-900 text-white dark:bg-white dark:text-black hover:bg-creamy-500 hover:text-black dark:hover:bg-creamy-500 dark:hover:text-black'
                            }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>Add to Cart</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Customer Reviews Below Every Item Listing (Manual Toggle Only) */}
                    {(() => {
                      const visibleReviews = getReviewsForProduct(product).slice(0, 5)
                      const isReviewsExpanded = Boolean(expandedReviewProductIds[product.id])
                      const avgRating =
                        visibleReviews.length > 0
                          ? (
                              visibleReviews.reduce((acc, item) => acc + (Number(item.rating) || 5), 0) /
                              visibleReviews.length
                            ).toFixed(1)
                          : '5.0'

                      return (
                        <div className="border-t border-gray-200 dark:border-white/10 bg-gray-50/90 dark:bg-[#121216] p-2.5 sm:p-3 space-y-2 text-[10px]">
                          <div className="flex items-center justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleProductReviews(product.id)}
                              aria-expanded={isReviewsExpanded}
                              aria-controls={`card-reviews-${product.id}`}
                              className="flex items-center gap-1.5 min-w-0 text-left group/rev cursor-pointer"
                            >
                              <div className="flex items-center gap-0.5 text-[#58b970] flex-shrink-0">
                                {[1, 2, 3, 4, 5].map((starIdx) => (
                                  <Star key={starIdx} className="w-2.5 h-2.5 fill-[#58b970] text-[#58b970]" />
                                ))}
                              </div>
                              <span className="font-extrabold text-gray-900 dark:text-white flex-shrink-0">
                                {avgRating}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400 font-semibold group-hover/rev:text-creamy-600 dark:group-hover/rev:text-creamy-400 truncate transition-colors">
                                • {visibleReviews.length} Reviews
                              </span>
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-200/80 dark:bg-white/10 text-gray-700 dark:text-gray-200 group-hover/rev:bg-creamy-500 group-hover/rev:text-black font-bold text-[9px] uppercase tracking-wider transition-colors flex-shrink-0">
                                <span>{isReviewsExpanded ? 'Hide' : 'View'}</span>
                                {isReviewsExpanded ? (
                                  <ChevronUp className="w-2.5 h-2.5" />
                                ) : (
                                  <ChevronDown className="w-2.5 h-2.5" />
                                )}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openReviewModal(product)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#e1f6e5] dark:bg-[#255131]/60 text-[#2c623a] dark:text-[#9de0ab] hover:bg-[#58b970] hover:text-black font-bold uppercase tracking-wider text-[9px] transition-colors flex-shrink-0"
                            >
                              <Camera className="w-2.5 h-2.5" />
                              <span>+ Photo Review</span>
                            </button>
                          </div>

                          {isReviewsExpanded && (
                            <div
                              id={`card-reviews-${product.id}`}
                              aria-hidden={!isReviewsExpanded}
                              className="space-y-2 pt-1 border-t border-gray-200/70 dark:border-white/5"
                            >
                              <div className="space-y-1.5">
                                {visibleReviews.map((review) => (
                                  <div
                                    key={review.id}
                                    className="rounded-md bg-white dark:bg-[#191920] border border-gray-200/80 dark:border-white/5 px-2 py-1.5 space-y-1"
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="font-bold text-gray-900 dark:text-white truncate">
                                          {review.reviewerName}
                                        </span>
                                        {review.verifiedPurchase && (
                                          <CheckCircle2 className="w-2.5 h-2.5 text-[#58b970] flex-shrink-0" />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-0.5 flex-shrink-0">
                                        {[1, 2, 3, 4, 5].map((starVal) => (
                                          <Star
                                            key={starVal}
                                            className={`w-2 h-2 ${
                                              starVal <= (review.rating || 5)
                                                ? 'fill-[#58b970] text-[#58b970]'
                                                : 'text-gray-300 dark:text-gray-700'
                                            }`}
                                          />
                                        ))}
                                      </div>
                                    </div>

                                    <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-300 line-clamp-2">
                                      {review.comment}
                                    </p>

                                    {review.images && review.images.length > 0 && (
                                      <div className="flex items-center gap-1 pt-0.5">
                                        {review.images.slice(0, 3).map((imgUrl, imgIdx) => (
                                          <button
                                            key={imgIdx}
                                            type="button"
                                            onClick={() => setZoomedReviewImage(getSafeMediaUrl(imgUrl))}
                                            className="relative group/img w-8 h-8 rounded overflow-hidden border border-gray-200 dark:border-white/10 hover:border-[#58b970] transition-colors flex-shrink-0"
                                            title="Click to inspect customer photo"
                                          >
                                            <img
                                              src={getSafeMediaUrl(imgUrl)}
                                              alt={`Review photo by ${review.reviewerName}`}
                                              className="w-full h-full object-cover"
                                            />
                                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                              <ZoomIn className="w-3 h-3 text-white" />
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center justify-between pt-0.5 text-[9px] font-bold uppercase tracking-wider">
                                <button
                                  type="button"
                                  onClick={() => openReviewModal(product)}
                                  className="text-[#357c47] dark:text-[#76cf89] hover:underline flex items-center gap-1"
                                >
                                  <MessageSquare className="w-2.5 h-2.5" />
                                  <span>Write Review</span>
                                </button>
                                <Link
                                  to={`/product/${product.id}#reviews`}
                                  className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-0.5"
                                >
                                  <span>Full Gallery</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Footer Matching DriveFlyElectric */}
      <footer className="bg-gray-100 dark:bg-[#0b0b0e] border-t border-gray-200 dark:border-white/10 text-gray-900 dark:text-white pt-16 pb-28 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-gray-200 dark:border-white/10">
            {/* Col 1: Brand & Bio */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-creamy-500 flex items-center justify-center font-black text-black text-lg">
                  ⚡
                </div>
                <div className="flex flex-col">
                  <span className="font-anton text-xl text-creamy-500 tracking-wide leading-none">
                    DRIVEFLY<span className="text-gray-900 dark:text-white">ELECTRIC</span>
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-creamy-600 dark:text-creamy-400 font-bold">
                    electric microcars, minihelicopters & rides
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 pt-1 text-xs text-gray-600 dark:text-gray-400">
                <p className="text-gray-900 dark:text-white font-bold">🏢 Head Office:</p>

                <p>Building 6, Lecong Industrial Park</p>
                <p>Shunde District, Foshan, Guangdong 503315, China</p>
                <a
                  href="https://wa.me/19093088313?text=Hello!%20I%20would%20like%20some%20assistance%20regarding%20DriveFlyElectric."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-creamy-600 dark:text-creamy-400 font-semibold pt-1 block hover:underline"
                >
                  📞 WhatsApp / Call: +1 (909) 308-8313
                </a>
                <p className="text-creamy-600 dark:text-creamy-400 font-semibold">✉️ info-eurotopmobility@driveflyelectric.shop</p>
              </div>

              {/* Social Media Links */}
              <div className="pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2.5">
                  Follow Our Rides
                </p>
                <div className="flex items-center gap-2.5">
                  {/* Instagram */}
                  <a
                    href="https://www.instagram.com/midgetmicrocars?cplk=MXQxMjRoeWkxMGpycw=="
                    target="https://www.instagram.com/midgetmicrocars?cplk=MXQxMjRoeWkxMGpycw=="
                    rel="noopener noreferrer"
                    aria-label="Follow on Instagram"
                    title="Follow on Instagram"
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-[#17171c] border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-pink-500 hover:border-pink-500/50 hover:bg-pink-500/10 hover:scale-105 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                    </svg>
                  </a>

                  {/* Facebook */}
                  <a
                    href="https://facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Follow on Facebook"
                    title="Follow on Facebook"
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-[#17171c] border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-blue-500 hover:border-blue-500/50 hover:bg-blue-500/10 hover:scale-105 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </a>

                  {/* X (formerly Twitter) */}
                  <a
                    href="https://x.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Follow on X"
                    title="Follow on X"
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-[#17171c] border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-creamy-500 dark:hover:text-white hover:border-creamy-500/50 hover:bg-creamy-500/10 hover:scale-105 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>

                  {/* TikTok */}
                  <a
                    href="https://tiktok.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Follow on TikTok"
                    title="Follow on TikTok"
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-[#17171c] border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-cyan-400 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:scale-105 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01v8.83c0 1.9-.62 3.84-1.89 5.29-1.42 1.63-3.53 2.5-5.63 2.37-2.42-.12-4.68-1.47-5.83-3.6-1.28-2.34-1.13-5.38.38-7.56 1.45-2.12 3.95-3.32 6.47-3.15.11 1.48.05 2.97.05 4.46-.72-.05-1.48-.02-2.16.24-.87.32-1.55 1.05-1.83 1.93-.36 1.13-.12 2.44.64 3.32.74.88 1.93 1.29 3.07 1.11 1.14-.17 2.11-.98 2.52-2.06.24-.62.34-1.3.32-1.97V.02z" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Col 2: Fleet Links */}
            <div>
              <p className="font-bold text-xs text-creamy-500 uppercase tracking-widest mb-4">The Fleet</p>
              <ul className="space-y-2.5 text-xs text-gray-600 dark:text-gray-400 font-medium">
                <li><a href="#store-catalog" onClick={() => setSelectedCategory('mini-helicopter')} className="hover:text-creamy-500 dark:hover:text-white transition-colors">MiniHeliCopters & Rotorcraft</a></li>
                <li><a href="#store-catalog" onClick={() => setSelectedCategory('microcars')} className="hover:text-creamy-500 dark:hover:text-white transition-colors">Microcars & Mini Jeeps</a></li>
                <li><a href="#store-catalog" onClick={() => setSelectedCategory('go karts')} className="hover:text-creamy-500 dark:hover:text-white transition-colors">Racing Go Karts & Buggies</a></li>
                <li><a href="#store-catalog" onClick={() => setSelectedCategory('trikes')} className="hover:text-creamy-500 dark:hover:text-white transition-colors">Electric Drift Trikes</a></li>
                <li><a href="#store-catalog" onClick={() => setSelectedCategory('dirtbikes')} className="hover:text-creamy-500 dark:hover:text-white transition-colors">Dirtbikes & Enduro</a></li>
                <li><a href="#store-catalog" onClick={() => setSelectedCategory('all')} className="hover:text-creamy-500 dark:hover:text-white transition-colors">The Full Range Catalog</a></li>
              </ul>
            </div>

            {/* Col 3: Support & Security */}
            <div>
              <p className="font-bold text-xs text-creamy-500 uppercase tracking-widest mb-4">Support & Care</p>
              <ul className="space-y-2.5 text-xs text-gray-600 dark:text-gray-400 font-medium">
                <li><a href="#shipping" className="hover:text-creamy-500 dark:hover:text-white transition-colors">China Depot Express Dispatch</a></li>
                <li><a href="#payments" className="hover:text-creamy-500 dark:hover:text-white transition-colors">Card & PayPal Protection</a></li>
                <li><a href="#warranty" className="hover:text-creamy-500 dark:hover:text-white transition-colors">Factory Warranty & Guarantees</a></li>
                <li><Link to="/login" className="hover:text-creamy-500 dark:hover:text-white transition-colors">Customer Portal</Link></li>
              </ul>
            </div>

            {/* Col 4: Newsletter */}
            <div>
              <p className="font-bold text-xs text-creamy-500 uppercase tracking-widest mb-4">Stay in the Drift</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Get notified first when new limited builds, battery kits, and seasonal sales drop.
              </p>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="w-full bg-white dark:bg-[#17171c] border border-gray-300 dark:border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-creamy-500"
                />
                <button
                  type="submit"
                  className="w-full bg-creamy-500 hover:bg-creamy-400 text-black font-extrabold py-2.5 rounded-lg text-xs uppercase tracking-widest transition-all shadow-md shadow-creamy-500/20"
                >
                  Join VIP Dispatch
                </button>
              </form>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 dark:text-gray-400 gap-4">
            <p>© 2026 DriveFlyElectric (driveflyelectric.shop). All rights reserved. By management! All users should create an account to track order progress.</p>
            <div className="flex gap-6">
              <a href="#privacy" className="hover:text-creamy-500 dark:hover:text-gray-300">Privacy</a>
              <a href="#terms" className="hover:text-creamy-500 dark:hover:text-gray-300">Terms</a>
              <a href="#contact" className="hover:text-creamy-500 dark:hover:text-gray-300">China HQ Contact</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Bottom Quick-Checkout Bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-[#131316]/95 backdrop-blur-md border-t border-gray-200 dark:border-white/10 p-4 shadow-2xl z-40 text-gray-900 dark:text-white transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                onClick={() => setIsCartDrawerOpen(true)}
                className="w-12 h-12 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl flex items-center justify-center text-creamy-500 relative cursor-pointer hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                <ShoppingCart className="w-6 h-6" />
                <span className="absolute -top-1.5 -right-1.5 bg-creamy-500 text-black text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow">
                  {totalItems}
                </span>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">Your Cart ({totalItems} items)</p>
                <p className="font-anton text-xl text-creamy-500">{formatPrice(totalPrice)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCartDrawerOpen(true)}
                className="hidden sm:inline-flex px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/20 text-gray-700 dark:text-white font-extrabold text-xs uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                Review Items
              </button>
              <button
                onClick={handleInstantCheckout}
                className="bg-creamy-500 hover:bg-creamy-400 text-black font-extrabold py-3 px-6 sm:px-8 rounded-lg shadow-lg shadow-creamy-500/20 flex items-center gap-2 text-xs uppercase tracking-widest transition-all active:scale-95"
              >
                <span>{isAuthenticated ? 'Proceed to Checkout' : 'Quick Checkout'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Quick Review & Multi-Image Upload Modal */}
      {reviewModalProduct && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#17171c] border border-gray-200 dark:border-white/10 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-white/10 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#357c47] dark:text-[#76cf89]">
                  Verified Customer Review
                </p>
                <h3 className="font-anton text-xl uppercase tracking-wide text-gray-900 dark:text-white leading-tight">
                  {reviewModalProduct.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="p-1.5 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-[#58b970] hover:text-black transition-colors"
                aria-label="Close review modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Your Rating
                </label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((starValue) => (
                    <button
                      key={starValue}
                      type="button"
                      onClick={() => setReviewRating(starValue)}
                      className="p-1 rounded hover:scale-110 transition-transform"
                      aria-label={`Rate ${starValue} stars`}
                    >
                      <Star
                        className={`w-6 h-6 ${
                          starValue <= reviewRating
                            ? 'fill-[#58b970] text-[#58b970]'
                            : 'text-gray-300 dark:text-gray-600'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                    {reviewRating} / 5
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={reviewName}
                    onChange={(e) => setReviewName(e.target.value)}
                    placeholder="e.g. Alex Mercer"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-[#111115] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-[#58b970]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={reviewEmail}
                    onChange={(e) => setReviewEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-[#111115] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-[#58b970]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1">
                  Headline
                </label>
                <input
                  type="text"
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  placeholder="Highlight your delivery or performance experience"
                  className="w-full px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-[#111115] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-[#58b970]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1">
                  Detailed Review *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share build quality, range, delivery crating, or ride feedback..."
                  className="w-full px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-[#111115] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-[#58b970]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Upload Review Photos (Up to 4)
                </label>
                <label className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-[#58b970] bg-gray-50 dark:bg-[#111115] cursor-pointer transition-colors">
                  <Upload className="w-5 h-5 text-[#58b970]" />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    Click to attach delivery or riding photos
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    JPG, PNG, WEBP supported ({reviewFiles.length}/4 selected)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleReviewFileChange}
                    className="hidden"
                  />
                </label>

                {reviewPreviewUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {reviewPreviewUrls.map((previewUrl, idx) => (
                      <div
                        key={previewUrl}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10"
                      >
                        <img src={previewUrl} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveReviewFile(idx)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/75 text-white hover:bg-red-600"
                          aria-label="Remove image"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {reviewFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-bold ${
                    reviewFeedback.type === 'success'
                      ? 'bg-[#e1f6e5] text-[#255131] border border-[#76cf89]'
                      : 'bg-red-500/10 text-red-500 border border-red-500/30'
                  }`}
                >
                  {reviewFeedback.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={closeReviewModal}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-[#58b970] hover:bg-[#76cf89] text-black disabled:opacity-50 transition-colors"
                >
                  {isSubmittingReview ? 'Uploading & Saving...' : 'Publish Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Customer Review Photo Lightbox */}
      {zoomedReviewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomedReviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedReviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-[#58b970] hover:text-black text-white transition-colors"
            aria-label="Close zoomed image"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedReviewImage}
            alt="Customer review photo"
            className="max-h-[85vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Slide-Over Quick Cart Drawer */}
      <QuickCartDrawer
        isOpen={isCartDrawerOpen}
        onClose={() => setIsCartDrawerOpen(false)}
        onPromptAuth={() => {
          setIsCartDrawerOpen(false)
          setIsAuthModalOpen(true)
        }}
      />

      {/* Same-Page Prompted Sign-in / Register Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          navigate('/checkout')
        }}
        message="By management! All users should sign in or create an account to track order progress and checkout."
      />
    </div>
  )
}

export default HomePage