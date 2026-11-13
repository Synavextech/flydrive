import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search,
  ShoppingCart,
  User,
  Menu,
  LogOut,
  Settings,
  X,
  Heart,
  ChevronRight,
  Truck,
  Package,
  CheckCircle2,
  Clock,
  MapPin,
  Copy,
  Check,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { useProducts } from '../contexts/ProductContext'
import { useTheme } from '../contexts/ThemeContext'
import { orderApi } from '../services/api'
import { TrackedOrderDetails } from '../types'

const Sun = ({ className }: { className?: string }) => (
  <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)

const Moon = ({ className }: { className?: string }) => (
  <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
)

interface NavbarProps {
  onOpenCart?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCart }) => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Persistent Order Tracking Modal state
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false)
  const [trackingInput, setTrackingInput] = useState('')
  const [verificationInput, setVerificationInput] = useState('')
  const [requiresVerification, setRequiresVerification] = useState(false)
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrderDetails | null>(null)
  const [recentTrackings, setRecentTrackings] = useState<Array<{ orderNumber: string; trackingNumber: string; status?: string; date?: string }>>([])
  const [copiedTrackNum, setCopiedTrackNum] = useState(false)

  const { user, isAuthenticated, logout } = useAuth()
  const { totalItems } = useCart()
  const { searchProducts } = useProducts()
  const { theme, toggleTheme } = useTheme()

  const loadRecentTrackings = useCallback(async () => {
    const list: Array<{ orderNumber: string; trackingNumber: string; status?: string; date?: string }> = []
    try {
      const savedList = JSON.parse(localStorage.getItem('dfe_recent_trackings') || '[]')
      if (Array.isArray(savedList)) {
        for (const item of savedList) {
          if (item?.trackingNumber || item?.orderNumber) {
            list.push({
              orderNumber: item.orderNumber || 'DFE-ORDER',
              trackingNumber: item.trackingNumber || `TRK-${item.orderNumber}`,
              status: item.status || 'PROCESSING',
              date: item.date
            })
          }
        }
      }
      const latestReceiptRaw = localStorage.getItem('latest_order_receipt')
      if (latestReceiptRaw) {
        const parsedReceipt = JSON.parse(latestReceiptRaw)
        const rOrderNum = parsedReceipt?.orderNumber
        const rTrackNum = parsedReceipt?.trackingNumber || (rOrderNum ? `TRK-${rOrderNum}` : '')
        if (rOrderNum && rTrackNum && !list.some((x) => x.trackingNumber === rTrackNum)) {
          list.unshift({
            orderNumber: rOrderNum,
            trackingNumber: rTrackNum,
            status: 'PROCESSING',
            date: parsedReceipt.orderDate || parsedReceipt.date
          })
        }
      }
    } catch {
      // Ignore localStorage parse error
    }

    if (isAuthenticated) {
      try {
        const res = await orderApi.getOrders()
        if (res.success && Array.isArray(res.data)) {
          for (const ord of res.data) {
            const trk = ord.trackingNumber || `TRK-${ord.orderNumber}`
            if (!list.some((x) => x.trackingNumber === trk || x.orderNumber === ord.orderNumber)) {
              list.push({
                orderNumber: ord.orderNumber,
                trackingNumber: trk,
                status: ord.status,
                date: ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined
              })
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    setRecentTrackings(list.slice(0, 6))
    return list
  }, [isAuthenticated])

  const executeTrackLookup = useCallback(async (identifierToTrack: string, overrideVerify?: string) => {
    const clean = identifierToTrack.trim()
    if (!clean) {
      setTrackingError('Please enter your Tracking Number (e.g. TRK-DFE-...) or Order Number (e.g. DFE-...).')
      return
    }

    setIsTrackingLoading(true)
    setTrackingError(null)

    try {
      const verifyValue = (overrideVerify ?? verificationInput).trim()
      const savedReceiptEmail = (() => {
        try {
          const raw = localStorage.getItem('latest_order_receipt')
          return raw ? JSON.parse(raw)?.customerEmail || '' : ''
        } catch {
          return ''
        }
      })()
      const effectiveVerify = verifyValue || user?.email || savedReceiptEmail || ''
      const verification = effectiveVerify
        ? effectiveVerify.includes('@')
          ? { email: effectiveVerify }
          : { zip: effectiveVerify }
        : undefined

      const res = await orderApi.trackOrder(clean, verification)
      if (res.success && res.data) {
        setRequiresVerification(false)
        setTrackedOrder(res.data)
        setTrackingInput(res.data.trackingNumber || clean)
        return
      }
    } catch (err: any) {
      setTrackedOrder(null)
      if (err?.requiresVerification) {
        setRequiresVerification(true)
      }
      setTrackingError(
        err?.message ||
          'No matching shipment was found. Please verify your Tracking Number or Order Number and try again.'
      )
    } finally {
      setIsTrackingLoading(false)
    }
  }, [verificationInput, user?.email])

  const openTrackModal = useCallback(
    async (initialTrackingNum?: string) => {
      setIsTrackModalOpen(true)
      setTrackingError(null)
      const list = await loadRecentTrackings()
      const target = initialTrackingNum || trackingInput || list[0]?.trackingNumber || ''
      if (target) {
        setTrackingInput(target)
        executeTrackLookup(target)
      }
    },
    [executeTrackLookup, loadRecentTrackings, trackingInput]
  )

  useEffect(() => {
    const handler = (e: Event) => {
      const customEv = e as CustomEvent<{ trackingNumber?: string }>
      const passedNum = customEv.detail?.trackingNumber
      openTrackModal(passedNum)
    }
    window.addEventListener('dfe:open-track-order', handler)
    return () => window.removeEventListener('dfe:open-track-order', handler)
  }, [openTrackModal])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      await searchProducts(searchQuery)
      setIsSearchOpen(false)
      setMobileMenuOpen(false)
      navigate('/#store-catalog')
    }
  }

  const handleCartClick = () => {
    if (onOpenCart) {
      onOpenCart()
    } else {
      navigate('/cart')
    }
  }

  return (
    <div className="w-full">
      {/* Top Announcement Ticker Strip - Matching edrifttrikes.shop */}
      <aside
        aria-label="Store announcements"
        className="group relative w-full overflow-hidden bg-creamy-500 text-black border-b border-black/10 select-none"
      >
        <div className="animate-marquee flex w-max items-center py-2 font-bold text-[11px] uppercase tracking-widest">
          <div className="flex items-center">
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">Create an account to save addresses & follow live order tracking anytime</span>
            </span>
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">FREE EXPRESS SHIPPING ON ALL ORDERS ($0.00)</span>
            </span>
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">SECURE PAYPAL & CARD CHECKOUT</span>
            </span>
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">AUSTIN, TEXAS HQ • WORLDWIDE EXPRESS DISPATCH</span>
            </span>
          </div>
          {/* Duplicate track for seamless continuous loop */}
          <div className="flex items-center" aria-hidden="true">
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">Create an account to save addresses & follow live order tracking anytime</span>
            </span>
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">FREE EXPRESS SHIPPING ON ALL ORDERS ($0.00)</span>
            </span>
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">SECURE PAYPAL & CARD CHECKOUT</span>
            </span>
            <span className="inline-flex items-center gap-6 px-6">
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black/60" />
              <span className="whitespace-nowrap font-extrabold">AUSTIN, TEXAS HQ • WORLDWIDE EXPRESS DISPATCH</span>
            </span>
          </div>
        </div>
      </aside>

      {/* Main Navbar — Responsive Motorsport Header */}
      <nav className="w-full top-0 sticky z-50 border-b bg-white/95 dark:bg-[#131316]/95 backdrop-blur-md border-gray-200 dark:border-white/10 text-gray-900 dark:text-white shadow-sm dark:shadow-xl transition-colors duration-200">
        <div className="flex justify-between items-center w-full px-4 sm:px-6 md:px-8 py-3.5 max-w-7xl mx-auto gap-4">
          {/* Brand Logo for DriveFlyElectric */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="h-9 w-9 md:h-10 md:w-10 rounded-lg bg-creamy-500 flex items-center justify-center font-black text-black text-xl shadow-lg shadow-creamy-500/30 group-hover:scale-105 transition-transform">
              ⚡
            </div>
            <div className="flex flex-col">
              <span className="font-anton text-xl md:text-2xl tracking-wide leading-none">
                <span className="text-creamy-500">DRIVEFLY</span>
                <span className="text-gray-900 dark:text-white">ELECTRIC</span>
              </span>
              <span className="text-[9px] uppercase tracking-wider text-creamy-500 dark:text-creamy-400 font-bold hidden sm:inline -mt-0.5">
                electric microcars, minihelicopters & rides
              </span>
            </div>
          </Link>

          {/* Center Navigation Links */}
          <div className="hidden md:flex items-center gap-6 font-bold text-xs uppercase tracking-widest text-gray-700 dark:text-gray-300">
            <Link to="/?category=mini-helicopter#store-catalog" className="hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors">
              MiniHeliCopters
            </Link>
            <Link to="/?category=microcars#store-catalog" className="hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors">
              Microcars
            </Link>
            <Link to="/?category=trikes#store-catalog" className="hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors">
              Trikes
            </Link>
            <Link to="/?category=coming-soon#store-catalog" className="hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors">
              Coming Soon
            </Link>
          </div>

          {/* Desktop Right Action Icons */}
          <div className="hidden md:flex items-center gap-1.5">
            {/* Persistent Topnav Track Order Handler */}
            <button
              type="button"
              onClick={() => openTrackModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-creamy-500/15 hover:bg-creamy-500 text-creamy-600 dark:text-creamy-400 hover:text-black border border-creamy-500/30 font-extrabold text-[11px] uppercase tracking-wider transition-all mr-1 cursor-pointer shadow-2xs"
              title="Track Your Order by Tracking Number or Order Number"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Track Order</span>
            </button>

            {/* Search Toggle */}
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors text-gray-700 dark:text-gray-300"
              title="Search catalog"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Wishlist / Parts Bin */}
            <button
              type="button"
              onClick={handleCartClick}
              className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors text-gray-700 dark:text-gray-300"
              title="Parts Bin / Saved Items"
            >
              <Heart className="w-5 h-5" />
            </button>

            {/* Cart Button with Counter */}
            <button
              onClick={handleCartClick}
              className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors text-gray-700 dark:text-gray-300"
              title="Open Cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-creamy-500 text-black text-[10px] font-black rounded-full h-5 w-5 flex items-center justify-center shadow-lg shadow-creamy-500/40">
                  {totalItems}
                </span>
              )}
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 hover:text-creamy-500 dark:hover:text-creamy-400 transition-colors text-gray-700 dark:text-gray-300"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-creamy-500 hover:rotate-45 transition-transform" />
              ) : (
                <Moon className="w-5 h-5 text-creamy-500 hover:-rotate-12 transition-transform" />
              )}
            </button>

            {/* Account / User Menu */}
            <div className="relative ml-2">
              {isAuthenticated ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 py-1.5 px-3 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 hover:border-creamy-500 text-gray-900 dark:text-gray-200 transition-all text-xs font-bold"
                  >
                    <div className="w-6 h-6 rounded-full bg-creamy-500 text-black font-black flex items-center justify-center text-[10px]">
                      {user?.firstName ? user.firstName[0].toUpperCase() : 'U'}
                    </div>
                    <span className="hidden lg:inline">{user?.firstName || 'Account'}</span>
                    {user?.role === 'ADMIN' && (
                      <span className="bg-purple-600/30 text-purple-600 dark:text-purple-300 border border-purple-500/40 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                        Admin
                      </span>
                    )}
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#17171c] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl py-2 z-50 text-gray-900 dark:text-white backdrop-blur-2xl">
                      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/10">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">Signed in as</p>
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{user?.email}</p>
                        <span className="inline-block mt-1 text-[9px] font-extrabold px-2 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-creamy-600 dark:text-creamy-400">
                          {user?.role}
                        </span>
                      </div>

                      {user?.role === 'ADMIN' && (
                        <Link
                          to="/admin"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center px-4 py-2.5 text-xs font-bold text-purple-600 dark:text-purple-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Admin Dashboard
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false)
                          openTrackModal()
                        }}
                        className="flex items-center w-full px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <Truck className="mr-2 h-4 w-4 text-creamy-500" />
                        Track My Order
                      </button>

                      <Link
                        to="/checkout"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <ShoppingCart className="mr-2 h-4 w-4 text-creamy-500" />
                        Proceed to Checkout
                      </Link>

                      <button
                        onClick={() => {
                          setShowUserMenu(false)
                          logout()
                        }}
                        className="flex items-center w-full px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 bg-creamy-500 hover:bg-creamy-400 text-black px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-widest transition-all shadow-lg shadow-creamy-500/20 active:scale-95"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>

          {/* Mobile Right Icons */}
          <div className="flex md:hidden items-center gap-1">
            <button
              type="button"
              onClick={() => openTrackModal()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-creamy-500/15 text-creamy-500 border border-creamy-500/30 text-[10px] font-black uppercase tracking-wider mr-0.5"
              title="Track Order"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Track</span>
            </button>

            <button
              onClick={handleCartClick}
              className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 hover:text-creamy-400 transition-colors text-gray-200"
              title="Cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-creamy-500 text-black text-[10px] font-black rounded-full h-5 w-5 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 hover:text-creamy-400 transition-colors text-gray-200"
              title="Open Navigation"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Dropdown Desktop Search Bar */}
        {isSearchOpen && (
          <div className="border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#17171c] py-3 px-4 shadow-md transition-colors">
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search rigs, dirt bikes, parts, gear..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-gray-100 dark:bg-[#131316] border border-gray-300 dark:border-white/20 rounded-xl px-4 py-2.5 pl-10 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-creamy-500 focus:ring-1 focus:ring-creamy-500"
                />
                <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 absolute left-3.5 top-3" />
              </div>
              <button
                type="submit"
                className="bg-creamy-500 hover:bg-creamy-400 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}
      </nav>

      {/* Mobile Slide-Out Drawer — Exactly matching edrifttrikes.shop */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[85] md:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Panel */}
          <aside className="absolute top-0 right-0 h-full w-[86%] max-w-sm bg-white dark:bg-[#131316] border-l border-gray-200 dark:border-white/10 flex flex-col shadow-2xl text-gray-900 dark:text-white transition-colors">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-gray-200 dark:border-white/10 shrink-0">
              <span className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-creamy-500 flex items-center justify-center font-black text-black text-lg">
                  ⚡
                </div>
                <div className="flex flex-col">
                  <span className="font-anton text-lg text-creamy-500 tracking-wide leading-none">
                    DRIVEFLY<span className="text-gray-900 dark:text-white">ELECTRIC</span>
                  </span>
                  <span className="text-[8px] uppercase tracking-wider text-creamy-500 dark:text-creamy-400 font-bold">
                    electric microcars, minihelicopters & rides
                  </span>
                </div>
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="h-10 w-10 flex items-center justify-center rounded-full text-gray-600 dark:text-gray-300 hover:text-creamy-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Drawer Body Scroll */}
            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
              {/* Search Bar */}
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  placeholder="Search rigs, parts, gear..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-[#1a1a20] border border-gray-300 dark:border-white/10 rounded-lg px-4 h-12 pl-10 text-xs text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-creamy-500"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-4" />
              </form>

              {/* Shop Categories */}
              <div>
                <p className="font-bold text-[11px] text-creamy-500 uppercase tracking-widest mb-2">
                  Shop
                </p>
                <nav className="flex flex-col">
                  <Link
                    to="/?category=all#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between h-12 text-gray-900 dark:text-white font-anton text-xl uppercase border-b border-gray-100 dark:border-white/5 hover:text-creamy-500 dark:hover:text-creamy-400"
                  >
                    All Rigs
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                  <Link
                    to="/?category=mini-helicopter#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between h-12 text-gray-900 dark:text-white font-anton text-xl uppercase border-b border-gray-100 dark:border-white/5 hover:text-creamy-500 dark:hover:text-creamy-400"
                  >
                    MiniHeliCopters
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                  <Link
                    to="/?category=microcars#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between h-12 text-gray-900 dark:text-white font-anton text-xl uppercase border-b border-gray-100 dark:border-white/5 hover:text-creamy-500 dark:hover:text-creamy-400"
                  >
                    Microcars
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                  <Link
                    to="/?category=go%20karts#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between h-12 text-gray-900 dark:text-white font-anton text-xl uppercase border-b border-gray-100 dark:border-white/5 hover:text-creamy-500 dark:hover:text-creamy-400"
                  >
                    Go Karts & Electric
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                  <Link
                    to="/?category=trikes#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between h-12 text-gray-900 dark:text-white font-anton text-xl uppercase border-b border-gray-100 dark:border-white/5 hover:text-creamy-500 dark:hover:text-creamy-400"
                  >
                    Trikes
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                  <Link
                    to="/?category=dirtbikes#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between h-12 text-gray-900 dark:text-white font-anton text-xl uppercase border-b border-gray-100 dark:border-white/5 hover:text-creamy-500 dark:hover:text-creamy-400"
                  >
                    Dirt Bikes
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                  <Link
                    to="/?category=coming-soon#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between h-12 text-gray-900 dark:text-white font-anton text-xl uppercase border-b border-gray-100 dark:border-white/5 hover:text-creamy-500 dark:hover:text-creamy-400"
                  >
                    Coming Soon
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                </nav>
              </div>

              {/* Explore Section */}
              <div>
                <p className="font-bold text-[11px] text-creamy-500 uppercase tracking-widest mb-2">
                  Explore
                </p>
                <nav className="flex flex-col space-y-1">
                  <Link
                    to="/#store-catalog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center h-10 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-bold uppercase tracking-widest text-xs border-b border-gray-100 dark:border-white/5"
                  >
                    About Us
                  </Link>
                  <a
                    href="#support"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center h-10 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-bold uppercase tracking-widest text-xs border-b border-gray-100 dark:border-white/5"
                  >
                    Support & Help
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      openTrackModal()
                    }}
                    className="flex items-center justify-between h-10 text-creamy-500 hover:text-creamy-400 font-extrabold uppercase tracking-widest text-xs border-b border-gray-100 dark:border-white/5 w-full text-left"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Track My Order
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <a
                    href="#shipping"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center h-10 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-bold uppercase tracking-widest text-xs border-b border-gray-100 dark:border-white/5"
                  >
                    Shipping & Warranty
                  </a>
                </nav>
              </div>

              {/* 3-Button Action Grid: Account, Wishlist, Cart */}
              <div>
                <p className="font-bold text-[11px] text-creamy-500 uppercase tracking-widest mb-2">
                  Account & Shortcuts
                </p>
                <nav className="grid grid-cols-3 gap-2.5">
                  <Link
                    to={isAuthenticated ? (user?.role === 'ADMIN' ? '/admin' : '/checkout') : '/login'}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex flex-col items-center justify-center gap-1.5 bg-gray-50 dark:bg-[#1a1a20] border border-gray-200 dark:border-white/10 rounded-lg py-3.5 text-gray-700 dark:text-gray-300 hover:text-creamy-500 transition-colors"
                  >
                    <User className="w-5 h-5" />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest">
                      {isAuthenticated ? 'Profile' : 'Login'}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      handleCartClick()
                    }}
                    className="flex flex-col items-center justify-center gap-1.5 bg-gray-50 dark:bg-[#1a1a20] border border-gray-200 dark:border-white/10 rounded-lg py-3.5 text-gray-700 dark:text-gray-300 hover:text-creamy-500 transition-colors"
                  >
                    <Heart className="w-5 h-5" />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest">Parts Bin</span>
                  </button>

                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      handleCartClick()
                    }}
                    className="flex flex-col items-center justify-center gap-1.5 bg-gray-50 dark:bg-[#1a1a20] border border-gray-200 dark:border-white/10 rounded-lg py-3.5 text-gray-700 dark:text-gray-300 hover:text-creamy-500 transition-colors relative"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    {totalItems > 0 && (
                      <span className="absolute top-2 right-4 bg-creamy-500 text-black text-[9px] font-black rounded-full h-4 w-4 flex items-center justify-center">
                        {totalItems}
                      </span>
                    )}
                    <span className="text-[10px] font-extrabold uppercase tracking-widest">Cart</span>
                  </button>
                </nav>
              </div>
            </div>

            {/* Drawer Bottom Actions */}
            <div className="p-5 border-t border-gray-200 dark:border-white/10 shrink-0 space-y-3 bg-gray-50 dark:bg-[#0f0f12]">
              <a
                href="/#store-catalog"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center bg-creamy-500 text-black py-3.5 rounded-lg font-black uppercase tracking-widest text-xs hover:bg-creamy-400 active:scale-95 transition-all shadow-lg shadow-creamy-500/20"
              >
                Shop The Fleet
              </a>
              {!isAuthenticated ? (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center text-gray-600 dark:text-gray-400 py-1 font-bold uppercase tracking-widest text-[11px] hover:text-gray-900 dark:hover:text-white"
                >
                  Sign In / Register
                </Link>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    logout()
                  }}
                  className="w-full text-center text-red-500 py-1 font-bold uppercase tracking-widest text-[11px] hover:text-red-400"
                >
                  Log Out
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Persistent Topnav Order Tracking Modal */}
      {isTrackModalOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setIsTrackModalOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-white dark:bg-[#14161d] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden text-gray-900 dark:text-white z-10 my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-900 dark:bg-[#0e1015] text-white flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-creamy-500 text-black flex items-center justify-center shadow-md">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-creamy-400 block">
                    DriveFlyExpress Global Logistics
                  </span>
                  <h3 className="text-lg font-black uppercase tracking-wide font-anton leading-none mt-0.5">
                    Live Order & Shipment Tracker
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTrackModalOpen(false)}
                className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Lookup Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  executeTrackLookup(trackingInput)
                }}
                className="space-y-2.5"
              >
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  Enter Tracking Number or Order Number
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value)}
                      placeholder="e.g. TRK-DFE-849201-A1B2 or DFE-173134..."
                      className="w-full px-4 py-3 pl-10 rounded-xl bg-gray-50 dark:bg-[#1b1e28] border border-gray-300 dark:border-neutral-700 text-xs sm:text-sm font-mono font-bold text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                    />
                    <Package className="w-4 h-4 text-creamy-500 absolute left-3.5 top-3.5" />
                  </div>
                  <button
                    type="submit"
                    disabled={isTrackingLoading}
                    className="inline-flex items-center justify-center gap-2 bg-creamy-500 hover:bg-creamy-400 disabled:opacity-60 text-black font-black uppercase tracking-wider text-xs px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer shrink-0"
                  >
                    {isTrackingLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Locating...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Track Shipment</span>
                      </>
                    )}
                  </button>
                </div>
                {(requiresVerification || !isAuthenticated) && (
                  <div>
                    <input
                      type="text"
                      value={verificationInput}
                      onChange={(e) => setVerificationInput(e.target.value)}
                      placeholder="Verification: Enter order email OR delivery postal/ZIP code"
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-[#1b1e28] border border-gray-300 dark:border-neutral-700 text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                    />
                  </div>
                )}
              </form>

              {/* Recent Tracking Numbers Quick-Select */}
              {recentTrackings.length > 0 && (
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">
                    Your Recent Shipments (Click to Track):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentTrackings.map((rt) => (
                      <button
                        key={rt.trackingNumber}
                        type="button"
                        onClick={() => {
                          setTrackingInput(rt.trackingNumber)
                          executeTrackLookup(rt.trackingNumber)
                        }}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                          trackedOrder?.trackingNumber === rt.trackingNumber
                            ? 'bg-creamy-500 text-black border-creamy-500 shadow-xs'
                            : 'bg-gray-50 dark:bg-[#1b1e28] text-gray-800 dark:text-gray-200 border-gray-200 dark:border-neutral-700 hover:border-creamy-500'
                        }`}
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>{rt.trackingNumber}</span>
                        <span className="text-[10px] opacity-75">(#{rt.orderNumber})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error State */}
              {trackingError && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">{trackingError}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Tip: Your Tracking Number (`TRK-DFE-...`) is shown on your Order Confirmation page and in your PDF Purchase Receipt.
                    </p>
                  </div>
                </div>
              )}

              {/* Tracked Order Result */}
              {trackedOrder && (
                <div className="space-y-5 pt-2 border-t border-gray-200 dark:border-neutral-800">
                  {/* Top Summary Banner */}
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#1b1e28] border border-gray-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-creamy-500 text-black">
                          {trackedOrder.status}
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-500 dark:text-gray-400">
                          Order #{trackedOrder.orderNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-base sm:text-lg font-black font-mono text-gray-900 dark:text-white">
                          {trackedOrder.trackingNumber}
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(trackedOrder.trackingNumber)
                              setCopiedTrackNum(true)
                              setTimeout(() => setCopiedTrackNum(false), 2000)
                            } catch {
                              // Ignore
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-[10px] font-bold text-gray-700 dark:text-gray-300 hover:border-creamy-500"
                        >
                          {copiedTrackNum ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-creamy-500" />}
                          <span>{copiedTrackNum ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Carrier: <strong className="text-gray-800 dark:text-gray-200">{trackedOrder.carrier}</strong>
                      </p>
                    </div>

                    <div className="sm:text-right space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Estimated Delivery Window
                      </p>
                      <p className="text-xs font-black text-creamy-500">
                        {trackedOrder.estimatedDelivery}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 flex sm:justify-end items-center gap-1">
                        <MapPin className="w-3 h-3 text-creamy-500 shrink-0" />
                        <span className="truncate max-w-[220px]">{trackedOrder.destination}</span>
                      </p>
                    </div>
                  </div>

                  {/* 4-Stage Visual Shipment Progress Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Live Telemetry & Fulfillment Milestones
                    </h4>
                    <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 dark:before:bg-neutral-800">
                      {trackedOrder.timeline.map((step) => (
                        <div key={step.key} className="relative">
                          <div
                            className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                              step.completed
                                ? 'bg-creamy-500 border-creamy-500 text-black'
                                : 'bg-white dark:bg-[#14161d] border-gray-300 dark:border-neutral-700 text-gray-400'
                            }`}
                          >
                            {step.completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                          </div>
                          <div
                            className={`p-3.5 rounded-xl border transition-colors ${
                              step.active
                                ? 'bg-creamy-500/10 border-creamy-500/40'
                                : step.completed
                                ? 'bg-gray-50/70 dark:bg-[#181b22] border-gray-200 dark:border-neutral-800'
                                : 'bg-white dark:bg-[#14161d] border-gray-100 dark:border-neutral-800/60 opacity-65'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-extrabold text-gray-900 dark:text-white">
                                {step.title}
                              </p>
                              {step.timestamp && (
                                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                                  {new Date(step.timestamp).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-semibold text-creamy-600 dark:text-creamy-400 mt-0.5">
                              {step.location}
                            </p>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cargo Manifest / Ordered Items */}
                  {trackedOrder.items && trackedOrder.items.length > 0 && (
                    <div className="pt-2 border-t border-gray-200 dark:border-neutral-800">
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2.5">
                        Crated Cargo Manifest ({trackedOrder.items.length} {trackedOrder.items.length === 1 ? 'Unit' : 'Units'})
                      </h4>
                      <div className="space-y-2">
                        {trackedOrder.items.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-[#1b1e28] border border-gray-200 dark:border-neutral-800 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Package className="w-4 h-4 text-creamy-500 shrink-0" />
                              <span className="font-bold text-gray-900 dark:text-white truncate">
                                {item.name}
                              </span>
                              <span className="text-gray-500 font-mono">× {item.quantity}</span>
                            </div>
                            <span className="font-mono font-bold text-creamy-500 shrink-0 ml-2">
                              ${Number(item.total || item.price * item.quantity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Navbar