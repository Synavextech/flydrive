import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Package,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Plus,
  Edit2,
  Trash2,
  Users,
  CheckCircle,
  AlertTriangle,
  X,
  RefreshCw,
  Download,
  FileText,
  Printer,
  Copy,
  Check,
  MessageSquare,
  Send,
  CalendarClock,
  Sparkles,
  BarChart3,
  Eye,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Clock,
  CreditCard,
  ShieldAlert,
  Wallet,
  RotateCcw
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { adminApi } from '../services/api'
import {
  Product,
  Order,
  User,
  SupportSession,
  ProductBooking,
  AdminAnalyticsData,
  ProductViewSource,
  PaymentOptionsConfig,
  ReturnRequest,
  Wallet as WalletType,
  WalletTransaction
} from '../types'
import {
  OrderReceiptData,
  generateReceiptText,
  downloadReceiptPdf
} from '../utils/receiptPdf'

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

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth()
  const { fetchProducts: fetchGlobalProducts } = useProducts()
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'returns' | 'bookings' | 'users' | 'support' | 'analytics'>('overview')

  // Dashboard Stats
  const [stats, setStats] = useState<{
    totalProducts: number
    totalOrders: number
    totalRevenue: number
    totalUsers?: number
    recentOrders: Order[]
  }>({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalUsers: 0,
    recentOrders: [],
  })

  // Data lists
  const [productsList, setProductsList] = useState<Product[]>([])
  const [ordersList, setOrdersList] = useState<Order[]>([])
  const [bookingsList, setBookingsList] = useState<ProductBooking[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [productStatusFilter, setProductStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'COMING_SOON'>('ALL')
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'ALL' | ProductBooking['status']>('ALL')

  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Image Upload state
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [manualMediaUrl, setManualMediaUrl] = useState('')

  // Product Modal State (Add / Edit)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    originalPrice: '',
    sku: '',
    stock: '',
    category: 'Microcars',
    brand: 'DriveFlyElectric',
    imageUrl: '',
    images: [] as string[],
    isNew: true,
    isComingSoon: false,
    comingSoonRelease: '',
    topSpeed: '60 km/h',
    range: '70 km',
    deliveryTime: '12-21 business days (Worldwide Express Dispatch)',
  })

  // Order status filter
  const [orderFilter, setOrderFilter] = useState<string>('ALL')
  const [processingManualOrderId, setProcessingManualOrderId] = useState<string | null>(null)
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<any | null>(null)
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)
  const [notificationsList, setNotificationsList] = useState<any[]>([])
  const [sseConnected, setSseConnected] = useState<boolean>(false)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const orderFilterRef = useRef(orderFilter)
  orderFilterRef.current = orderFilter
  const sseConnectedRef = useRef(false)

  // Support & LiveChat Management state
  const [supportSessions, setSupportSessions] = useState<SupportSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [supportTopicFilter, setSupportTopicFilter] = useState<string>('ALL')
  const [supportStatusFilter, setSupportStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL')
  const [supportSearchQuery, setSupportSearchQuery] = useState<string>('')
  const [adminReplyText, setAdminReplyText] = useState<string>('')
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false)
  const adminChatEndRef = useRef<HTMLDivElement>(null)
  const markingReadSessionRef = useRef<string | null>(null)

  // Storefront Traffic & Product Analytics state
  const [analyticsData, setAnalyticsData] = useState<AdminAnalyticsData | null>(null)
  const [analyticsDays, setAnalyticsDays] = useState<1 | 7 | 30 | 90>(30)
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false)
  const analyticsDaysRef = useRef<number>(analyticsDays)
  analyticsDaysRef.current = analyticsDays
  const analyticsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Checkout Payment Options Availability Controls
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptionsConfig | null>(null)
  const [paymentNoticeDrafts, setPaymentNoticeDrafts] = useState<{ paypal: string; stripe: string }>({
    paypal: '',
    stripe: ''
  })
  const [savingPaymentGateway, setSavingPaymentGateway] = useState<'paypal' | 'stripe' | null>(null)

  // 21-Day Return Requests & Customer Wallets state
  const [returnsList, setReturnsList] = useState<ReturnRequest[]>([])
  const [walletsList, setWalletsList] = useState<Array<WalletType & { user?: Partial<User>; recentTransactions?: WalletTransaction[] }>>([])
  const [processingReturnId, setProcessingReturnId] = useState<string | null>(null)
  const [returnNotesDrafts, setReturnNotesDrafts] = useState<Record<string, string>>({})
  const [returnTrackingDrafts, setReturnTrackingDrafts] = useState<Record<string, string>>({})
  const [adjustWalletModal, setAdjustWalletModal] = useState<{
    userId: string
    label: string
    direction: 'CREDIT' | 'DEBIT'
    amount: string
    description: string
  } | null>(null)
  const [adjustingWalletSubmitting, setAdjustingWalletSubmitting] = useState(false)

  const syncPaymentOptionsState = (cfg: PaymentOptionsConfig) => {
    setPaymentOptions(cfg)
    setPaymentNoticeDrafts({
      paypal: cfg.paypal?.notice || '',
      stripe: cfg.stripe?.notice || ''
    })
  }

  const fetchPaymentOptions = async () => {
    try {
      const res = await adminApi.getPaymentOptions()
      if (res.success && res.data) {
        syncPaymentOptionsState(res.data)
      }
    } catch {
      // Silent fallback
    }
  }

  const updatePaymentGatewaySetting = async (
    gateway: 'paypal' | 'stripe',
    nextAvailable?: boolean,
    customNotice?: string
  ) => {
    try {
      setSavingPaymentGateway(gateway)
      const payload =
        gateway === 'paypal'
          ? {
              ...(nextAvailable !== undefined ? { paypalAvailable: nextAvailable } : {}),
              ...(customNotice !== undefined ? { paypalNotice: customNotice } : {})
            }
          : {
              ...(nextAvailable !== undefined ? { stripeAvailable: nextAvailable } : {}),
              ...(customNotice !== undefined ? { stripeNotice: customNotice } : {})
            }
      const res = await adminApi.updatePaymentOptions(payload)
      if (res.success && res.data) {
        syncPaymentOptionsState(res.data)
        const activeState = res.data[gateway].available ? 'Available in Checkout' : 'Marked UNAVAILABLE (Shoppers Warned Not to Use)'
        notify('success', `${gateway === 'paypal' ? 'PayPal' : 'Stripe Card'} is now ${activeState}`)
      } else {
        notify('error', res.error || 'Failed to save payment availability setting')
      }
    } catch (err: any) {
      notify('error', err?.message || 'Unable to update payment availability setting')
    } finally {
      setSavingPaymentGateway(null)
    }
  }

  const fetchAnalytics = async (days: number = analyticsDaysRef.current) => {
    try {
      setAnalyticsLoading(true)
      const res = await adminApi.getAnalytics(days)
      if (res.success && res.data) {
        setAnalyticsData(res.data)
      }
    } catch {
      // Silent fallback
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const fetchSupportSessions = async () => {
    try {
      const res = await adminApi.getSupportSessions()
      if (res.success && Array.isArray(res.data)) {
        setSupportSessions(res.data)
        setSelectedSessionId(prev => prev || (res.data && res.data.length > 0 ? res.data[0].id : null))
      }
    } catch {
      // Silent fallback
    }
  }

  const fetchNotifications = async () => {
    try {
      const res = await adminApi.getNotifications()
      if (res.success && Array.isArray(res.data)) {
        setNotificationsList(res.data)
      }
    } catch {
      // Silent fallback
    }
  }

  const fetchBookings = async () => {
    try {
      const res = await adminApi.getBookings()
      if (res.success && Array.isArray(res.data)) {
        setBookingsList(res.data)
      }
    } catch {
      // Silent fallback
    }
  }

  const fetchReturnsAndWallets = async () => {
    try {
      const [retRes, walRes] = await Promise.allSettled([adminApi.getReturns(), adminApi.getWallets()])
      if (retRes.status === 'fulfilled' && retRes.value.success && Array.isArray(retRes.value.data)) {
        setReturnsList(retRes.value.data)
      }
      if (walRes.status === 'fulfilled' && walRes.value.success && Array.isArray(walRes.value.data)) {
        setWalletsList(walRes.value.data)
      }
    } catch {
      // Silent fallback
    }
  }

  useEffect(() => {
    fetchDashboardStats()
    fetchNotifications()
    fetchSupportSessions()
    fetchBookings()
    fetchReturnsAndWallets()
    fetchAnalytics(analyticsDaysRef.current)
    fetchPaymentOptions()

    const unsubscribeStream = adminApi.subscribeNotificationsStream(
      (incomingEvent) => {
        setNotificationsList((prev) => [
          incomingEvent,
          ...prev.filter((item) => item.id !== incomingEvent.id)
        ].slice(0, 60))

        const evtType = String(incomingEvent?.type || '')
        if (
          evtType === 'ORDER_PURCHASED' ||
          evtType === 'PAYMENT_CAPTURED' ||
          evtType === 'ORDER_STATUS_UPDATED' ||
          evtType === 'ORDER_CANCELLED' ||
          evtType === 'ORDER_REFUNDED' ||
          evtType === 'WALLET_DEBITED' ||
          evtType === 'USER_REGISTERED'
        ) {
          fetchDashboardStats()
          if (activeTabRef.current === 'orders') fetchOrders()
          if (activeTabRef.current === 'users') fetchUsers()
          if (activeTabRef.current === 'returns' || evtType === 'WALLET_DEBITED') fetchReturnsAndWallets()
        } else if (
          evtType === 'RETURN_REQUESTED' ||
          evtType === 'RETURN_WALLET_CREDITED' ||
          evtType === 'RETURN_EXCHANGE_APPROVED' ||
          evtType === 'RETURN_COMPLETED' ||
          evtType === 'RETURN_REJECTED'
        ) {
          fetchReturnsAndWallets()
        } else if (evtType === 'PRODUCT_BOOKING_CREATED' || evtType === 'PRODUCT_BOOKING_UPDATED') {
          fetchBookings()
        } else if (
          evtType === 'SUPPORT_INQUIRY' ||
          evtType === 'SUPPORT_REPLY' ||
          evtType === 'SUPPORT_STATUS_UPDATED'
        ) {
          fetchSupportSessions()
        } else if (
          (evtType === 'PRODUCT_CREATED' || evtType === 'PRODUCT_UPDATED' || evtType === 'PRODUCT_DELETED') &&
          activeTabRef.current === 'products'
        ) {
          fetchProducts()
        }
      },
      (connected) => {
        const wasDisconnected = !sseConnectedRef.current
        sseConnectedRef.current = connected
        setSseConnected(connected)
        if (connected && wasDisconnected) {
          fetchNotifications()
          fetchSupportSessions()
          if (activeTabRef.current === 'analytics') {
            fetchAnalytics(analyticsDaysRef.current)
          }
        }
      },
      (syncPayload) => {
        const synced = syncPayload?.session
        if (synced?.id) {
          setSupportSessions(prev => {
            const exists = prev.some(s => s.id === synced.id)
            const next = exists
              ? prev.map(s => (s.id === synced.id ? synced : s))
              : [synced, ...prev]
            return [...next].sort(
              (a, b) =>
                new Date(b.updatedAt || b.lastSeenAt).getTime() -
                new Date(a.updatedAt || a.lastSeenAt).getTime()
            )
          })
          setSelectedSessionId(prev => prev || synced.id)
        } else {
          fetchSupportSessions()
        }
      },
      (_analyticsPayload) => {
        if (analyticsRefreshTimerRef.current) return
        analyticsRefreshTimerRef.current = setTimeout(() => {
          analyticsRefreshTimerRef.current = null
          fetchAnalytics(analyticsDaysRef.current)
        }, 1200)
      },
      (paymentSyncPayload) => {
        if (paymentSyncPayload?.config) {
          syncPaymentOptionsState(paymentSyncPayload.config)
        } else {
          fetchPaymentOptions()
        }
      }
    )

    // Backup reconciliation poll (notifications polled only if SSE is disconnected; keep support presence timestamps fresh on Support tab)
    const interval = setInterval(() => {
      if (!sseConnectedRef.current) {
        fetchNotifications()
        fetchSupportSessions()
        if (activeTabRef.current === 'analytics') {
          fetchAnalytics(analyticsDaysRef.current)
        }
      } else if (activeTabRef.current === 'support') {
        fetchSupportSessions()
      }
    }, 20000)

    return () => {
      unsubscribeStream()
      clearInterval(interval)
      if (analyticsRefreshTimerRef.current) {
        clearTimeout(analyticsRefreshTimerRef.current)
      }
    }
  }, [])

  // Auto-scroll Admin Support chat thread when messages update or active session changes
  const activeSupportSessionForScroll = supportSessions.find(s => s.id === selectedSessionId)
  useEffect(() => {
    if (activeTab === 'support') {
      adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeTab, selectedSessionId, activeSupportSessionForScroll?.messages?.length])

  // Automatically clear unreadAdminCount whenever Admin is actively viewing an open conversation
  useEffect(() => {
    if (activeTab !== 'support' || !activeSupportSessionForScroll) return
    if ((activeSupportSessionForScroll.unreadAdminCount || 0) <= 0) {
      if (markingReadSessionRef.current === activeSupportSessionForScroll.id) {
        markingReadSessionRef.current = null
      }
      return
    }
    const targetId = activeSupportSessionForScroll.id
    if (markingReadSessionRef.current === targetId) return
    markingReadSessionRef.current = targetId

    adminApi.updateSupportSessionStatus(targetId, { markRead: true })
      .then(res => {
        if (res.success && res.data) {
          setSupportSessions(prev => prev.map(s => (s.id === targetId ? res.data! : s)))
        }
      })
      .catch(() => { })
      .finally(() => {
        markingReadSessionRef.current = null
      })
  }, [activeTab, activeSupportSessionForScroll?.id, activeSupportSessionForScroll?.unreadAdminCount])

  useEffect(() => {
    if (activeTab === 'products') fetchProducts()
    if (activeTab === 'orders') fetchOrders()
    if (activeTab === 'bookings') fetchBookings()
    if (activeTab === 'users') fetchUsers()
    if (activeTab === 'support') fetchSupportSessions()
    if (activeTab === 'analytics') fetchAnalytics(analyticsDays)
  }, [activeTab, orderFilter, analyticsDays])

  const notify = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text })
    setTimeout(() => setActionMessage(null), 4000)
  }

  const formatPrice = (price: number) => `$${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // 1. Fetch Dashboard Stats
  const fetchDashboardStats = async () => {
    try {
      setIsLoading(true)
      const res = await adminApi.getDashboardStats()
      if (res.success && res.data) {
        setStats({
          totalProducts: res.data.totalProducts || 0,
          totalOrders: res.data.totalOrders || 0,
          totalRevenue: res.data.totalRevenue || 0,
          totalUsers: res.data.totalUsers || 0,
          recentOrders: res.data.recentOrders || [],
        })
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to fetch dashboard stats')
    } finally {
      setIsLoading(false)
    }
  }

  // 2. Fetch Products
  const fetchProducts = async () => {
    try {
      setIsLoading(true)
      const res = await adminApi.getProducts()
      if (res.success && res.data) {
        setProductsList(res.data)
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load products')
    } finally {
      setIsLoading(false)
    }
  }

  // 3. Fetch Orders
  const fetchOrders = async () => {
    try {
      setIsLoading(true)
      const currentFilter = orderFilterRef.current
      const apiStatus = currentFilter === 'ALL' || currentFilter === 'PENDING_MANUAL' ? undefined : (currentFilter as any)
      const res = await adminApi.getAllOrders(apiStatus ? { status: apiStatus } : undefined)
      if (res.success && res.data) {
        const list =
          currentFilter === 'PENDING_MANUAL'
            ? res.data.filter(
                (o: any) =>
                  o.paymentStatus === 'PENDING' &&
                  ['BANK_DEPOSIT', 'CRYPTO', 'INVOICE', 'CHEQUE', 'CUSTOM'].includes(o.paymentMethod)
              )
            : res.data
        setOrdersList(list)
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load orders')
    } finally {
      setIsLoading(false)
    }
  }

  // 4. Fetch Users
  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      const res = await adminApi.getUsers()
      if (res.success && res.data) {
        setUsersList(res.data)
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle direct file upload through adminApi (supports multiple images & video)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    const files = Array.from(fileList)

    try {
      setIsUploadingImage(true)
      const res = await adminApi.uploadImages(files)
      if (res.success && res.data?.urls) {
        const uploadedUrls = res.data.urls
        setProductForm(prev => {
          const combined = [...prev.images, ...uploadedUrls]
          return {
            ...prev,
            images: combined,
            imageUrl: combined[0] || prev.imageUrl
          }
        })
        notify('success', `Uploaded ${uploadedUrls.length} media file(s) successfully`)
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to upload media file(s)')
    } finally {
      setIsUploadingImage(false)
      e.target.value = ''
    }
  }

  const removeImage = (indexToRemove: number) => {
    setProductForm(prev => {
      const nextImages = prev.images.filter((_, idx) => idx !== indexToRemove)
      return {
        ...prev,
        images: nextImages,
        imageUrl: nextImages[0] || ''
      }
    })
  }

  const setPrimaryImage = (index: number) => {
    setProductForm(prev => {
      const item = prev.images[index]
      const remaining = prev.images.filter((_, idx) => idx !== index)
      const reordered = [item, ...remaining]
      return {
        ...prev,
        images: reordered,
        imageUrl: item
      }
    })
  }

  // Handle Product Save (Create / Update)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const allImages = productForm.images.length > 0
        ? productForm.images
        : (productForm.imageUrl ? [productForm.imageUrl] : ['/images/hero1.jpeg'])

      const payload: Partial<Product> = {
        name: productForm.name,
        description: productForm.description,
        price: parseFloat(productForm.price),
        originalPrice: productForm.originalPrice ? parseFloat(productForm.originalPrice) : undefined,
        sku: productForm.sku,
        stock: parseInt(productForm.stock, 10) || 0,
        category: productForm.category,
        brand: productForm.brand || 'DriveFlyElectric',
        images: allImages,
        isNew: productForm.isNew,
        isComingSoon: Boolean(productForm.isComingSoon),
        comingSoonRelease: productForm.isComingSoon
          ? (productForm.comingSoonRelease.trim() || null)
          : null,
        averageDeliveryTime: productForm.deliveryTime || '12-21 business days (Worldwide Express Dispatch)',
        isActive: true,
      }

      if (editingProductId) {
        const res = await adminApi.updateProduct(editingProductId, payload)
        if (res.success) {
          notify('success', 'Product updated successfully in catalog')
          setIsProductModalOpen(false)
          fetchProducts()
          fetchGlobalProducts()
          fetchDashboardStats()
        }
      } else {
        const res = await adminApi.createProduct(payload)
        if (res.success) {
          notify('success', 'New product created and added to live store catalog')
          setIsProductModalOpen(false)
          fetchProducts()
          fetchGlobalProducts()
          fetchDashboardStats()
        }
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to save product')
    }
  }

  // Handle Product Delete
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return
    try {
      const res = await adminApi.deleteProduct(id)
      if (res.success) {
        notify('success', `Product "${name}" deleted`)
        fetchProducts()
        fetchGlobalProducts()
        fetchDashboardStats()
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to delete product')
    }
  }

  // Open Edit Product Modal
  const openEditModal = (product: Product) => {
    setEditingProductId(product.id)
    const imgs = product.images && product.images.length > 0 ? product.images : []
    const normalizedCat =
      product.category && product.category.toLowerCase().includes('heli')
        ? 'mini-helicopter'
        : product.category || 'Microcars'
    setProductForm({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      originalPrice: product.originalPrice ? product.originalPrice.toString() : '',
      sku: product.sku,
      stock: product.stock.toString(),
      category: normalizedCat,
      brand: product.brand || 'DriveFlyElectric',
      imageUrl: imgs[0] || '',
      images: imgs,
      isNew: product.isNew,
      isComingSoon: Boolean(product.isComingSoon),
      comingSoonRelease: product.comingSoonRelease || '',
      topSpeed: '60 km/h',
      range: '70 km',
      deliveryTime: product.averageDeliveryTime || '12-21 business days (Worldwide Express Dispatch)',
    })
    setIsProductModalOpen(true)
  }

  // Open Add Product Modal
  const openAddModal = () => {
    setEditingProductId(null)
    setProductForm({
      name: '',
      description: '',
      price: '',
      originalPrice: '',
      sku: `DFE-${Math.floor(1000 + Math.random() * 9000)}`,
      stock: '20',
      category: 'Microcars',
      brand: 'DriveFlyElectric',
      imageUrl: '',
      images: [],
      isNew: true,
      isComingSoon: false,
      comingSoonRelease: '',
      topSpeed: '65 km/h',
      range: '70 km',
      deliveryTime: '12-21 business days (Worldwide Express Dispatch)',
    })
    setIsProductModalOpen(true)
  }

  // Handle Coming Soon Booking Status Update
  const handleUpdateBookingStatus = async (bookingId: string, nextStatus: ProductBooking['status']) => {
    try {
      const res = await adminApi.updateBookingStatus(bookingId, nextStatus)
      if (res.success) {
        notify('success', `Booking status updated to ${nextStatus}`)
        fetchBookings()
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to update booking status')
    }
  }

  // Handle Order Status Update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const res = await adminApi.updateOrderStatus(orderId, newStatus)
      if (res.success) {
        notify('success', `Order status updated to ${newStatus}`)
        fetchOrders()
        fetchDashboardStats()
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to update order status')
    }
  }

  // Handle Manual Payment Approval (Bank Deposit, Crypto, Invoice, Cheque, Custom)
  const handleApproveManualPayment = async (orderId: string, orderNumber?: string) => {
    if (processingManualOrderId) return
    try {
      setProcessingManualOrderId(orderId)
      const res = await adminApi.approveManualPayment(orderId)
      if (res.success) {
        notify('success', res.message || `Manual payment approved for #${orderNumber || orderId}.`)
        await Promise.all([fetchOrders(), fetchDashboardStats()])
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to approve manual payment')
    } finally {
      setProcessingManualOrderId(null)
    }
  }

  // Handle Manual Payment Rejection
  const handleRejectManualPayment = async (orderId: string, orderNumber?: string) => {
    if (processingManualOrderId) return
    const reason = window.prompt(`Optional reason for rejecting manual payment for #${orderNumber || orderId}:`)
    if (reason === null) return
    try {
      setProcessingManualOrderId(orderId)
      const res = await adminApi.rejectManualPayment(orderId, reason.trim() || undefined)
      if (res.success) {
        notify('success', res.message || `Manual payment rejected for #${orderNumber || orderId}.`)
        await Promise.all([fetchOrders(), fetchDashboardStats()])
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to reject manual payment')
    } finally {
      setProcessingManualOrderId(null)
    }
  }

  // Handle User Status Toggle
  const handleToggleUserStatus = async (userId: string, currentActive: boolean) => {
    try {
      const res = await adminApi.updateUserStatus(userId, !currentActive)
      if (res.success) {
        notify('success', `User status ${!currentActive ? 'activated' : 'disabled'}`)
        fetchUsers()
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to toggle user status')
    }
  }

  // Handle selecting a support chat session (auto-read effect clears unread count when active)
  const handleSelectSupportSession = (session: SupportSession) => {
    setSelectedSessionId(session.id)
  }

  // Handle Return & Exchange processing (Same-Day Instant Wallet Refund, Catalog Exchange, Complete, Reject)
  const handleProcessReturn = async (
    retId: string,
    action: 'APPROVE_SAME_DAY_WALLET_REFUND' | 'APPROVE_EXCHANGE' | 'MARK_RETURN_RECEIVED_COMPLETE' | 'REJECT'
  ) => {
    try {
      setProcessingReturnId(retId)
      const res = await adminApi.processReturn(retId, {
        action,
        adminNotes: returnNotesDrafts[retId]?.trim() || undefined,
        returnTrackingNumber: returnTrackingDrafts[retId]?.trim() || undefined
      })
      if (!res.success) {
        throw new Error(res.error || 'Could not process return request.')
      }
      notify('success', res.message || 'Return request processed successfully')
      await Promise.all([fetchReturnsAndWallets(), fetchOrders(), fetchDashboardStats()])
    } catch (err: any) {
      notify('error', err?.message || 'Unable to process return request')
    } finally {
      setProcessingReturnId(null)
    }
  }

  const handleSubmitWalletAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustWalletModal || adjustingWalletSubmitting) return
    const amt = Number(adjustWalletModal.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      notify('error', 'Enter a positive USD amount to adjust wallet balance.')
      return
    }
    try {
      setAdjustingWalletSubmitting(true)
      const res = await adminApi.adjustWallet(adjustWalletModal.userId, {
        direction: adjustWalletModal.direction,
        amount: amt,
        description: adjustWalletModal.description.trim()
      })
      if (!res.success) {
        throw new Error(res.error || 'Wallet adjustment failed.')
      }
      notify('success', res.message || 'Customer wallet balance updated.')
      setAdjustWalletModal(null)
      await fetchReturnsAndWallets()
    } catch (err: any) {
      notify('error', err?.message || 'Unable to adjust wallet balance')
    } finally {
      setAdjustingWalletSubmitting(false)
    }
  }

  // Handle sending Admin reply to Client LiveChat
  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSessionId || !adminReplyText.trim() || isSendingReply) return
    try {
      setIsSendingReply(true)
      const res = await adminApi.replySupportSession(selectedSessionId, adminReplyText.trim())
      if (res.success && res.data) {
        setAdminReplyText('')
        setSupportSessions(prev => prev.map(s => (s.id === selectedSessionId ? res.data! : s)))
        notify('success', 'Support reply delivered to client LiveChat')
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to send reply')
    } finally {
      setIsSendingReply(false)
    }
  }

  // Handle toggling support session status (OPEN / RESOLVED)
  const handleToggleSupportStatus = async (sessionId: string, currentStatus: 'OPEN' | 'RESOLVED') => {
    const nextStatus = currentStatus === 'OPEN' ? 'RESOLVED' : 'OPEN'
    try {
      const res = await adminApi.updateSupportSessionStatus(sessionId, { status: nextStatus, markRead: true })
      if (res.success && res.data) {
        setSupportSessions(prev => prev.map(s => (s.id === sessionId ? res.data! : s)))
        notify('success', `Support ticket marked as ${nextStatus}`)
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to update support session status')
    }
  }

  // Build standardized OrderReceiptData from a database Order object
  const buildOrderReceipt = (ord: any): OrderReceiptData => {
    const orderDateStr = ord.createdAt
      ? new Date(ord.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })

    const addr = ord.shippingAddress
    let formattedAddress = 'Express Shipping to Destination on File'
    if (addr && (addr.address1 || addr.city)) {
      formattedAddress = `${addr.address1 || ''}${addr.address2 ? `, ${addr.address2}` : ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zipCode || ''}, ${addr.country || 'United States'}`
    } else if (ord.notes && ord.notes.includes('Delivery to ')) {
      const match = ord.notes.match(/Delivery to ([^.]+)/)
      if (match?.[1]) {
        formattedAddress = `${match[1]}, United States`
      }
    }

    const customerName =
      (addr && `${addr.firstName || ''} ${addr.lastName || ''}`.trim()) ||
      (ord.user && `${ord.user.firstName || ''} ${ord.user.lastName || ''}`.trim()) ||
      ord.user?.email ||
      'Valued Customer'

    const txnMatch = ord.notes ? ord.notes.match(/\(([^)]+)\)\s*$/) : null
    const transactionId = ord.paymentId || txnMatch?.[1] || `TXN-${ord.orderNumber || ord.id}`

    const paymentSource =
      ord.paymentMethod === 'STRIPE'
        ? 'Credit / Debit Card (Stripe)'
        : ord.paymentMethod === 'PAYPAL'
          ? 'PayPal Express'
          : ord.paymentMethod === 'WALLET'
            ? 'DriveFlyElectric Wallet Balance'
            : ord.paymentMethod === 'WALLET_STRIPE'
              ? 'DriveFlyElectric Wallet + Stripe Card'
              : ord.paymentMethod === 'WALLET_PAYPAL'
                ? 'DriveFlyElectric Wallet + PayPal Express'
                : ord.paymentMethod || 'Credit / Debit Card (Stripe)'

    const initialChargeVal = Number(ord.subtotal || ord.total || 0)
    const finalCostVal = Number(ord.total || 0)
    const walletUsedVal = Number(ord.walletAmountUsed || 0)
    const isRefunded = ord.status === 'REFUNDED' || ord.paymentStatus === 'REFUNDED'

    return {
      date: orderDateStr,
      orderDate: orderDateStr,
      orderNumber: ord.orderNumber || ord.id,
      trackingNumber: ord.trackingNumber || `TRK-${ord.orderNumber || ord.id}`,
      transactionId,
      userName: customerName,
      address: formattedAddress,
      paymentSource,
      ...(walletUsedVal > 0 ? { walletApplied: formatPrice(walletUsedVal) } : {}),
      initialCharge: formatPrice(initialChargeVal),
      finalCost: formatPrice(finalCostVal),
      totalRefund: isRefunded ? formatPrice(finalCostVal) : '$0.00',
      refundTrans: 'N/A',
      shippingCost: Number(ord.shipping || 0) === 0 ? '$0.00 (Free Shipping)' : formatPrice(Number(ord.shipping || 0)),
      tax: formatPrice(Number(ord.tax || 0)),
      items: Array.isArray(ord.items)
        ? ord.items.map((item: any) => ({
            name: item.product?.name || 'High-Performance Vehicle',
            quantity: item.quantity || 1,
            price: formatPrice(Number(item.price || 0)),
            total: formatPrice(Number(item.total || Number(item.price || 0) * (item.quantity || 1)))
          }))
        : []
    }
  }

  const handleDownloadOrderReceipt = (ord: any) => {
    const receiptData = buildOrderReceipt(ord)
    downloadReceiptPdf(receiptData)
    notify('success', `Generated & downloaded PDF receipt (Receipt-${receiptData.orderNumber}.pdf)`)
  }

  const handleCopyOrderReceipt = async (ord: any) => {
    try {
      const receiptData = buildOrderReceipt(ord)
      await navigator.clipboard.writeText(generateReceiptText(receiptData))
      setCopiedOrderId(ord.id)
      setTimeout(() => setCopiedOrderId(null), 2000)
    } catch {
      notify('error', 'Failed to copy receipt summary')
    }
  }

  return (
    <div className="pt-20 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-creamy-500 uppercase tracking-widest mb-1">
              <span>DriveFlyElectric</span>
              <span>•</span>
              <span>Operations HQ</span>
              {user && (
                <>
                  <span>•</span>
                  <span className="text-gray-400 normal-case font-medium">{user.email}</span>
                </>
              )}
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-gray-900 dark:text-white font-anton">
              Management Dashboard
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Catalog administration, order fulfillment, customer accounts, and live support.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchDashboardStats()
                fetchBookings()
                fetchPaymentOptions()
                if (activeTab === 'products') fetchProducts()
                if (activeTab === 'orders') fetchOrders()
                if (activeTab === 'users') fetchUsers()
                if (activeTab === 'support') fetchSupportSessions()
                if (activeTab === 'analytics') fetchAnalytics(analyticsDays)
              }}
              className="p-2.5 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-xl text-gray-600 dark:text-gray-300 hover:text-creamy-500 shadow-sm transition-colors"
              title="Refresh Data"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-creamy-500' : ''}`} />
            </button>
            <button
              onClick={openAddModal}
              className="bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-creamy-500/20 flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create Item & Upload</span>
            </button>
          </div>
        </div>

        {/* Action / Notification Banner */}
        {actionMessage && (
          <div
            className={`mb-6 p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-neutral-800 mb-8 space-x-8 overflow-x-auto">
          {[
            { id: 'overview', label: 'Store Overview', icon: TrendingUp },
            { id: 'products', label: 'Fleet Products', icon: Package },
            { id: 'orders', label: 'Orders & Settlements', icon: ShoppingBag },
            {
              id: 'returns',
              label: 'Returns & Wallets',
              icon: RotateCcw,
              badge: returnsList.filter(r => r.status === 'PENDING_REVIEW').length
            },
            {
              id: 'bookings',
              label: 'Bookings',
              icon: CalendarClock,
              badge: bookingsList.filter(b => b.status === 'PENDING').length
            },
            { id: 'users', label: 'User Accounts', icon: Users },
            {
              id: 'support',
              label: 'Support',
              icon: MessageSquare,
              badge: supportSessions.reduce((acc, s) => acc + (s.unreadAdminCount || 0), 0)
            },
            { id: 'analytics', label: 'Traffic & Analytics', icon: BarChart3 },
          ].map((tab: any) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 px-1 text-xs font-black uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${isActive
                  ? 'border-creamy-500 text-creamy-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Total Catalog Rigs</span>
                  <div className="w-9 h-9 rounded-xl bg-creamy-500/10 text-creamy-500 flex items-center justify-center">
                    <Package className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900 dark:text-white font-anton">{stats.totalProducts}</p>
                <span className="text-[10px] text-emerald-500 font-bold mt-1 inline-block">Active & in live catalog</span>
              </div>

              <div className="bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Completed Orders</span>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900 dark:text-white font-anton">{stats.totalOrders}</p>
                <span className="text-[10px] text-blue-500 font-bold mt-1 inline-block">Stripe &amp; PayPal Transactions</span>
              </div>

              <div className="bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Settled Revenue</span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-3xl font-black text-creamy-500 font-anton">{formatPrice(stats.totalRevenue)}</p>
                <span className="text-[10px] text-emerald-500 font-bold mt-1 inline-block">Currency: USD ($)</span>
              </div>

              <div className="bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Active Accounts</span>
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900 dark:text-white font-anton">{stats.totalUsers || 1}</p>
                <span className="text-[10px] text-purple-500 font-bold mt-1 inline-block">Verified Member Accounts</span>
              </div>
            </div>

            {/* Quick Actions & Store Config Note */}
            <div className="bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-anton text-lg uppercase text-gray-900 dark:text-white">DriveFlyElectric — Operations &amp; Global Fulfillment</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  HQ: 1000 DriveFly Electric Way, Suite 400, Austin, TX 78701, United States.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('products')}
                className="bg-creamy-500 hover:bg-creamy-400 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider"
              >
                Manage Fleet Catalog
              </button>
            </div>

            {/* Checkout Payment Options Availability Controls */}
            {(() => {
              const gatewayCards = [
                {
                  key: 'paypal' as const,
                  title: 'PayPal & Debit/Credit Card Fields',
                  subtitle: 'PayPal Express Wallet + Expanded Hosted Card Fields',
                  badgeLabel: 'PAYPAL',
                  badgeClass: 'bg-[#003087] text-white',
                  entry: paymentOptions?.paypal || {
                    available: true,
                    notice: 'PayPal checkout is currently unavailable. Please do not use this option — select another active payment method below.'
                  }
                },
                {
                  key: 'stripe' as const,
                  title: 'Credit or Debit Card (Stripe Gateway)',
                  subtitle: 'Stripe Hosted Card Elements with 3D-Secure verification',
                  badgeLabel: 'STRIPE',
                  badgeClass: 'bg-emerald-600 text-white',
                  entry: paymentOptions?.stripe || {
                    available: true,
                    notice: 'Credit or Debit Card (Stripe Gateway) is currently unavailable. Please do not use this option — select another active payment method below.'
                  }
                }
              ]
              const unavailableCount = gatewayCards.filter(g => !g.entry.available).length

              return (
                <div className="bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-neutral-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CreditCard className="w-5 h-5 text-creamy-500" />
                        <h3 className="font-anton text-lg uppercase text-gray-900 dark:text-white">
                          Checkout Payment Options Availability
                        </h3>
                        {unavailableCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/15 text-red-500 border border-red-500/30">
                            <ShieldAlert className="w-3 h-3" />
                            {unavailableCount === 2 ? 'All Payment Options Marked Unavailable' : '1 Option Marked Unavailable'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                            All Gateways Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Toggle any checkout payment method as Unavailable to display a &ldquo;Do Not Use&rdquo; alert in Checkout and block new attempts.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {gatewayCards.map(({ key, title, subtitle, badgeLabel, badgeClass, entry }) => {
                      const isAvailable = entry.available
                      const isSaving = savingPaymentGateway === key
                      const draftNotice = paymentNoticeDrafts[key] ?? entry.notice

                      return (
                        <div
                          key={key}
                          className={`p-4 rounded-xl border transition-colors space-y-3.5 ${
                            isAvailable
                              ? 'border-gray-200 dark:border-neutral-800 bg-gray-50/70 dark:bg-[#1a1d24]'
                              : 'border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
                                  {badgeLabel}
                                </span>
                                <p className="font-bold text-sm text-gray-900 dark:text-white">{title}</p>
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>
                            </div>

                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => updatePaymentGatewaySetting(key, !isAvailable, draftNotice)}
                              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                                isAvailable
                                  ? 'bg-red-500/10 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white border border-red-500/30'
                                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-sm'
                              } disabled:opacity-50`}
                            >
                              {isSaving
                                ? 'Saving...'
                                : isAvailable
                                ? 'Set Unavailable'
                                : 'Re-Enable Option'}
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span
                              className={`font-bold ${
                                isAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              Status: {isAvailable ? 'Available for Checkout' : 'UNAVAILABLE — Shoppers Notified Not to Use'}
                            </span>
                            {entry.updatedAt && (
                              <span className="text-[10px] text-gray-400">
                                Updated {new Date(entry.updatedAt).toLocaleString()}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Checkout Warning Message (shown when unavailable)
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={draftNotice}
                                onChange={(e) =>
                                  setPaymentNoticeDrafts(prev => ({ ...prev, [key]: e.target.value }))
                                }
                                placeholder="Tell customers why this payment method should not be used..."
                                className="flex-1 px-3 py-2 text-xs rounded-lg bg-white dark:bg-[#12141a] border border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-creamy-500"
                              />
                              <button
                                type="button"
                                disabled={isSaving || draftNotice.trim() === (entry.notice || '').trim()}
                                onClick={() => updatePaymentGatewaySetting(key, isAvailable, draftNotice)}
                                className="px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider bg-gray-900 dark:bg-creamy-500 text-white dark:text-black disabled:opacity-40 hover:opacity-90 transition-opacity whitespace-nowrap"
                              >
                                Save Notice
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Live Store Activity & Email Dispatch Feed */}
            <div className="bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                    <h3 className="font-anton text-lg uppercase text-gray-900 dark:text-white">
                      Live Store Activity &amp; Email Dispatch Feed
                    </h3>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      sseConnected
                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}>
                      {sseConnected ? 'SSE Live' : 'Polling Fallback'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Real-time stream for purchases, refunds, payment alerts, reviews, bookings, support inquiries, catalog updates, and customer accounts.
                  </p>
                </div>
                <button
                  onClick={fetchNotifications}
                  className="text-xs font-bold text-creamy-500 hover:text-creamy-400 px-3 py-1.5 rounded-lg border border-creamy-500/30 bg-creamy-500/10"
                >
                  Sync Feed
                </button>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-80 overflow-y-auto">
                {notificationsList.length === 0 && stats.recentOrders.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    Monitoring live store activity. Purchase notifications, payment authorizations, support inquiries, reviews, and account alerts will appear here in real time.
                  </div>
                ) : (
                  <>
                    {notificationsList.map((act: any) => {
                      const typeStr = String(act.type || 'ACTIVITY')
                      const badgeClass =
                        typeStr === 'ORDER_PURCHASED' || typeStr === 'PAYMENT_CAPTURED' || typeStr === 'PRODUCT_REVIEW_SUBMITTED' || typeStr === 'MANUAL_PAYMENT_APPROVED'
                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                          : typeStr === 'PAYMENT_AUTHORIZED'
                          ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                          : typeStr === 'PAYMENT_FAILED' || typeStr === 'ORDER_CANCELLED' || typeStr === 'ORDER_REFUNDED' || typeStr === 'PRODUCT_DELETED' || typeStr === 'MANUAL_PAYMENT_REJECTED'
                          ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                          : typeStr === 'SUPPORT_INQUIRY' || typeStr === 'SUPPORT_REPLY' || typeStr === 'SUPPORT_STATUS_UPDATED'
                          ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                          : typeStr === 'PRODUCT_BOOKING_CREATED' || typeStr === 'PRODUCT_BOOKING_UPDATED' || typeStr === 'PRODUCT_BOOKING' || typeStr === 'CART_REMINDER_SENT' || typeStr === 'MANUAL_PAYMENT_SUBMITTED'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : typeStr === 'USER_REGISTERED' || typeStr === 'USER_LOGIN' || typeStr === 'USER_STATUS_UPDATED'
                          ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          : 'bg-creamy-500/15 text-creamy-500 border border-creamy-500/30'

                      const isBookingEvent =
                        typeStr === 'PRODUCT_BOOKING_CREATED' ||
                        typeStr === 'PRODUCT_BOOKING_UPDATED' ||
                        typeStr === 'PRODUCT_BOOKING'

                      return (
                        <div key={act.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-gray-50/50 dark:hover:bg-[#191b22]">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${badgeClass}`}>
                                {typeStr.replace(/_/g, ' ')}
                              </span>
                              <p className="text-xs font-bold text-gray-900 dark:text-white">{act.title}</p>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{act.message}</p>
                          </div>
                          <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                            {(typeStr === 'SUPPORT_INQUIRY' || typeStr === 'SUPPORT_REPLY' || typeStr === 'SUPPORT_STATUS_UPDATED') && act.metadata?.sessionId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSessionId(act.metadata.sessionId)
                                  setActiveTab('support')
                                }}
                                className="px-2.5 py-1 rounded-lg bg-creamy-500 hover:bg-creamy-400 text-black font-black text-[10px] uppercase tracking-wider"
                              >
                                Reply in Support
                              </button>
                            )}
                            {isBookingEvent && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('bookings')}
                                className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-black text-[10px] uppercase tracking-wider"
                              >
                                View Booking
                              </button>
                            )}
                            {(typeStr === 'ORDER_PURCHASED' || typeStr === 'ORDER_CANCELLED' || typeStr === 'ORDER_REFUNDED' || typeStr === 'MANUAL_PAYMENT_SUBMITTED' || typeStr === 'MANUAL_PAYMENT_APPROVED' || typeStr === 'MANUAL_PAYMENT_REJECTED') && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('orders')}
                                className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-800 dark:text-gray-200 font-black text-[10px] uppercase tracking-wider"
                              >
                                View Orders
                              </button>
                            )}
                            <div className="text-right">
                              <span className="text-[10px] font-mono text-gray-400 block">
                                {new Date(act.timestamp).toLocaleTimeString()}
                              </span>
                              <span className={`text-[10px] font-bold ${
                                typeStr === 'PAYMENT_FAILED'
                                  ? 'text-red-400'
                                  : act.emailDispatched || act.systemMailDispatched
                                  ? 'text-emerald-500'
                                  : 'text-gray-400'
                              }`}>
                                {act.emailDispatched && act.systemMailDispatched
                                  ? 'User + System Emailed'
                                  : act.emailDispatched
                                  ? 'Customer Emailed'
                                  : act.systemMailDispatched
                                  ? 'Alert Emailed'
                                  : 'Recorded'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {stats.recentOrders.map((ord: any) => (
                      <div key={`recent-${ord.id}`} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-gray-50/50 dark:hover:bg-[#191b22]">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                              SETTLED ORDER
                            </span>
                            <p className="text-xs font-bold text-gray-900 dark:text-white font-mono">
                              #{ord.orderNumber} • {formatPrice(ord.total)}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Customer: {ord.user?.email || 'Valued Customer'} • Method: {ord.paymentMethod || 'STRIPE'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadOrderReceipt(ord)}
                            className="inline-flex items-center gap-1.5 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-[10px] px-3 py-1.5 rounded-lg shadow-sm cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Receipt (.pdf)</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: PRODUCTS MANAGEMENT */}
        {activeTab === 'products' && (() => {
          const comingSoonCount = productsList.filter(p => Boolean(p.isComingSoon)).length
          const visibleProducts = productsList.filter(p => {
            if (productStatusFilter === 'COMING_SOON') return Boolean(p.isComingSoon)
            if (productStatusFilter === 'AVAILABLE') return !p.isComingSoon
            return true
          })

          return (
            <div className="bg-white dark:bg-[#16181e] rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white font-anton">Fleet Products Catalog</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Total {productsList.length} items ({comingSoonCount} marked Coming Soon). Create, categorize, update prices, or upload media directly.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden bg-gray-50 dark:bg-[#1a1d24]">
                    {[
                      { id: 'ALL', label: `All (${productsList.length})` },
                      { id: 'AVAILABLE', label: `In Store (${productsList.length - comingSoonCount})` },
                      { id: 'COMING_SOON', label: `Coming Soon (${comingSoonCount})` },
                    ].map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setProductStatusFilter(pill.id as any)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                          productStatusFilter === pill.id
                            ? pill.id === 'COMING_SOON'
                              ? 'bg-amber-400 text-black'
                              : 'bg-creamy-500 text-black'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={openAddModal}
                    className="bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Upload New Product</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-[#1f222a] text-gray-400 text-[11px] uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-6 py-3.5">Product &amp; Image</th>
                      <th className="px-6 py-3.5">SKU / Categorization</th>
                      <th className="px-6 py-3.5">USD Price</th>
                      <th className="px-6 py-3.5">Stock</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                    {visibleProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                          {productsList.length === 0
                            ? 'No products found. Click "Upload New Product" to add.'
                            : 'No items match the selected filter.'}
                        </td>
                      </tr>
                    ) : (
                      visibleProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-[#191b22] transition-colors">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-neutral-800 overflow-hidden flex-shrink-0 border border-gray-200 dark:border-neutral-700">
                              {p.images && p.images.length > 0 ? (
                                isVideoMedia(p.images[0]) ? (
                                  <video
                                    src={getSafeMediaUrl(p.images[0])}
                                    className="w-full h-full object-cover"
                                    muted
                                    playsInline
                                  />
                                ) : (
                                  <img
                                    src={getSafeMediaUrl(p.images[0])}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement
                                      target.src = '/images/hero1.jpeg'
                                    }}
                                  />
                                )
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">
                                  No img
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 dark:text-white truncate max-w-xs text-xs">{p.name}</p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="text-[11px] text-gray-400">{p.brand || 'DriveFlyElectric'}</span>
                                {p.isComingSoon && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-500 border border-amber-400/40">
                                    <Sparkles className="w-2.5 h-2.5" />
                                    Coming Soon
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <p className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{p.sku}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span className="text-[10px] text-creamy-500 uppercase font-black px-2 py-0.5 rounded bg-creamy-500/10">
                                {p.category}
                              </span>
                              {p.isComingSoon && (
                                <span className="text-[10px] text-black uppercase font-black px-2 py-0.5 rounded bg-amber-400">
                                  Coming Soon{p.comingSoonRelease ? ` • ${p.comingSoonRelease}` : ''}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4 font-black text-gray-900 dark:text-creamy-400">
                            {formatPrice(p.price)}
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                                p.isComingSoon
                                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                                  : p.stock > 10
                                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                              }`}
                            >
                              {p.isComingSoon ? 'Pre-Book Only' : `${p.stock} units`}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => openEditModal(p)}
                              className="p-1.5 text-gray-500 hover:text-creamy-500 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id, p.name)}
                              className="p-1.5 text-red-500 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* Tab 3: ORDERS MANAGEMENT */}
        {activeTab === 'orders' && (
          <div className="bg-white dark:bg-[#16181e] rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white font-anton">Orders & Settlements</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automatic settlements (Wallet, Stripe, PayPal) and Manual Payment orders awaiting Admin verification.</p>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-semibold">Status:</span>
                <select
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-gray-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING_MANUAL">Pending Manual Approvals</option>
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="SHIPPED">Shipped</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="REFUNDED">Refunded</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-[#1f222a] text-gray-400 text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-6 py-3.5">Order Ref</th>
                    <th className="px-6 py-3.5">Customer</th>
                    <th className="px-6 py-3.5">Total Amount</th>
                    <th className="px-6 py-3.5">Method</th>
                    <th className="px-6 py-3.5">Status Update</th>
                    <th className="px-6 py-3.5 text-right">Purchase Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {ordersList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                        No orders recorded yet.
                      </td>
                    </tr>
                  ) : (
                    ordersList.map((ord: any) => {
                      const isManualMethod = ['BANK_DEPOSIT', 'CRYPTO', 'INVOICE', 'CHEQUE', 'CUSTOM'].includes(ord.paymentMethod)
                      const needsManualVerification =
                        isManualMethod && ord.paymentStatus !== 'COMPLETED' && ord.status !== 'CANCELLED' && ord.status !== 'REFUNDED'
                      const refMatch = typeof ord.notes === 'string' ? ord.notes.match(/\[Payment Reference:\s*([^\]]+)\]/i) : null
                      const paymentRefText = refMatch?.[1]?.trim() || ord.paymentId

                      return (
                      <tr key={ord.id} className={`hover:bg-gray-50/60 dark:hover:bg-[#191b22] transition-colors ${needsManualVerification ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="font-mono font-bold text-gray-900 dark:text-white text-xs">#{ord.orderNumber}</p>
                          <p className="font-mono text-[10px] font-bold text-creamy-500 mt-0.5">
                            {ord.trackingNumber || `TRK-${ord.orderNumber}`}
                          </p>
                          <span className="text-[11px] text-gray-400">
                            {new Date(ord.createdAt).toLocaleDateString()}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900 dark:text-white text-xs">
                            {ord.user ? `${ord.user.firstName || ''} ${ord.user.lastName || ''}` : 'Customer'}
                          </p>
                          <span className="text-[11px] text-gray-500">{ord.user?.email || 'Guest checkout'}</span>
                        </td>

                        <td className="px-6 py-4 font-black text-creamy-500">
                          {formatPrice(ord.total)}
                        </td>

                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <span className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                              isManualMethod
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
                            }`}>
                              {ord.paymentMethod || 'STRIPE'}
                            </span>
                            {needsManualVerification && (
                              <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                Awaiting Verification
                              </span>
                            )}
                            {isManualMethod && paymentRefText && (
                              <span className="block font-mono text-[10px] text-gray-500 dark:text-gray-400 max-w-[160px] truncate" title={paymentRefText}>
                                Ref: {paymentRefText}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="space-y-2">
                            <select
                              value={ord.status}
                              onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value as any)}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500"
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="PROCESSING">PROCESSING</option>
                              <option value="SHIPPED">SHIPPED</option>
                              <option value="DELIVERED">DELIVERED</option>
                              <option value="CANCELLED">CANCELLED</option>
                              <option value="REFUNDED">REFUNDED</option>
                            </select>

                            {needsManualVerification && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={processingManualOrderId === ord.id}
                                  onClick={() => handleApproveManualPayment(ord.id, ord.orderNumber)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black uppercase tracking-wider text-[10px] transition-colors"
                                >
                                  {processingManualOrderId === ord.id ? 'Working...' : 'Approve & Settle'}
                                </button>
                                <button
                                  type="button"
                                  disabled={processingManualOrderId === ord.id}
                                  onClick={() => handleRejectManualPayment(ord.id, ord.orderNumber)}
                                  className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white border border-red-500/30 disabled:opacity-50 font-black uppercase tracking-wider text-[10px] transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleDownloadOrderReceipt(ord)}
                              className="inline-flex items-center gap-1.5 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-[11px] px-3 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
                              title="Download Generated Purchase Receipt (.pdf)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download Receipt (.pdf)</span>
                            </button>
                            <button
                              onClick={() => setSelectedReceiptOrder(ord)}
                              className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-200 font-bold text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 transition-colors cursor-pointer"
                              title="Preview Receipt Details"
                            >
                              <FileText className="w-3.5 h-3.5 text-creamy-500" />
                              <span>View</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3b: COMING SOON BOOKINGS MANAGEMENT */}
        {activeTab === 'bookings' && (() => {
          const filteredBookings = bookingsList.filter((b) =>
            bookingStatusFilter === 'ALL' ? true : b.status === bookingStatusFilter
          )
          return (
            <div className="bg-white dark:bg-[#16181e] rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white font-anton">
                    Coming Soon Vehicle Bookings
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Priority pre-booking submissions from the storefront Coming Soon showcase.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-semibold">Status:</span>
                  <select
                    value={bookingStatusFilter}
                    onChange={(e) => setBookingStatusFilter(e.target.value as any)}
                    className="px-3 py-1.5 text-xs font-bold border border-gray-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500"
                  >
                    <option value="ALL">All Bookings ({bookingsList.length})</option>
                    <option value="PENDING">PENDING</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="NOTIFIED">NOTIFIED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-[#1f222a] text-gray-400 text-[11px] uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-6 py-3.5">Booking Ref</th>
                      <th className="px-6 py-3.5">Customer</th>
                      <th className="px-6 py-3.5">Vehicle</th>
                      <th className="px-6 py-3.5">Qty / Country</th>
                      <th className="px-6 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                          No Coming Soon reservation bookings recorded yet.
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50/60 dark:hover:bg-[#191b22] transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-mono font-bold text-xs text-creamy-500">{b.bookingReference}</p>
                            <span className="text-[11px] text-gray-400">
                              {new Date(b.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-xs text-gray-900 dark:text-white">{b.fullName}</p>
                            <p className="text-[11px] text-gray-500 font-mono">{b.email}</p>
                            {b.phone && <p className="text-[11px] text-gray-400">{b.phone}</p>}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-xs text-gray-900 dark:text-white">
                              {b.product?.name || `Product #${b.productId.slice(0, 8)}`}
                            </p>
                            {b.notes && (
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs line-clamp-2">
                                {b.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs">
                            <span className="font-black text-gray-900 dark:text-white block">
                              {b.quantity} {b.quantity === 1 ? 'unit' : 'units'}
                            </span>
                            <span className="text-[11px] text-gray-500">{b.country}</span>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={b.status}
                              onChange={(e) => handleUpdateBookingStatus(b.id, e.target.value as any)}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500"
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="CONFIRMED">CONFIRMED</option>
                              <option value="NOTIFIED">NOTIFIED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* Tab 4: USERS MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-[#16181e] rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
              <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white font-anton">Registered Accounts</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Manage customers and admin roles.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-[#1f222a] text-gray-400 text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-6 py-3.5">User</th>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {usersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        No users loaded.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/60 dark:hover:bg-[#191b22] transition-colors">
                        <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-xs">
                          {u.firstName || ''} {u.lastName || ''}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-600 dark:text-gray-300">
                          {u.email}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${u.role === 'ADMIN'
                              ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300'
                              : 'bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300'
                              }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.isActive
                              ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300'
                              : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                              }`}
                          >
                            {u.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleToggleUserStatus(u.id, u.isActive)}
                            className={`text-xs font-bold px-3 py-1 rounded-lg border transition-colors ${u.isActive
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                              }`}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: SUPPORT & LIVECHAT MANAGEMENT */}
        {activeTab === 'support' && (() => {
          const filteredSessions = supportSessions.filter(s => {
            const matchesTopic = supportTopicFilter === 'ALL' ? true : s.topic === supportTopicFilter
            const matchesStatus = supportStatusFilter === 'ALL' ? true : s.status === supportStatusFilter
            if (!matchesTopic || !matchesStatus) return false
            if (!supportSearchQuery.trim()) return true
            const q = supportSearchQuery.toLowerCase()
            const inName = (s.visitorName || '').toLowerCase().includes(q)
            const inEmail = (s.visitorEmail || '').toLowerCase().includes(q)
            const inPhone = (s.visitorPhone || '').toLowerCase().includes(q)
            const inMessages = (s.messages || []).some(m => (m.content || '').toLowerCase().includes(q))
            return inName || inEmail || inPhone || inMessages
          })
          const activeSession =
            supportSessions.find(s => s.id === selectedSessionId) || filteredSessions[0] || null

          return (
            <div className="bg-white dark:bg-[#16181e] rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
              {/* Top Header */}
              <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white font-anton">
                      Real-Time Client LiveChat & Support Center
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                      {supportSessions.filter(s => s.isOnline).length} Visitors Online
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-creamy-500/15 text-creamy-500 border border-creamy-500/30">
                      {supportSessions.filter(s => s.status === 'OPEN').length} Open Tickets
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Track live site visitors, view online/offline presence & approximate last active time, inspect selected catalogue rigs, and reply in real time.
                  </p>
                </div>

                {/* Filters: Search, Status Pills, and Topic Dropdown */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={supportSearchQuery}
                    onChange={(e) => setSupportSearchQuery(e.target.value)}
                    placeholder="Search client, email, or message..."
                    className="px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                  />

                  <div className="flex items-center rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden bg-gray-50 dark:bg-[#1a1d24]">
                    {(['ALL', 'OPEN', 'RESOLVED'] as const).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setSupportStatusFilter(st)}
                        className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                          supportStatusFilter === st
                            ? 'bg-creamy-500 text-black'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  <select
                    value={supportTopicFilter}
                    onChange={(e) => setSupportTopicFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold border border-gray-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500"
                  >
                    <option value="ALL">All Topics ({supportSessions.length})</option>
                    <option value="Item Purchase">Item Purchase</option>
                    <option value="Payment Issue">Payment Issue</option>
                    <option value="Shipping Issue">Shipping Issue</option>
                    <option value="General Inquiry">General Inquiry</option>
                  </select>
                </div>
              </div>

              {/* Split View: Sessions List (Left) & Active Chat Thread (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
                {/* Left Column: Visitor Sessions List */}
                <div className="lg:col-span-4 border-r border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 max-h-[620px] overflow-y-auto">
                  {filteredSessions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-400">
                      No visitor support conversations recorded yet. Visitors who open LiveChat or submit an inquiry will appear here automatically.
                    </div>
                  ) : (
                    filteredSessions.map((sess) => {
                      const isSelected = activeSession?.id === sess.id
                      const lastMsg =
                        sess.messages && sess.messages.length > 0
                          ? sess.messages[sess.messages.length - 1]
                          : null

                      return (
                        <div
                          key={sess.id}
                          onClick={() => handleSelectSupportSession(sess)}
                          className={`p-4 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-creamy-500/10 dark:bg-creamy-500/15 border-l-4 border-l-creamy-500'
                              : 'hover:bg-gray-50 dark:hover:bg-[#1b1e26]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {/* Online / Offline Dot */}
                                <span
                                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                    sess.isOnline
                                      ? 'bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500'
                                      : 'bg-gray-400 dark:bg-neutral-600'
                                  }`}
                                />
                                <p className="font-bold text-xs text-gray-900 dark:text-white truncate">
                                  {sess.visitorName || 'Store Visitor'}
                                </p>
                                {(sess.userId || sess.isRegisteredUser) && (
                                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">
                                    Registered
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {sess.visitorEmail || sess.visitorPhone || `ID: ${sess.id.slice(0, 16)}`}
                              </p>
                            </div>

                            <div className="flex flex-col items-end flex-shrink-0">
                              <span
                                className={`text-[10px] font-bold ${
                                  sess.isOnline ? 'text-emerald-500' : 'text-gray-400'
                                }`}
                              >
                                {sess.lastSeenText || (sess.isOnline ? 'Online now' : 'Offline')}
                              </span>
                              {sess.unreadAdminCount > 0 && (
                                <span className="mt-1 px-1.5 py-0.5 text-[9px] font-black rounded-full bg-red-600 text-white">
                                  {sess.unreadAdminCount} new
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Topic & Selected Catalogue Rigs Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-creamy-500/15 text-creamy-500">
                              {sess.topic || 'General Inquiry'}
                            </span>
                            {sess.selectedProducts && sess.selectedProducts.length > 0 && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-500">
                                {sess.selectedProducts.length} rig(s) selected
                              </span>
                            )}
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                sess.status === 'RESOLVED'
                                  ? 'bg-gray-200 dark:bg-neutral-800 text-gray-500'
                                  : 'bg-emerald-500/15 text-emerald-500'
                              }`}
                            >
                              {sess.status}
                            </span>
                          </div>

                          {lastMsg && (
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate mt-2">
                              <span className="font-bold">
                                {lastMsg.senderRole === 'CLIENT'
                                  ? 'Client: '
                                  : lastMsg.senderRole === 'ADMIN'
                                  ? 'You: '
                                  : 'Concierge: '}
                              </span>
                              {lastMsg.content}
                            </p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Right Column: Active Conversation Thread & Reply Console */}
                <div className="lg:col-span-8 flex flex-col max-h-[620px]">
                  {!activeSession ? (
                    <div className="flex-1 flex items-center justify-center p-12 text-xs text-gray-400">
                      Select a client conversation on the left to view messages and reply.
                    </div>
                  ) : (
                    <>
                      {/* Active Session Header */}
                      <div className="p-4 border-b border-gray-200 dark:border-neutral-800 bg-gray-50/60 dark:bg-[#191c24] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                activeSession.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                              }`}
                            />
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                              {activeSession.visitorName || 'Store Visitor'}
                            </h4>
                            {(activeSession.userId || activeSession.isRegisteredUser) && (
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                Registered Account
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                activeSession.isOnline
                                  ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                                  : 'bg-gray-200 dark:bg-neutral-800 text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {activeSession.lastSeenText || (activeSession.isOnline ? 'Online now' : 'Offline')}
                            </span>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-creamy-500/20 text-creamy-500">
                              {activeSession.topic}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                            Email: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{activeSession.visitorEmail || 'Not provided yet'}</span>
                            {' • '}
                            Phone: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{activeSession.visitorPhone || 'Not provided'}</span>
                            {activeSession.userId && (
                              <>
                                {' • '}
                                Account ID: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{activeSession.userId.slice(0, 12)}</span>
                              </>
                            )}
                            {' • '}
                            Last Activity: {new Date(activeSession.lastSeenAt).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {activeSession.activeOrderId && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[10px] font-black uppercase">
                              Active Order Tagged
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleSupportStatus(activeSession.id, activeSession.status)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${
                              activeSession.status === 'OPEN'
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                                : 'bg-gray-200 dark:bg-neutral-800 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            {activeSession.status === 'OPEN' ? 'Mark Resolved' : 'Reopen Ticket'}
                          </button>
                        </div>
                      </div>

                      {/* Selected Catalogue Products */}
                      {activeSession.selectedProducts && activeSession.selectedProducts.length > 0 && (
                        <div className="px-4 py-2.5 bg-creamy-500/5 border-b border-gray-200 dark:border-neutral-800">
                          <p className="text-[10px] font-black uppercase tracking-wider text-creamy-500 mb-1.5">
                            Tagged Catalog Item(s):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {activeSession.selectedProducts.map((prod) => (
                              <Link
                                key={prod.id}
                                to={`/product/${prod.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#13151b] border border-gray-200 dark:border-neutral-700 hover:border-creamy-500 shadow-2xs transition-colors"
                              >
                                <img
                                  src={getSafeMediaUrl(prod.image)}
                                  alt={prod.name}
                                  className="w-7 h-7 rounded object-cover bg-gray-100"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = '/images/hero1.jpeg'
                                  }}
                                />
                                <div>
                                  <p className="text-[11px] font-bold text-gray-900 dark:text-white leading-tight">
                                    {prod.name}
                                  </p>
                                  <p className="text-[9px] text-gray-500 font-mono">
                                    {prod.sku} • {formatPrice(prod.price)}
                                  </p>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Messages History (Client <-> Admin direct persistent thread) */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white dark:bg-[#14161c]">
                        {(activeSession.messages || [])
                          .filter((m) => m.senderRole !== 'AI_ASSISTANT')
                          .map((msg) => {
                            const isAdmin = msg.senderRole === 'ADMIN'
                            const isClient = msg.senderRole === 'CLIENT'
                            return (
                              <div
                                key={msg.id}
                                className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                              >
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                    {msg.senderName}
                                  </span>
                                  <span
                                    className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                      isClient
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : isAdmin
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                    }`}
                                  >
                                    {isClient ? 'CUSTOMER' : isAdmin ? 'ADMIN AGENT' : 'SYSTEM'}
                                  </span>
                                  <span className="text-[9px] text-gray-400">
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <div
                                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                                    isAdmin
                                      ? 'bg-creamy-500 text-black font-semibold rounded-br-xs'
                                      : isClient
                                      ? 'bg-blue-600 text-white font-medium rounded-bl-xs shadow-sm'
                                      : 'bg-gray-100 dark:bg-[#1d202a] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-neutral-800 rounded-bl-xs'
                                  }`}
                                >
                                  {msg.content}
                                </div>
                              </div>
                            )
                          })}
                        <div ref={adminChatEndRef} />
                      </div>

                      {/* Quick Templates & Admin Reply Form */}
                      <div className="p-3.5 bg-gray-50 dark:bg-[#191c24] border-t border-gray-200 dark:border-neutral-800 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {activeSession.selectedProducts && activeSession.selectedProducts.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const summary = activeSession.selectedProducts
                                  .map(p => `${p.name} (${p.sku}) at ${formatPrice(p.price)}`)
                                  .join(', ')
                                setAdminReplyText(
                                  `Hi ${activeSession.visitorName || 'there'}! Confirming availability for your selected rig(s): ${summary}. In stock and ready for crated dispatch with free shipping. Would you like assistance completing your checkout?`
                                )
                              }}
                              className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-creamy-500/15 border border-creamy-500/40 text-creamy-600 dark:text-creamy-400 hover:bg-creamy-500 hover:text-black transition-colors"
                            >
                              + Quote Selected Rig(s)
                            </button>
                          )}
                          {[
                            'Hello! I am a live DriveFlyElectric specialist. Your selected rig is in stock and ready for dispatch.',
                            'You can complete your purchase securely via Stripe Card or PayPal at checkout—free express crate shipping is included.',
                            'All rigs ship with full tracking and a 12-month factory warranty. How can I assist further?'
                          ].map((tpl, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setAdminReplyText(tpl)}
                              className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-[#14161c] border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:border-creamy-500 hover:text-creamy-500 transition-colors truncate max-w-[230px]"
                            >
                              + {tpl.slice(0, 38)}...
                            </button>
                          ))}
                        </div>

                        <form onSubmit={handleSendAdminReply} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={adminReplyText}
                            onChange={(e) => setAdminReplyText(e.target.value)}
                            placeholder={`Reply directly to ${activeSession.visitorName || 'visitor'}...`}
                            className="flex-1 px-3.5 py-2.5 text-xs rounded-xl bg-white dark:bg-[#14161c] border border-gray-300 dark:border-neutral-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                          />
                          <button
                            type="submit"
                            disabled={isSendingReply || !adminReplyText.trim()}
                            className="bg-creamy-500 hover:bg-creamy-400 disabled:opacity-50 text-black font-black uppercase tracking-wider px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send Reply</span>
                          </button>
                        </form>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Tab 7: TRAFFIC & PRODUCT ANALYTICS */}
        {activeTab === 'analytics' && (() => {
          const ta = analyticsData?.trafficAnalytics
          const sourceBadgeMap: Record<ProductViewSource, { label: string; cls: string }> = {
            PRODUCT_PAGE: {
              label: 'Page View',
              cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
            },
            CART_ADD: {
              label: 'Cart Add',
              cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
            },
            BOOKING_MODAL: {
              label: 'Booking Check',
              cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            },
            LIVECHAT_SELECT: {
              label: 'Chat Pick',
              cls: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
            },
            SHARE: {
              label: 'Share Click',
              cls: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
            }
          }

          const totalDevices = ta
            ? Math.max(1, ta.deviceBreakdown.desktop + ta.deviceBreakdown.mobile + ta.deviceBreakdown.tablet)
            : 1

          const maxSeriesValue = ta?.dailySeries?.length
            ? Math.max(1, ...ta.dailySeries.map(d => Math.max(d.visits, d.productViews)))
            : 1

          return (
            <div className="space-y-6">
              {/* Filter & Live Sync Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-[#16181e] p-4 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                <div>
                  <h2 className="text-lg font-black font-anton uppercase text-gray-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-creamy-500" />
                    <span>Storefront Visits & Checked Products</span>
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Real-time storefront navigation, visitor devices, referrers, and product inspection telemetry.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {([1, 7, 30, 90] as const).map(daysOption => (
                    <button
                      key={daysOption}
                      type="button"
                      onClick={() => setAnalyticsDays(daysOption)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${analyticsDays === daysOption
                        ? 'bg-creamy-500 text-black shadow-sm'
                        : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700'
                        }`}
                    >
                      {daysOption === 1 ? 'Today' : `${daysOption}D`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => fetchAnalytics(analyticsDays)}
                    disabled={analyticsLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:border-creamy-500 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${analyticsLoading ? 'animate-spin text-creamy-500' : ''}`} />
                    <span>Sync</span>
                  </button>
                </div>
              </div>

              {!ta ? (
                <div className="bg-white dark:bg-[#16181e] p-12 rounded-2xl border border-gray-200 dark:border-neutral-800 text-center text-sm text-gray-400">
                  {analyticsLoading ? 'Loading storefront traffic and product telemetry...' : 'No traffic telemetry recorded yet.'}
                </div>
              ) : (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-[#16181e] p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Site Visits ({ta.periodDays}d)</span>
                        <div className="w-9 h-9 rounded-xl bg-creamy-500/10 text-creamy-500 flex items-center justify-center">
                          <Globe className="w-5 h-5" />
                        </div>
                      </div>
                      <p className="text-3xl font-black text-gray-900 dark:text-white font-anton">{ta.totalVisits.toLocaleString()}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{ta.visitsToday.toLocaleString()} today • {ta.visitsLast7d.toLocaleString()} last 7d</p>
                    </div>

                    <div className="bg-white dark:bg-[#16181e] p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Unique Visitors</span>
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                          <Users className="w-5 h-5" />
                        </div>
                      </div>
                      <p className="text-3xl font-black text-gray-900 dark:text-white font-anton">{ta.uniqueVisitors.toLocaleString()}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{ta.uniqueVisitorsToday.toLocaleString()} today • {ta.uniqueVisitorsLast7d.toLocaleString()} last 7d</p>
                    </div>

                    <div className="bg-white dark:bg-[#16181e] p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Products Checked</span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                          <Eye className="w-5 h-5" />
                        </div>
                      </div>
                      <p className="text-3xl font-black text-gray-900 dark:text-white font-anton">{ta.totalProductViews.toLocaleString()}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{ta.productViewsToday.toLocaleString()} today • {ta.uniqueProductsChecked.toLocaleString()} distinct rigs</p>
                    </div>

                    <div className="bg-white dark:bg-[#16181e] p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Active Unpaid Carts</span>
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      </div>
                      <p className="text-3xl font-black text-gray-900 dark:text-white font-anton">{(analyticsData?.activeCartRemindersCount ?? 0).toLocaleString()}</p>
                      <p className="text-[11px] text-gray-400 mt-1">Scheduled for 1h–72h SMTP recovery reminders</p>
                    </div>
                  </div>

                  {/* Daily Activity Trend + Devices & Referrers */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                            14-Day Traffic & Product Inspection Velocity
                          </h3>
                          <p className="text-[11px] text-gray-400">Daily storefront visits compared with checked product events.</p>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] font-bold">
                          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                            <span className="w-2.5 h-2.5 rounded-sm bg-creamy-500 inline-block" /> Visits
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Checked Products
                          </span>
                        </div>
                      </div>

                      <div className={`grid grid-cols-7 ${ta.dailySeries.length > 7 ? 'md:grid-cols-[repeat(14,minmax(0,1fr))]' : ''} gap-2 items-end h-44 pt-4`}>
                        {ta.dailySeries.map(day => {
                          const visitHeightPct = day.visits > 0 ? Math.max(8, Math.round((day.visits / maxSeriesValue) * 100)) : 2
                          const viewHeightPct = day.productViews > 0 ? Math.max(8, Math.round((day.productViews / maxSeriesValue) * 100)) : 2
                          return (
                            <div
                              key={day.date}
                              className="flex flex-col items-center justify-end h-full group"
                              title={`${day.label}: ${day.visits} visits (${day.uniqueVisitors} unique), ${day.productViews} product checks`}
                            >
                              <div className="w-full flex items-end justify-center gap-1 h-32">
                                <div
                                  className="w-2.5 rounded-t bg-creamy-500/85 group-hover:bg-creamy-400 transition-all"
                                  style={{ height: `${visitHeightPct}%` }}
                                />
                                <div
                                  className="w-2.5 rounded-t bg-emerald-500/80 group-hover:bg-emerald-400 transition-all"
                                  style={{ height: `${viewHeightPct}%` }}
                                />
                              </div>
                              <span className="mt-2 text-[9px] font-bold text-gray-400 truncate max-w-full">
                                {day.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                      <div className="bg-white dark:bg-[#16181e] p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white mb-4">
                          Visitor Devices
                        </h3>
                        <div className="space-y-3">
                          {[
                            { label: 'Desktop', count: ta.deviceBreakdown.desktop, icon: Monitor, color: 'bg-creamy-500' },
                            { label: 'Mobile', count: ta.deviceBreakdown.mobile, icon: Smartphone, color: 'bg-emerald-500' },
                            { label: 'Tablet', count: ta.deviceBreakdown.tablet, icon: Tablet, color: 'bg-blue-500' }
                          ].map(dev => {
                            const DevIcon = dev.icon
                            const pct = ta.totalVisits > 0 ? Math.round((dev.count / totalDevices) * 100) : 0
                            return (
                              <div key={dev.label} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="flex items-center gap-1.5 font-bold text-gray-700 dark:text-gray-200">
                                    <DevIcon className="w-3.5 h-3.5 text-gray-400" />
                                    {dev.label}
                                  </span>
                                  <span className="text-gray-500 dark:text-gray-400 font-semibold">
                                    {dev.count.toLocaleString()} ({pct}%)
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
                                  <div className={`h-full rounded-full ${dev.color}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-[#16181e] p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white mb-3">
                          Top Referrers
                        </h3>
                        {ta.topReferrers.length === 0 ? (
                          <p className="text-xs text-gray-400">No referrer records yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {ta.topReferrers.slice(0, 5).map(refItem => (
                              <div key={refItem.referrer} className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 dark:text-gray-300 truncate pr-3">{refItem.referrer}</span>
                                <span className="font-black text-gray-900 dark:text-white">{refItem.visits}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Most Checked Products Leaderboard */}
                  <div className="bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                          Most Checked & Interacted Products
                        </h3>
                        <p className="text-[11px] text-gray-400">
                          Ranked by combined detail page inspections, quick-cart additions, coming-soon bookings, live-chat picks, and shares.
                        </p>
                      </div>
                    </div>

                    {ta.topProductsChecked.length === 0 ? (
                      <div className="p-8 text-center text-xs text-gray-400">
                        No checked products recorded in this timeframe yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-neutral-800 text-[10px] font-black uppercase tracking-wider text-gray-400">
                              <th className="py-3 px-5">Product</th>
                              <th className="py-3 px-3 text-right">Price</th>
                              <th className="py-3 px-3 text-right">Total Checks</th>
                              <th className="py-3 px-3 text-right">Page Views</th>
                              <th className="py-3 px-3 text-right">Cart Adds</th>
                              <th className="py-3 px-3 text-right">Bookings</th>
                              <th className="py-3 px-3 text-right">Chat Picks</th>
                              <th className="py-3 px-3 text-right">Unique Visitors</th>
                              <th className="py-3 px-5 text-right">Last Checked</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-neutral-800 text-xs">
                            {ta.topProductsChecked.map(item => (
                              <tr key={item.productId} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="py-3 px-5">
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={getSafeMediaUrl(item.imageUrl || undefined)}
                                      alt={item.productName}
                                      className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-neutral-800 flex-shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <p className="font-bold text-gray-900 dark:text-white truncate max-w-[210px]">{item.productName}</p>
                                      <p className="text-[10px] text-gray-400 uppercase">{item.productSku || item.category || item.productId}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-right font-semibold text-gray-700 dark:text-gray-300">
                                  {formatPrice(item.price)}
                                </td>
                                <td className="py-3 px-3 text-right font-black text-creamy-500">
                                  {item.totalViews}
                                </td>
                                <td className="py-3 px-3 text-right text-gray-600 dark:text-gray-300">{item.pageViews}</td>
                                <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">{item.cartAdds}</td>
                                <td className="py-3 px-3 text-right text-amber-600 dark:text-amber-400 font-bold">{item.bookingChecks}</td>
                                <td className="py-3 px-3 text-right text-purple-600 dark:text-purple-400 font-bold">{item.chatSelections}</td>
                                <td className="py-3 px-3 text-right text-gray-600 dark:text-gray-300">{item.uniqueVisitors}</td>
                                <td className="py-3 px-5 text-right text-[11px] text-gray-400 whitespace-nowrap">
                                  {new Date(item.lastViewedAt).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Top Pages + Live Recent Activity Streams */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                      <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">
                          Top Storefront Routes
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-96 overflow-y-auto">
                        {ta.topPages.length === 0 ? (
                          <p className="p-6 text-xs text-gray-400 text-center">No page paths recorded yet.</p>
                        ) : (
                          ta.topPages.map(pg => (
                            <div key={pg.path} className="p-4 flex items-center justify-between gap-3 text-xs">
                              <div className="min-w-0">
                                <p className="font-mono font-bold text-gray-900 dark:text-white truncate">{pg.path}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{pg.uniqueVisitors} unique • {new Date(pg.lastVisitedAt).toLocaleDateString()}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded-lg bg-creamy-500/10 text-creamy-500 font-black whitespace-nowrap">
                                {pg.visits}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-4 bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                      <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">
                          Recent Site Visits
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-96 overflow-y-auto">
                        {ta.recentVisits.length === 0 ? (
                          <p className="p-6 text-xs text-gray-400 text-center">No recent visits yet.</p>
                        ) : (
                          ta.recentVisits.map(v => (
                            <div key={v.id} className="p-3.5 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold text-gray-900 dark:text-white truncate">{v.path}</span>
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-300">
                                  {v.deviceType}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-gray-400">
                                <span className="truncate pr-2">{v.userEmail || v.visitorId}</span>
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="w-3 h-3" />
                                  {new Date(v.createdAt).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-4 bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                      <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">
                          Recent Checked Products
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-96 overflow-y-auto">
                        {ta.recentProductViews.length === 0 ? (
                          <p className="p-6 text-xs text-gray-400 text-center">No checked product events yet.</p>
                        ) : (
                          ta.recentProductViews.map(pv => {
                            const badge = sourceBadgeMap[pv.source] || sourceBadgeMap.PRODUCT_PAGE
                            return (
                              <div key={pv.id} className="p-3.5 text-xs space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-gray-900 dark:text-white truncate">{pv.productName}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${badge.cls}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-gray-400">
                                  <span className="truncate pr-2">{pv.userEmail || pv.visitorId}</span>
                                  <span className="whitespace-nowrap">{new Date(pv.createdAt).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* Tab 7: RETURNS & CUSTOMER WALLETS (21-Day Return Policy & Same-Day Instant Wallet Refund) */}
        {activeTab === 'returns' && (
          <div className="space-y-8">
            <div className="bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black font-anton flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-creamy-500" />
                    21-Day Return &amp; Exchange Requests
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">
                    Issue instant Same-Day Wallet Balance Deposits while awaiting return shipping, approve equal/close-value catalog exchanges, or finalize received returns.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchReturnsAndWallets}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-neutral-700 text-xs font-bold hover:border-creamy-500"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              {returnsList.length === 0 ? (
                <div className="p-10 text-center text-xs text-gray-500">
                  No customer return or exchange requests submitted yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {returnsList.map((ret) => {
                    const isBusy = processingReturnId === ret.id
                    return (
                      <div key={ret.id} className="p-6 space-y-4 text-xs">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-sm">{ret.returnNumber}</span>
                              <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 font-mono text-[10px]">
                                Order #{ret.orderNumber || ret.orderId}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-creamy-500/15 text-creamy-600 dark:text-creamy-400 font-black text-[10px] uppercase">
                                {ret.status}
                              </span>
                              {ret.walletCredited && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-black text-[10px] uppercase">
                                  Wallet Credited
                                </span>
                              )}
                            </div>
                            <p className="text-gray-500 dark:text-neutral-400 mt-1">
                              Customer: <strong className="text-gray-900 dark:text-white">{ret.userName || 'Customer'}</strong> ({ret.userEmail || ret.userId}) •{' '}
                              21-Day Window Until: <strong>{new Date(ret.eligibleUntil).toLocaleDateString()}</strong>
                            </p>
                          </div>

                          <div className="text-left md:text-right">
                            <p className="text-lg font-black text-creamy-500">{formatPrice(ret.refundAmount)}</p>
                            <p className="text-[11px] font-semibold">
                              {ret.reasonType === 'EXCHANGE_EQUAL_VALUE'
                                ? `Exchange -> ${ret.exchangeProduct?.name || ret.exchangeProductId || 'Replacement'} (${ret.exchangePriceDelta >= 0 ? `+${formatPrice(ret.exchangePriceDelta)}` : formatPrice(ret.exchangePriceDelta)})`
                                : 'Money Back to Wallet (Not As Ordered)'}
                            </p>
                          </div>
                        </div>

                        {ret.reasonDetails && (
                          <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#1a1d24] border border-gray-200 dark:border-neutral-800">
                            <strong className="uppercase text-[10px] text-gray-500 block mb-0.5">Customer Details:</strong>
                            <p>{ret.reasonDetails}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder={`Return Tracking # (${ret.returnTrackingNumber || 'optional'})`}
                            value={returnTrackingDrafts[ret.id] ?? ret.returnTrackingNumber ?? ''}
                            onChange={(e) =>
                              setReturnTrackingDrafts((prev) => ({ ...prev, [ret.id]: e.target.value }))
                            }
                            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-[#1a1d24] text-xs"
                          />
                          <input
                            type="text"
                            placeholder={`Support / Admin Notes (${ret.adminNotes || 'optional'})`}
                            value={returnNotesDrafts[ret.id] ?? ret.adminNotes ?? ''}
                            onChange={(e) =>
                              setReturnNotesDrafts((prev) => ({ ...prev, [ret.id]: e.target.value }))
                            }
                            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-[#1a1d24] text-xs"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {ret.status === 'PENDING_REVIEW' && ret.reasonType === 'NOT_AS_ORDERED_REFUND' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleProcessReturn(ret.id, 'APPROVE_SAME_DAY_WALLET_REFUND')}
                              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider text-[11px] disabled:opacity-50"
                            >
                              {isBusy ? 'Processing...' : `Issue Same-Day Wallet Deposit (+${formatPrice(ret.refundAmount)})`}
                            </button>
                          )}

                          {ret.status === 'PENDING_REVIEW' && ret.reasonType === 'EXCHANGE_EQUAL_VALUE' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleProcessReturn(ret.id, 'APPROVE_EXCHANGE')}
                              className="px-3.5 py-2 rounded-xl bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-[11px] disabled:opacity-50"
                            >
                              {isBusy ? 'Creating Replacement...' : 'Approve Catalog Exchange'}
                            </button>
                          )}

                          {(ret.status === 'WALLET_CREDITED' ||
                            ret.status === 'EXCHANGE_APPROVED' ||
                            ret.status === 'PENDING_REVIEW') && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleProcessReturn(ret.id, 'MARK_RETURN_RECEIVED_COMPLETE')}
                              className="px-3.5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider text-[11px] disabled:opacity-50"
                            >
                              Mark Return Received &amp; Complete
                            </button>
                          )}

                          {ret.status === 'PENDING_REVIEW' && !ret.walletCredited && !ret.exchangeOrderId && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleProcessReturn(ret.id, 'REJECT')}
                              className="px-3.5 py-2 rounded-xl border border-red-300 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold uppercase tracking-wider text-[11px] hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            >
                              Decline
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Customer Wallets & Audit Balances */}
            <div className="bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black font-anton flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-creamy-500" />
                    Customer Wallets &amp; Balances
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">
                    Audit customer refund credits, checkout debits, or post manual wallet adjustments.
                  </p>
                </div>
              </div>

              {walletsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  No customer wallets initialized yet (created automatically when customers view Account, Checkout, or receive a refund).
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-[#1a1d24] text-[10px] font-black uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-6 py-3">Customer</th>
                        <th className="px-6 py-3">Current Balance</th>
                        <th className="px-6 py-3">Recent Ledger Entry</th>
                        <th className="px-6 py-3 text-right">Adjust</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                      {walletsList.map((w) => {
                        const latestTx = w.recentTransactions?.[0]
                        const displayName =
                          `${w.user?.firstName || ''} ${w.user?.lastName || ''}`.trim() ||
                          w.user?.email ||
                          w.userId
                        return (
                          <tr key={w.id}>
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900 dark:text-white">{displayName}</p>
                              <p className="text-[11px] text-gray-500">{w.user?.email || w.userId}</p>
                            </td>
                            <td className="px-6 py-4 font-black text-base text-creamy-500">
                              {formatPrice(w.balance)}
                            </td>
                            <td className="px-6 py-4 text-[11px] text-gray-500 dark:text-neutral-400">
                              {latestTx
                                ? `${latestTx.direction === 'CREDIT' ? '+' : '-'}${formatPrice(latestTx.amount)} (${latestTx.type})`
                                : 'No transactions yet'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setAdjustWalletModal({
                                    userId: w.userId,
                                    label: `${displayName} (${w.user?.email || w.userId})`,
                                    direction: 'CREDIT',
                                    amount: '',
                                    description: ''
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg border border-creamy-500/40 text-creamy-600 dark:text-creamy-400 font-bold hover:bg-creamy-500/10"
                              >
                                Adjust Balance
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Admin Manual Wallet Adjustment Modal */}
      {adjustWalletModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 dark:border-neutral-800 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase text-creamy-500">Wallet Adjustment</p>
                <h3 className="font-anton text-lg">{adjustWalletModal.label}</h3>
              </div>
              <button type="button" onClick={() => setAdjustWalletModal(null)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitWalletAdjust} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustWalletModal({ ...adjustWalletModal, direction: 'CREDIT' })}
                  className={`py-2 rounded-xl font-black uppercase ${
                    adjustWalletModal.direction === 'CREDIT'
                      ? 'bg-emerald-500 text-black'
                      : 'border border-gray-300 dark:border-neutral-700'
                  }`}
                >
                  + Credit Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustWalletModal({ ...adjustWalletModal, direction: 'DEBIT' })}
                  className={`py-2 rounded-xl font-black uppercase ${
                    adjustWalletModal.direction === 'DEBIT'
                      ? 'bg-red-500 text-white'
                      : 'border border-gray-300 dark:border-neutral-700'
                  }`}
                >
                  - Debit Wallet
                </button>
              </div>
              <div>
                <label className="font-bold block mb-1">Amount (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={adjustWalletModal.amount}
                  onChange={(e) => setAdjustWalletModal({ ...adjustWalletModal, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-[#1a1d24]"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Audit Description / Reason *</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={adjustWalletModal.description}
                  onChange={(e) => setAdjustWalletModal({ ...adjustWalletModal, description: e.target.value })}
                  placeholder="e.g. Same-day goodwill refund / adjustment"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-[#1a1d24]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustWalletModal(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustingWalletSubmitting}
                  className="px-4 py-2 rounded-xl bg-creamy-500 text-black font-black uppercase disabled:opacity-50"
                >
                  {adjustingWalletSubmitting ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal with Direct Image File Upload */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsProductModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white dark:bg-[#16181e] text-gray-900 dark:text-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-neutral-800 mb-4">
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white font-anton">
                    {editingProductId ? 'Edit Fleet Rig' : 'Create & Upload Fleet Rig'}
                  </h3>
                  <p className="text-[11px] text-gray-400">Upload product image and define specifications in USD.</p>
                </div>
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-4">
                {/* 1. Image File Upload & Multi-Media Gallery */}
                <div className="p-4 bg-gray-50 dark:bg-[#1a1d24] rounded-xl border border-dashed border-gray-300 dark:border-neutral-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                        Product Media (Images &amp; Video Clips)
                      </label>
                      <p className="text-[10px] text-gray-400">
                        Select multiple images or video clips. First media item is the primary thumbnail.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-creamy-500/20 text-creamy-500 font-bold px-2 py-0.5 rounded">
                      {productForm.images.length} uploaded
                    </span>
                  </div>

                  {/* File upload input */}
                  <div className="space-y-2">
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleFileUpload}
                      disabled={isUploadingImage}
                      className="text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-creamy-500 file:text-black hover:file:bg-creamy-400 cursor-pointer w-full"
                    />
                    {isUploadingImage && (
                      <p className="text-[10px] text-creamy-500 font-bold mt-1 animate-pulse">
                        Uploading media file(s) to server...
                      </p>
                    )}

                    {/* Direct Local Path or Image URL input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={manualMediaUrl}
                        onChange={(e) => setManualMediaUrl(e.target.value)}
                        placeholder="Or add path/URL e.g. /images/MicroHelicpter.jpeg"
                        className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-[#16181e] border border-gray-300 dark:border-neutral-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = manualMediaUrl.trim()
                          if (!trimmed) return
                          setProductForm(prev => {
                            const combined = [...prev.images, trimmed]
                            return {
                              ...prev,
                              images: combined,
                              imageUrl: combined[0] || prev.imageUrl
                            }
                          })
                          setManualMediaUrl('')
                        }}
                        className="px-3 py-1.5 bg-gray-200 dark:bg-neutral-800 hover:bg-creamy-500 hover:text-black text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition-colors"
                      >
                        Add Media
                      </button>
                    </div>
                  </div>

                  {/* Media Gallery Previews */}
                  {productForm.images.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-2 border-t border-gray-200 dark:border-neutral-800">
                      {productForm.images.map((imgUrl, idx) => (
                        <div
                          key={idx}
                          className={`group relative aspect-square rounded-lg overflow-hidden border-2 bg-gray-200 dark:bg-neutral-800 ${idx === 0 ? 'border-creamy-500 shadow-sm' : 'border-gray-300 dark:border-neutral-700'
                            }`}
                        >
                          {isVideoMedia(imgUrl) ? (
                            <video
                              src={getSafeMediaUrl(imgUrl)}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={getSafeMediaUrl(imgUrl)}
                              alt={`Preview ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                if (!target.src.endsWith('/images/hero1.jpeg')) {
                                  target.src = '/images/hero1.jpeg'
                                }
                              }}
                            />
                          )}
                          {idx === 0 && (
                            <span className="absolute top-1 left-1 bg-creamy-500 text-black text-[8px] font-black uppercase px-1 rounded">
                              Main
                            </span>
                          )}
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity p-1">
                            {idx !== 0 && (
                              <button
                                type="button"
                                onClick={() => setPrimaryImage(idx)}
                                className="text-[8px] bg-creamy-500 text-black font-bold px-1.5 py-0.5 rounded uppercase"
                              >
                                Make Main
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="text-[8px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded uppercase"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Product Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-creamy-500 outline-none transition-colors"
                    placeholder="e.g. Apex 3000W Electric Drift Trike"
                  />
                </div>

                {/* 3. Pricing */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Price ($ USD) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-creamy-500 outline-none transition-colors"
                      placeholder="400.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Compare-At Price ($ USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={productForm.originalPrice}
                      onChange={(e) => setProductForm({ ...productForm, originalPrice: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-creamy-500 outline-none transition-colors"
                      placeholder="550.00"
                    />
                  </div>
                </div>

                {/* 4. SKU, Stock, Category */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">SKU *</label>
                    <input
                      type="text"
                      required
                      value={productForm.sku}
                      onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-creamy-500 outline-none transition-colors font-mono"
                      placeholder="DFE-HELI-1000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Stock Units</label>
                    <input
                      type="number"
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-creamy-500 outline-none transition-colors"
                      placeholder="25"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                    <select
                      value={productForm.category}
                      onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500 outline-none transition-colors font-bold"
                    >
                      <option value="mini-helicopter">MiniHeliCopters (mini-helicopter)</option>
                      <option value="Microcars">Microcars</option>
                      <option value="Go karts">Go karts</option>
                      <option value="trikes">trikes</option>
                      <option value="Dirtbikes">Dirtbikes</option>
                    </select>
                  </div>
                </div>

                {/* 5. Brand and Delivery */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Brand</label>
                    <input
                      type="text"
                      value={productForm.brand}
                      onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Delivery Time</label>
                    <input
                      type="text"
                      value={productForm.deliveryTime}
                      onChange={(e) => setProductForm({ ...productForm, deliveryTime: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-creamy-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* 6. Description */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Description & Specs</label>
                  <textarea
                    rows={3}
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-creamy-500 outline-none transition-colors"
                    placeholder="Highlight motor wattage, battery capacity, frame materials, top speed, and range..."
                  />
                </div>

                {/* Coming Soon Categorization Indicator */}
                <div className="p-3.5 rounded-xl border border-amber-400/35 bg-amber-500/10 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="isComingSoon"
                      checked={productForm.isComingSoon}
                      onChange={(e) => setProductForm({ ...productForm, isComingSoon: e.target.checked })}
                      className="mt-0.5 w-4 h-4 text-amber-500 rounded border-gray-300 dark:border-neutral-700 accent-amber-500"
                    />
                    <div className="flex-1">
                      <label htmlFor="isComingSoon" className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5 cursor-pointer">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Coming Soon Categorization (Enable Hero Showcase &amp; Book Now)</span>
                      </label>
                      <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
                        Displays a COMING SOON badge on this item, features it inside the Hero auto-scrolling marquee, and replaces instant checkout with priority Book Now pre-booking.
                      </p>
                    </div>
                  </div>

                  {productForm.isComingSoon && (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Expected Launch / Release Window (Optional)
                      </label>
                      <input
                        type="text"
                        value={productForm.comingSoonRelease}
                        onChange={(e) => setProductForm({ ...productForm, comingSoonRelease: e.target.value })}
                        placeholder="e.g. Q3 2026, August 2026"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#1a1d24] border border-amber-400/40 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-amber-400 outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isNew"
                    checked={productForm.isNew}
                    onChange={(e) => setProductForm({ ...productForm, isNew: e.target.checked })}
                    className="w-4 h-4 text-creamy-500 rounded border-gray-300 dark:border-neutral-700 accent-creamy-500"
                  />
                  <label htmlFor="isNew" className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Mark as "NEW" featured product in store
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider px-6 py-2.5 rounded-xl text-xs shadow-md transition-all active:scale-95"
                  >
                    {editingProductId ? 'Update Rig Details' : 'Publish Rig to Catalog'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Order Receipt Preview & Download Modal */}
      {selectedReceiptOrder && (() => {
        const previewReceipt = buildOrderReceipt(selectedReceiptOrder)
        return (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-sm no-print"
              onClick={() => setSelectedReceiptOrder(null)}
            />
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="relative bg-white dark:bg-[#16181e] text-gray-900 dark:text-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 border border-gray-200 dark:border-neutral-800 font-mono text-xs">
                <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-neutral-800 mb-4 no-print">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-creamy-500" />
                    <div>
                      <h3 className="text-base font-black uppercase tracking-wider font-sans text-gray-900 dark:text-white">
                        Purchase Receipt • #{previewReceipt.orderNumber}
                      </h3>
                      <p className="text-[11px] font-sans text-gray-500 dark:text-neutral-400">
                        Generated customer purchase receipt for order settlement verification
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedReceiptOrder(null)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Action Bar */}
                <div className="flex flex-wrap items-center gap-2.5 mb-5 no-print font-sans">
                  <button
                    onClick={() => handleDownloadOrderReceipt(selectedReceiptOrder)}
                    className="inline-flex items-center gap-2 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-xs px-4 py-2.5 rounded-xl shadow-md shadow-creamy-500/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Receipt (.pdf)</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-900 dark:text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                    <span>Print Receipt</span>
                  </button>

                  <button
                    onClick={() => handleCopyOrderReceipt(selectedReceiptOrder)}
                    className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-900 dark:text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                  >
                    {copiedOrderId === selectedReceiptOrder.id ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                    )}
                    <span>{copiedOrderId === selectedReceiptOrder.id ? 'Copied!' : 'Copy Receipt'}</span>
                  </button>
                </div>

                {/* Exact Receipt Block */}
                <div className="bg-gray-50 dark:bg-[#101217] p-5 rounded-xl border border-gray-200 dark:border-neutral-800 text-[11px] sm:text-xs leading-relaxed whitespace-pre-wrap select-text overflow-x-auto max-h-[60vh] overflow-y-auto">
                  {generateReceiptText(previewReceipt)}
                </div>

                {/* Line Items Breakdown if available */}
                {previewReceipt.items && previewReceipt.items.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400 mb-2 font-sans">
                      Purchased Items Breakdown:
                    </h4>
                    <div className="space-y-1.5">
                      {previewReceipt.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs text-gray-700 dark:text-neutral-300">
                          <span>{item.name} × {item.quantity}</span>
                          <span className="font-bold text-gray-900 dark:text-white">{item.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default AdminDashboard