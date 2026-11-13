import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Star,
  Truck,
  ShoppingCart,
  Heart,
  ArrowLeft,
  ShieldCheck,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  Download,
  Check,
  Camera,
  Upload,
  CheckCircle2,
  MessageSquare,
  ZoomIn,
  CalendarClock,
  Sparkles
} from 'lucide-react'
import { useProducts } from '../contexts/ProductContext'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { analyticsApi } from '../services/api'
import { ShareProductButton } from '../components/ShareProductButton'
import { BookComingSoonModal } from '../components/BookComingSoonModal'
import { formatSupportPhone, getSupportWhatsAppDigits } from '../utils/receiptPdf'

// Safe URL encoder for filenames with spaces or special characters
const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts.map((p, idx) => idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p))).join('/')
}

const isVideoMedia = (url?: string) => {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.ogg')
}

export const ProductDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    currentProduct: rawProduct,
    fetchProductById,
    fetchProduct,
    products,
    isLoading,
    error,
    getReviewsForProduct,
    fetchProductReviews,
    submitProductReview
  } = useProducts()
  const { addToCart } = useCart()
  const { user } = useAuth()

  // Use matching product from memory immediately if available, preventing dark blank screen
  const currentProduct = rawProduct?.id === id ? rawProduct : (products?.find(p => p.id === id) || rawProduct)

  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [selectedVariant, setSelectedVariant] = useState<string>('BLACK')
  const [quantity, setQuantity] = useState(1)
  const [isSaved, setIsSaved] = useState(false)
  const [addedNotice, setAddedNotice] = useState(false)
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)

  // Media Lightbox Modal state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // Customer Reviews & Multi-Image Upload state
  const [reviewName, setReviewName] = useState('')
  const [reviewEmail, setReviewEmail] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewFiles, setReviewFiles] = useState<File[]>([])
  const [reviewPreviews, setReviewPreviews] = useState<string[]>([])
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [reviewFeedback, setReviewFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [zoomedReviewImage, setZoomedReviewImage] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
      if (fullName && !reviewName) setReviewName(fullName)
      if (user.email && !reviewEmail) setReviewEmail(user.email)
    }
  }, [user])

  useEffect(() => {
    if (id) {
      if (typeof fetchProductById === 'function') {
        fetchProductById(id)
      } else if (typeof fetchProduct === 'function') {
        fetchProduct(id)
      }
      if (typeof fetchProductReviews === 'function') {
        fetchProductReviews(id)
      }
    }
    // Reset selected image when navigating to new product
    setSelectedImageIndex(0)
    setShowAllReviews(false)
  }, [id, fetchProductById, fetchProduct, fetchProductReviews])

  useEffect(() => {
    if (currentProduct && typeof window !== 'undefined' && window.location.hash === '#reviews') {
      setTimeout(() => {
        const el = document.getElementById('reviews')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 150)
    }
  }, [currentProduct?.id])

  // Track checked / inspected product page view
  useEffect(() => {
    if (!currentProduct || currentProduct.id !== id || user?.role === 'ADMIN') return
    analyticsApi.trackProductView({
      productId: currentProduct.id,
      productName: currentProduct.name,
      productSku: currentProduct.sku,
      category: currentProduct.category,
      price: Number(currentProduct.price || 0),
      imageUrl: currentProduct.images?.[0] || null,
      source: 'PRODUCT_PAGE',
      path: location.pathname
    })
  }, [currentProduct?.id, id, user?.role, location.pathname])

  // Track booking modal check from product detail view
  useEffect(() => {
    if (!isBookingModalOpen || !currentProduct || user?.role === 'ADMIN') return
    analyticsApi.trackProductView({
      productId: currentProduct.id,
      productName: currentProduct.name,
      productSku: currentProduct.sku,
      category: currentProduct.category,
      price: Number(currentProduct.price || 0),
      imageUrl: currentProduct.images?.[0] || null,
      source: 'BOOKING_MODAL',
      path: location.pathname
    })
  }, [isBookingModalOpen, currentProduct?.id, user?.role, location.pathname])

  // Dynamic Product SEO Meta Tags & JSON-LD Product Structured Data
  useEffect(() => {
    if (!currentProduct) return

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://driveflyelectric.shop'
    const pageTitle = `${currentProduct.name} | ${currentProduct.category || 'Electric Rigs'} — DriveFlyElectric`
    const pageDesc = currentProduct.description
      ? `${currentProduct.description.slice(0, 155)} — Buy online at DriveFlyElectric ($${Number(currentProduct.price).toLocaleString()}).`
      : `Buy ${currentProduct.name} (${currentProduct.sku}) at DriveFlyElectric with free express shipping.`
    const rawPrimaryImage = currentProduct.images && currentProduct.images.length > 0 ? currentProduct.images[0] : '/images/hero1.jpeg'
    const fullImageUrl = rawPrimaryImage.startsWith('http') ? rawPrimaryImage : `${origin}${getSafeMediaUrl(rawPrimaryImage)}`
    const canonicalUrl = `${origin}/product/${currentProduct.id}`

    document.title = pageTitle

    const descEl = document.querySelector('meta[name="description"]')
    if (descEl) descEl.setAttribute('content', pageDesc)

    const ogTitleEl = document.querySelector('meta[property="og:title"]')
    if (ogTitleEl) ogTitleEl.setAttribute('content', pageTitle)

    const ogDescEl = document.querySelector('meta[property="og:description"]')
    if (ogDescEl) ogDescEl.setAttribute('content', pageDesc)

    const ogImageEl = document.querySelector('meta[property="og:image"]')
    if (ogImageEl) ogImageEl.setAttribute('content', fullImageUrl)

    const ogUrlEl = document.querySelector('meta[property="og:url"]')
    if (ogUrlEl) ogUrlEl.setAttribute('content', canonicalUrl)

    const canonicalLink = document.querySelector('link[rel="canonical"]')
    if (canonicalLink) canonicalLink.setAttribute('href', canonicalUrl)

    const scriptId = 'dfe-product-jsonld'
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!scriptEl) {
      scriptEl = document.createElement('script')
      scriptEl.id = scriptId
      scriptEl.type = 'application/ld+json'
      document.head.appendChild(scriptEl)
    }

    const reviewCountVal = Math.max(0, Number(currentProduct.reviews || 0))
    const productSchema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: currentProduct.name,
      description: currentProduct.description,
      sku: currentProduct.sku,
      category: currentProduct.category,
      image: (currentProduct.images || [rawPrimaryImage]).map(img =>
        img.startsWith('http') ? img : `${origin}${getSafeMediaUrl(img)}`
      ),
      brand: {
        '@type': 'Brand',
        name: currentProduct.brand || 'DriveFlyElectric'
      },
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: 'USD',
        price: Number(currentProduct.price || 0).toFixed(2),
        availability: currentProduct.isComingSoon
          ? 'https://schema.org/PreOrder'
          : currentProduct.stock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: {
          '@type': 'Organization',
          name: 'DriveFlyElectric'
        }
      }
    }
    if (reviewCountVal > 0 && Number(currentProduct.rating || 0) > 0) {
      productSchema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: String(currentProduct.rating),
        reviewCount: String(reviewCountVal)
      }
    }

    scriptEl.textContent = JSON.stringify(productSchema)

    return () => {
      const existing = document.getElementById(scriptId)
      if (existing) existing.remove()
    }
  }, [currentProduct])

  // Extract color variants
  const colorOptions = currentProduct?.variants && currentProduct.variants.length > 0
    ? currentProduct.variants.map(v => v.value || v.name)
    : ['BLACK', 'RED', 'BLUE']

  const mediaList = (currentProduct?.images && currentProduct.images.length > 0)
    ? currentProduct.images
    : ['/images/hero1.jpeg']

  // Handle keyboard navigation for Lightbox
  useEffect(() => {
    if (!isLightboxOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLightboxOpen(false)
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev + 1) % mediaList.length)
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen, mediaList.length])

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setIsLightboxOpen(true)
  }

  const trackDetailCartCheck = () => {
    if (!currentProduct || user?.role === 'ADMIN') return
    analyticsApi.trackProductView({
      productId: currentProduct.id,
      productName: currentProduct.name,
      productSku: currentProduct.sku,
      category: currentProduct.category,
      price: Number(currentProduct.price || 0),
      imageUrl: currentProduct.images?.[0] || null,
      source: 'CART_ADD',
      path: location.pathname
    })
  }

  const handleAddToCart = () => {
    if (currentProduct) {
      addToCart(currentProduct, quantity)
      trackDetailCartCheck()
      setAddedNotice(true)
      setTimeout(() => setAddedNotice(false), 2500)
    }
  }

  const handleBuyNow = () => {
    if (currentProduct) {
      addToCart(currentProduct, quantity)
      trackDetailCartCheck()
      navigate('/checkout')
    }
  }

  const handleDownloadSpecs = () => {
    if (!currentProduct) return
    const supportPhone = formatSupportPhone()
    const whatsAppDigits = getSupportWhatsAppDigits()
    const specSheet = `DRIVEFLYELECTRIC — OFFICIAL SPECIFICATION SHEET
======================================================
Product: ${currentProduct.name}
Category: ${currentProduct.category}
SKU: ${currentProduct.sku}
Price: $${currentProduct.price}
Selected Color: ${selectedVariant}
Warranty: 1 Year Manufacturer Warranty Included
Dispatch: Austin, Texas HQ • Worldwide Express Fulfillment

OVERVIEW:
${currentProduct.description || 'Precision engineered electric ride & aircraft built for performance, reliability, and extreme adventure.'}

KEY TECHNICAL SPECIFICATIONS:
- Motor & Drive: High-Torque Performance Propulsion System
- Frame: High-Tensile Steel & Reinforced Aerospace/Motorsport Chassis
- Braking: Precision Hydraulic Disc Brake System
- Suspension: Heavy Duty Front & Rear Shock Absorbers
- Delivery Time: ${currentProduct.averageDeliveryTime || '12-20 days standard express'}
- Guarantee: 100% Factory Verified & Authenticity Guaranteed

Official Website: https://driveflyelectric.shop
Customer Support: info-eurotopmobility@driveflyelectric.shop
WhatsApp Support: ${supportPhone} (https://wa.me/${whatsAppDigits})
======================================================`
    const blob = new Blob([specSheet], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${currentProduct.name.replace(/[^a-zA-Z0-9]/g, '_')}_Specifications.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Format price in USD
  const formatPrice = (price: number) => {
    return `$${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }

  // Helper function to render stars
  const renderStars = (rating: number) => {
    const stars = []
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 !== 0

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Star key={i} className="w-4 h-4 fill-creamy-400 text-creamy-400" />
      )
    }

    if (hasHalfStar) {
      stars.push(
        <Star key="half" className="w-4 h-4 fill-creamy-400/50 text-creamy-400" />
      )
    }

    const emptyStars = 5 - Math.ceil(rating)
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <Star key={`empty-${i}`} className="w-4 h-4 text-gray-300 dark:text-neutral-700" />
      )
    }

    return stars
  }

  // Tagline based on product details
  const getProductTagline = () => {
    if (!currentProduct) return ''
    const lower = (currentProduct.name + ' ' + currentProduct.category).toLowerCase()
    if (lower.includes('heli') || lower.includes('copter') || lower.includes('rotor')) {
      return 'Aerospace-grade personal ultralight rotorcraft engineered for precision vertical flight'
    }
    if (lower.includes('dirt') || lower.includes('motorcycle') || lower.includes('enduro')) {
      return 'Powerful electric performance built for off-road adventure'
    }
    if (lower.includes('trike') || lower.includes('drift')) {
      return 'Engineered for lateral freedom and high-torque drift thrills'
    }
    if (lower.includes('kart') || lower.includes('buggy')) {
      return 'Track-ready acceleration and precision handling on all terrains'
    }
    return 'Premium high-performance electric ride built for adventure'
  }

  if (!currentProduct) {
    if (isLoading) {
      return (
        <div className="pt-24 min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-creamy-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400 font-bold text-sm">Loading product details...</p>
          </div>
        </div>
      )
    }

    return (
      <div className="pt-24 min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
        <div className="text-center p-8 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl max-w-md">
          <p className="text-red-500 font-bold mb-4">{error || 'Product not found'}</p>
          <button
            onClick={() => navigate('/#store-catalog')}
            className="inline-flex items-center gap-2 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider px-5 py-2.5 rounded-xl text-xs transition-transform active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Products
          </button>
        </div>
      </div>
    )
  }

  const activeMedia = mediaList[selectedImageIndex] || mediaList[0]
  const currentLightboxMedia = mediaList[lightboxIndex] || mediaList[0]

  return (
    <div className="pt-20 pb-20 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">

        {/* Top Back Navigation Bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/#store-catalog')}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-600 dark:text-gray-300 hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-creamy-500" />
            <span>Back to Product Listing</span>
          </button>

          {/* Added to cart toast notice */}
          {addedNotice && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-full animate-fadeIn">
              <Check className="w-3.5 h-3.5" />
              <span>Added to your cart!</span>
            </div>
          )}
        </div>

        {/* Main Product Showcase Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

          {/* LEFT COLUMN: Media Showcase */}
          <div className="lg:col-span-6 space-y-4">

            {/* Primary Main Image / Video Viewport */}
            <div
              onClick={() => openLightbox(selectedImageIndex)}
              className="group relative aspect-[4/3] bg-white dark:bg-[#15171d] border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-2xl cursor-pointer flex items-center justify-center"
            >
              {isVideoMedia(activeMedia) ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <video
                    src={getSafeMediaUrl(activeMedia)}
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                  />
                </div>
              ) : (
                <img
                  src={getSafeMediaUrl(activeMedia)}
                  alt={currentProduct.name}
                  className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    if (!target.src.endsWith('/images/hero1.jpeg')) {
                      target.src = '/images/hero1.jpeg'
                    }
                  }}
                />
              )}

              {/* Slide Counter Overlay Badge (e.g. 1 / 6) */}
              <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md text-white text-[11px] font-black px-2.5 py-1 rounded-md border border-white/15 tracking-widest shadow-md">
                {selectedImageIndex + 1} / {mediaList.length}
              </div>

              {/* Enlarge Hint overlay */}
              <div className="absolute top-3 right-3 bg-black/60 hover:bg-creamy-500 hover:text-black text-white backdrop-blur-md p-2 rounded-xl transition-all shadow-md">
                <Maximize2 className="w-4 h-4" />
              </div>
            </div>

            {/* Horizontal Thumbnails Strip matching reference screenshot */}
            {mediaList.length > 1 && (
              <div className="grid grid-cols-6 gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {mediaList.map((media, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`relative aspect-square bg-white dark:bg-[#15171d] rounded-lg border-2 overflow-hidden transition-all ${selectedImageIndex === index
                      ? 'border-creamy-500 dark:border-creamy-400 ring-2 ring-creamy-500/20 shadow-md scale-[1.02]'
                      : 'border-gray-200 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/30 opacity-75 hover:opacity-100'
                      }`}
                  >
                    {isVideoMedia(media) ? (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-creamy-500">
                        <Play className="w-5 h-5 fill-creamy-500" />
                      </div>
                    ) : (
                      <img
                        src={getSafeMediaUrl(media)}
                        alt={`${currentProduct.name} thumb ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          if (!target.src.endsWith('/images/hero1.jpeg')) {
                            target.src = '/images/hero1.jpeg'
                          }
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Product Information & Action Panel */}
          <div className="lg:col-span-6 space-y-6">

            {/* Tagline with vertical accent bar */}
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 flex-wrap">
              <span className="w-1 h-5 bg-creamy-500 dark:bg-creamy-400 rounded-full inline-block flex-shrink-0"></span>
              <span className="font-semibold">{getProductTagline()}</span>
              {currentProduct.isComingSoon && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest">
                  <Sparkles className="w-3 h-3" />
                  <span>Coming Soon {currentProduct.comingSoonRelease ? `• ${currentProduct.comingSoonRelease}` : ''}</span>
                </span>
              )}
            </div>

            {/* Product Title */}
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight text-gray-900 dark:text-white font-anton leading-none">
                {currentProduct.name}
              </h1>
              <p className="text-[11px] font-bold text-gray-400 dark:text-neutral-500 mt-2 uppercase tracking-wider">
                SKU: <span className="font-mono text-gray-600 dark:text-gray-300">{currentProduct.sku}</span> {currentProduct.brand && `• ${currentProduct.brand}`}
              </p>
            </div>

            {/* Rating Stars */}
            {(() => {
              const allReviews = getReviewsForProduct(currentProduct)
              const reviewCount = Math.max(currentProduct.reviews || 0, allReviews.length)
              const avgRating =
                allReviews.length > 0
                  ? allReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / allReviews.length
                  : Number(currentProduct.rating || 0)

              return (
                <a
                  href="#reviews"
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="inline-flex items-center gap-2.5 group"
                >
                  <div className="flex items-center gap-0.5">
                    {renderStars(avgRating > 0 ? avgRating : 0)}
                  </div>
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 group-hover:text-creamy-500 transition-colors">
                    {reviewCount > 0 ? `${avgRating.toFixed(1)} (${reviewCount} verified reviews)` : 'Be the first to review'}
                  </span>
                </a>
              )
            })()}

            {/* Huge Price Display matching screenshot */}
            <div className="flex items-baseline gap-4 pt-1">
              <div className="text-4xl sm:text-5xl font-black text-creamy-500 dark:text-creamy-400 font-anton tracking-tight">
                {formatPrice(currentProduct.price)}
              </div>
              {currentProduct.originalPrice && currentProduct.originalPrice > currentProduct.price && (
                <span className="text-base sm:text-lg font-bold text-gray-400 line-through">
                  {formatPrice(currentProduct.originalPrice)}
                </span>
              )}
            </div>

            {/* Shipping Info Line matching reference screenshot */}
            <div className="border-t border-b border-gray-200 dark:border-white/10 py-3.5 space-y-1.5 text-xs">
              <div className="font-bold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                <span className="uppercase text-gray-500 dark:text-gray-400 font-extrabold tracking-wider">SHIPPING:</span>
                <span className="line-through text-gray-400">$220</span>
                <span className="text-creamy-500 dark:text-creamy-400 font-black uppercase">FREE</span>
                <span>• delivery in {currentProduct.averageDeliveryTime || '12–20 days'}</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                Distant destinations add up to 7 days — checkout shows the exact window for your address before you pay.
              </p>
            </div>

            {/* Colour Selector matching reference screenshot */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-800 dark:text-gray-200">
                <span className="text-gray-500 dark:text-gray-400">Colour: </span>
                <span className="font-extrabold uppercase">{selectedVariant}</span>
              </div>
              <div className="flex items-center gap-2.5">
                {colorOptions.map((col) => (
                  <button
                    key={col}
                    onClick={() => setSelectedVariant(col)}
                    className={`px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider border-2 transition-all ${selectedVariant.toLowerCase() === col.toLowerCase()
                      ? 'bg-neutral-900 text-white border-creamy-500 dark:border-creamy-400 shadow-md ring-1 ring-creamy-400/30'
                      : 'bg-white dark:bg-[#1a1d24] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/30'
                      }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity Selector (hidden for Coming Soon pre-book items) */}
            {!currentProduct.isComingSoon && (
              <div className="flex items-center gap-4 pt-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Quantity:
                </span>
                <div className="flex items-center border border-gray-300 dark:border-white/15 rounded-xl overflow-hidden bg-white dark:bg-[#16181e]">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3 py-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 font-bold transition-colors"
                  >
                    -
                  </button>
                  <span className="px-4 py-1.5 text-xs font-black min-w-[2.5rem] text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="px-3 py-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons Row: BOOK NOW (for Coming Soon) OR BUY NOW + ADD TO CART, plus SAVE & SHARE */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch gap-3 pt-2">
              {currentProduct.isComingSoon ? (
                <button
                  onClick={() => setIsBookingModalOpen(true)}
                  className="flex-1 min-w-[200px] bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider py-4 px-6 rounded-xl shadow-lg shadow-creamy-500/20 transition-all text-xs sm:text-sm text-center flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <CalendarClock className="w-4 h-4" />
                  <span>Book Now — Reserve Priority Slot</span>
                </button>
              ) : (
                <>
                  {/* BUY NOW (Creamy green filled) */}
                  <button
                    onClick={handleBuyNow}
                    disabled={currentProduct.stock <= 0}
                    className="flex-1 min-w-[140px] bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider py-4 px-6 rounded-xl shadow-lg shadow-creamy-500/20 disabled:cursor-not-allowed transition-all text-xs sm:text-sm text-center flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <span>Buy Now</span>
                  </button>

                  {/* ADD TO CART (Dark bordered button) */}
                  <button
                    onClick={handleAddToCart}
                    disabled={currentProduct.stock <= 0}
                    className="flex-1 min-w-[140px] bg-white hover:bg-gray-100 dark:bg-[#16181e] dark:hover:bg-[#1f222a] border border-gray-300 dark:border-white/20 text-gray-900 dark:text-white font-black uppercase tracking-wider py-4 px-6 rounded-xl shadow-md disabled:cursor-not-allowed transition-all text-xs sm:text-sm text-center flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <ShoppingCart className="w-4 h-4 text-creamy-500" />
                    <span>Add to Cart</span>
                  </button>
                </>
              )}

              <div className="flex items-stretch gap-2.5">
                {/* SAVE / WISHLIST button */}
                <button
                  onClick={() => setIsSaved(!isSaved)}
                  className={`flex-1 sm:flex-none px-5 py-4 rounded-xl border font-black uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 transition-all ${isSaved
                    ? 'bg-red-500/10 border-red-500 text-red-500 shadow-md'
                    : 'bg-white dark:bg-[#16181e] border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-red-400 hover:text-red-400'
                    }`}
                  title="Save to favorites"
                >
                  <Heart className={`w-4 h-4 ${isSaved ? 'fill-red-500 text-red-500' : ''}`} />
                  <span>Save</span>
                </button>

                {/* SHARE LINK / SOCIAL button */}
                <ShareProductButton product={currentProduct} variant="detail" className="flex-1 sm:flex-none" />
              </div>
            </div>

            {/* Download Product Information Card matching reference screenshot */}
            <div
              onClick={handleDownloadSpecs}
              className="group cursor-pointer bg-white dark:bg-[#16181e] border border-gray-200 dark:border-white/10 hover:border-creamy-500/50 dark:hover:border-creamy-400/50 rounded-xl p-4 flex items-center gap-3.5 transition-all shadow-sm hover:shadow-md"
            >
              <div className="w-10 h-10 rounded-lg bg-creamy-500/10 border border-creamy-500/20 flex items-center justify-center text-creamy-600 dark:text-creamy-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white group-hover:text-creamy-500 dark:group-hover:text-creamy-400 transition-colors">
                  Download Product Information
                </h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Full specification sheet, colour options &amp; delivery details (.txt)
                </p>
              </div>
            </div>

            {/* Narrative Overview & Detailed Description matching reference screenshot */}
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-white/10 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-normal">
              <p>
                {currentProduct.description ||
                  `The ${currentProduct.name} is engineered for riders seeking powerful electric performance, responsive handling, and all-terrain capability. Equipped with high-torque motor power and a high-capacity lithium battery, this vehicle delivers extreme acceleration and agile control for both off-road trails and outdoor tracks.`}
              </p>
              <p>
                Built around a heavy-duty reinforced chassis design, it combines traction, stability, and lateral maneuverability across varied riding conditions. The precision hydraulic suspension absorbs harsh impacts from uneven terrain, while precision disc brakes ensure maximum stopping authority at all speeds.
              </p>
              <p>
                A high-efficiency drivetrain transfers power instantly to the drive wheels, while generous load capacity accommodates riders comfortably. The fast-charging lithium battery is engineered for quick turnaround and consistent voltage output across each charge cycle.
              </p>
            </div>

            {/* Key Technical Specifications Table */}
            <div className="pt-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
                Key Technical Specifications
              </h3>
              {(() => {
                const isHeli = (currentProduct.category + ' ' + currentProduct.name).toLowerCase().includes('heli')
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-3 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-white/10 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">{isHeli ? 'Cruise Speed' : 'Top Speed'}</span>
                      <span className="font-extrabold text-gray-900 dark:text-white mt-0.5 block">{isHeli ? '145–165 km/h' : '45–65 km/h'}</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-white/10 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">{isHeli ? 'Flight Range' : 'Range / Charge'}</span>
                      <span className="font-extrabold text-gray-900 dark:text-white mt-0.5 block">{isHeli ? '210–240 km' : '60–100 km'}</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-white/10 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">{isHeli ? 'Endurance' : 'Charge Time'}</span>
                      <span className="font-extrabold text-gray-900 dark:text-white mt-0.5 block">{isHeli ? '2.5 hrs Flight' : '3–4 hours'}</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-white/10 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Max Payload</span>
                      <span className="font-extrabold text-gray-900 dark:text-white mt-0.5 block">{isHeli ? '240 kg (Dual/Solo)' : '180–220 kg'}</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-white/10 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">{isHeli ? 'Avionics & Safety' : 'Brakes'}</span>
                      <span className="font-extrabold text-gray-900 dark:text-white mt-0.5 block">{isHeli ? 'Auto-Hover + Parachute' : 'Hydraulic Disc'}</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-white/10 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Availability</span>
                      <span
                        className={`font-extrabold mt-0.5 block ${
                          currentProduct.isComingSoon
                            ? 'text-amber-500'
                            : currentProduct.stock > 0
                            ? 'text-emerald-500'
                            : 'text-red-500'
                        }`}
                      >
                        {currentProduct.isComingSoon
                          ? `Coming Soon (${currentProduct.comingSoonRelease || 'Pre-Book'})`
                          : currentProduct.stock > 0
                          ? `In Stock (${currentProduct.stock})`
                          : 'Pre-order'}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Buyer Trust & Guarantees Footer */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 dark:border-white/10 text-[11px] font-bold text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>100% Factory Verified & Tested</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-creamy-500 flex-shrink-0" />
                <span>Worldwide Express Freight Dispatch</span>
              </div>
            </div>

          </div>
        </div>

        {/* CUSTOMER REVIEWS & MULTI-IMAGE UPLOAD SECTION */}
        {(() => {
          const allReviews = getReviewsForProduct(currentProduct)
          const visibleReviews = showAllReviews ? allReviews : allReviews.slice(0, 5)
          const totalReviewCount = Math.max(currentProduct.reviews || 0, allReviews.length)
          const avgRating =
            allReviews.length > 0
              ? (
                  allReviews.reduce((acc, item) => acc + (Number(item.rating) || 0), 0) /
                  allReviews.length
                ).toFixed(1)
              : Number(currentProduct.rating || 0) > 0
              ? Number(currentProduct.rating).toFixed(1)
              : '—'

          const handlePhotoSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
            const picked = Array.from(e.target.files || [])
            if (picked.length === 0) return
            const nextFiles = [...reviewFiles, ...picked].slice(0, 4)
            reviewPreviews.forEach((url) => URL.revokeObjectURL(url))
            setReviewFiles(nextFiles)
            setReviewPreviews(nextFiles.map((file) => URL.createObjectURL(file)))
            e.target.value = ''
          }

          const removePickedPhoto = (idx: number) => {
            const nextFiles = reviewFiles.filter((_, index) => index !== idx)
            reviewPreviews.forEach((url) => URL.revokeObjectURL(url))
            setReviewFiles(nextFiles)
            setReviewPreviews(nextFiles.map((file) => URL.createObjectURL(file)))
          }

          const handleDetailReviewSubmit = async (e: React.FormEvent) => {
            e.preventDefault()
            if (!reviewName.trim() || !reviewComment.trim()) {
              setReviewFeedback({ type: 'error', text: 'Please enter your name and review feedback.' })
              return
            }

            try {
              setIsSubmittingReview(true)
              setReviewFeedback(null)
              await submitProductReview(
                currentProduct.id,
                {
                  reviewerName: reviewName.trim(),
                  reviewerEmail: reviewEmail.trim() || undefined,
                  rating: reviewRating,
                  title: reviewTitle.trim() || undefined,
                  comment: reviewComment.trim(),
                },
                reviewFiles
              )
              setReviewTitle('')
              setReviewComment('')
              reviewPreviews.forEach((url) => URL.revokeObjectURL(url))
              setReviewFiles([])
              setReviewPreviews([])
              setReviewRating(5)
              setReviewFeedback({
                type: 'success',
                text: 'Your verified customer review and photos have been published below.',
              })
            } catch (err: any) {
              setReviewFeedback({
                type: 'error',
                text: err?.message || 'Unable to submit review right now. Please try again.',
              })
            } finally {
              setIsSubmittingReview(false)
            }
          }

          return (
            <section
              id="reviews"
              className="mt-12 pt-10 border-t border-gray-200 dark:border-white/10 space-y-8"
            >
              {/* Reviews Header Banner */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-[#357c47] dark:text-[#76cf89]">
                    Verified Owner Feedback
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-anton uppercase tracking-tight text-gray-900 dark:text-white mt-1">
                    Customer Reviews &amp; Delivery Photos
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Verified owner feedback &amp; delivery gallery for {currentProduct.name}. Upload your own delivery or action photos below.
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-white dark:bg-[#17171c] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 shadow-sm">
                  <div className="text-center pr-4 border-r border-gray-200 dark:border-white/10">
                    <p className="font-anton text-3xl text-[#357c47] dark:text-[#76cf89] leading-none">
                      {avgRating}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">
                      Out of 5.0
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-0.5 text-[#58b970]">
                      {[1, 2, 3, 4, 5].map((starIdx) => (
                        <Star key={starIdx} className="w-4 h-4 fill-[#58b970] text-[#58b970]" />
                      ))}
                    </div>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mt-1">
                      {totalReviewCount} Verified Owner Reviews
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Interactive Review & Multi-Image Upload Form */}
                <div className="lg:col-span-5 bg-white dark:bg-[#17171c] border border-gray-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-200 dark:border-white/10">
                    <Camera className="w-4 h-4 text-[#58b970]" />
                    <h3 className="font-anton text-lg uppercase tracking-wide text-gray-900 dark:text-white">
                      Write a Review With Photos
                    </h3>
                  </div>

                  <form onSubmit={handleDetailReviewSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                        Rating *
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((starValue) => (
                          <button
                            key={starValue}
                            type="button"
                            onClick={() => setReviewRating(starValue)}
                            className="p-1 rounded hover:scale-110 transition-transform"
                            aria-label={`Rate ${starValue} out of 5 stars`}
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
                          {reviewRating} / 5 Stars
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
                          placeholder="Full Name"
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
                        Review Headline
                      </label>
                      <input
                        type="text"
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        placeholder="Summarize your build quality or ride experience"
                        className="w-full px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-[#111115] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-[#58b970]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1">
                        Review Details *
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Tell other buyers about crating quality, assembly, performance, and range..."
                        className="w-full px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-[#111115] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-[#58b970]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                        Attach Photos (Up to 4 Images)
                      </label>
                      <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-[#58b970] bg-gray-50 dark:bg-[#111115] cursor-pointer transition-colors">
                        <Upload className="w-5 h-5 text-[#58b970]" />
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                          Click to upload unboxing or riding photos
                        </span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          JPG, PNG, WEBP, GIF ({reviewFiles.length}/4 uploaded)
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handlePhotoSelection}
                          className="hidden"
                        />
                      </label>

                      {reviewPreviews.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {reviewPreviews.map((url, idx) => (
                            <div
                              key={url}
                              className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10"
                            >
                              <img src={url} alt={`Selected upload ${idx + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removePickedPhoto(idx)}
                                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/75 text-white hover:bg-red-600"
                                aria-label="Remove selected photo"
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
                        className={`p-3 rounded-lg text-xs font-bold ${
                          reviewFeedback.type === 'success'
                            ? 'bg-[#e1f6e5] text-[#255131] border border-[#76cf89]'
                            : 'bg-red-500/10 text-red-500 border border-red-500/30'
                        }`}
                      >
                        {reviewFeedback.text}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmittingReview}
                      className="w-full py-3 rounded-xl bg-[#58b970] hover:bg-[#76cf89] text-black font-black uppercase tracking-widest text-xs transition-colors disabled:opacity-50"
                    >
                      {isSubmittingReview ? 'Uploading Photos & Publishing...' : 'Submit Verified Review'}
                    </button>
                  </form>
                </div>

                {/* Right Column: Constantly Visible 5+ Customer Reviews */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-anton text-lg uppercase tracking-wide text-gray-900 dark:text-white flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#58b970]" />
                      <span>Recent Customer Reviews ({visibleReviews.length})</span>
                    </h3>
                    {allReviews.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllReviews((prev) => !prev)}
                        className="text-xs font-bold text-[#357c47] dark:text-[#76cf89] hover:underline"
                      >
                        {showAllReviews ? 'Show Top 5 Reviews' : `Show All ${allReviews.length} Reviews`}
                      </button>
                    )}
                  </div>

                  <div className="space-y-3.5">
                    {visibleReviews.length === 0 ? (
                      <div className="bg-white dark:bg-[#17171c] border border-gray-200 dark:border-white/10 rounded-2xl p-6 text-center space-y-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">No Customer Reviews Yet</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Purchased this model? Share your unboxing, range, or riding photos using the review form.
                        </p>
                      </div>
                    ) : visibleReviews.map((review) => (
                      <article
                        key={review.id}
                        className="bg-white dark:bg-[#17171c] border border-gray-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-sm space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#e1f6e5] dark:bg-[#255131]/70 text-[#255131] dark:text-[#9de0ab] font-black text-xs flex items-center justify-center uppercase">
                              {(review.reviewerName || 'U').slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-extrabold text-gray-900 dark:text-white">
                                  {review.reviewerName}
                                </span>
                                {review.verifiedPurchase && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#e1f6e5] dark:bg-[#255131]/60 text-[#2c623a] dark:text-[#9de0ab] text-[9px] font-bold uppercase tracking-wider">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    Verified Buyer
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                {review.createdAt
                                  ? new Date(review.createdAt).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : 'Verified Delivery'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((starVal) => (
                              <Star
                                key={starVal}
                                className={`w-3.5 h-3.5 ${
                                  starVal <= (review.rating || 5)
                                    ? 'fill-[#58b970] text-[#58b970]'
                                    : 'text-gray-300 dark:text-gray-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {review.title && (
                          <h4 className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-white">
                            {review.title}
                          </h4>
                        )}

                        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                          {review.comment}
                        </p>

                        {review.images && review.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {review.images.map((imgUrl, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setZoomedReviewImage(getSafeMediaUrl(imgUrl))}
                                className="relative group w-20 h-20 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 hover:border-[#58b970] transition-colors"
                                title="Click to enlarge customer photo"
                              >
                                <img
                                  src={getSafeMediaUrl(imgUrl)}
                                  alt={`Customer upload by ${review.reviewerName}`}
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <ZoomIn className="w-4 h-4 text-white" />
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )
        })()}
      </div>

      {/* FULLSCREEN REVIEW PHOTO LIGHTBOX MODAL */}
      {zoomedReviewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomedReviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedReviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-[#58b970] hover:text-black text-white transition-colors"
            aria-label="Close review image preview"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedReviewImage}
            alt="Enlarged customer review photo"
            className="max-h-[85vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* FULL-SCREEN MEDIA LIGHTBOX / VIEWER MODAL */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-fadeIn select-none">
          {/* Header */}
          <div className="flex items-center justify-between text-white max-w-6xl w-full mx-auto pb-3 border-b border-white/10">
            <div>
              <h3 className="font-anton text-lg sm:text-xl uppercase tracking-wider text-creamy-400">
                {currentProduct.name}
              </h3>
              <p className="text-xs text-gray-400">
                Media {lightboxIndex + 1} of {mediaList.length} • Use Arrow Keys to navigate, Esc to exit
              </p>
            </div>
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="p-2 rounded-full bg-white/10 hover:bg-creamy-500 hover:text-black transition-colors"
              title="Close (Esc)"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Main Media Viewer Viewport */}
          <div className="relative flex-1 flex items-center justify-center py-4 max-w-6xl w-full mx-auto overflow-hidden">
            {/* Previous Button */}
            {mediaList.length > 1 && (
              <button
                onClick={() => setLightboxIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length)}
                className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-black/60 hover:bg-creamy-500 hover:text-black text-white transition-all backdrop-blur-sm"
                title="Previous (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
              </button>
            )}

            {/* Media Item */}
            <div className="max-h-[70vh] sm:max-h-[75vh] max-w-full flex items-center justify-center">
              {isVideoMedia(currentLightboxMedia) ? (
                <video
                  src={getSafeMediaUrl(currentLightboxMedia)}
                  controls
                  autoPlay
                  className="max-h-[70vh] sm:max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain bg-black"
                />
              ) : (
                <img
                  src={getSafeMediaUrl(currentLightboxMedia)}
                  alt={`${currentProduct.name} enlarged view ${lightboxIndex + 1}`}
                  className="max-h-[70vh] sm:max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    if (!target.src.endsWith('/images/hero1.jpeg')) {
                      target.src = '/images/hero1.jpeg'
                    }
                  }}
                />
              )}
            </div>

            {/* Next Button */}
            {mediaList.length > 1 && (
              <button
                onClick={() => setLightboxIndex((prev) => (prev + 1) % mediaList.length)}
                className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-creamy-500 hover:text-black text-white transition-all backdrop-blur-sm"
                title="Next (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
              </button>
            )}
          </div>

          {/* Horizontal Scrolling Thumbnails Reel */}
          {mediaList.length > 1 && (
            <div className="max-w-4xl w-full mx-auto pt-3 border-t border-white/10">
              <div className="flex items-center justify-center gap-3 overflow-x-auto py-2 scrollbar-thin">
                {mediaList.map((thumb, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 transition-all ${lightboxIndex === idx
                      ? 'border-creamy-500 ring-2 ring-creamy-500 scale-105'
                      : 'border-white/20 opacity-60 hover:opacity-100 hover:border-creamy-500/50'
                      }`}
                  >
                    {isVideoMedia(thumb) ? (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-creamy-500">
                        <Play className="w-5 h-5 fill-creamy-500" />
                      </div>
                    ) : (
                      <img
                        src={getSafeMediaUrl(thumb)}
                        alt={`Thumb ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          if (!target.src.endsWith('/images/hero1.jpeg')) {
                            target.src = '/images/hero1.jpeg'
                          }
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <BookComingSoonModal
        product={currentProduct}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
      />
    </div>
  )
}

export default ProductDetailPage