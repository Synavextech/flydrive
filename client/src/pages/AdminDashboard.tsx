import React, { useState, useEffect } from 'react'
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
  Image as ImageIcon,
  Download,
  FileText,
  Printer,
  Copy,
  Check
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { adminApi } from '../services/api'
import { Product, Order, User } from '../types'
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
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'users'>('overview')

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
  const [usersList, setUsersList] = useState<User[]>([])

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
    topSpeed: '60 km/h',
    range: '70 km',
    deliveryTime: '21 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
  })

  // Order status filter
  const [orderFilter, setOrderFilter] = useState<string>('ALL')
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<any | null>(null)
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)
  const [notificationsList, setNotificationsList] = useState<any[]>([])

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

  useEffect(() => {
    fetchDashboardStats()
    fetchNotifications()
    const interval = setInterval(() => {
      fetchNotifications()
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (activeTab === 'products') fetchProducts()
    if (activeTab === 'orders') fetchOrders()
    if (activeTab === 'users') fetchUsers()
  }, [activeTab, orderFilter])

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
      const res = await adminApi.getAllOrders(orderFilter === 'ALL' ? undefined : { status: orderFilter as any })
      if (res.success && res.data) {
        setOrdersList(res.data)
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
        averageDeliveryTime: productForm.deliveryTime || '21-35 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
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
      topSpeed: '60 km/h',
      range: '70 km',
      deliveryTime: product.averageDeliveryTime || '21-35 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
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
      topSpeed: '65 km/h',
      range: '70 km',
      deliveryTime: '21-35 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
    })
    setIsProductModalOpen(true)
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
          : ord.paymentMethod || 'Credit / Debit Card (Stripe)'

    const initialChargeVal = Number(ord.subtotal || ord.total || 0)
    const finalCostVal = Number(ord.total || 0)
    const isRefunded = ord.status === 'REFUNDED' || ord.paymentStatus === 'REFUNDED'

    return {
      date: orderDateStr,
      orderDate: orderDateStr,
      orderNumber: ord.orderNumber || ord.id,
      transactionId,
      userName: customerName,
      address: formattedAddress,
      paymentSource,
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
            <div className="flex items-center gap-2 text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">
              <span>DriveFlyElectric</span>
              <span>•</span>
              <span>Nanshan, Shenzhen, Guangdong Province, China HQ Operations</span>
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
              Store catalog administration, upload products, track Stripe & PayPal orders, and manage users.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchDashboardStats()
                if (activeTab === 'products') fetchProducts()
                if (activeTab === 'orders') fetchOrders()
                if (activeTab === 'users') fetchUsers()
              }}
              className="p-2.5 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-xl text-gray-600 dark:text-gray-300 hover:text-amber-500 shadow-sm transition-colors"
              title="Refresh Data"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
            <button
              onClick={openAddModal}
              className="bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all active:scale-95"
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
            { id: 'users', label: 'User Accounts', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 px-1 text-xs font-black uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${isActive
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
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
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
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
                <span className="text-[10px] text-blue-500 font-bold mt-1 inline-block">Routed via Stripe & PayPal</span>
              </div>

              <div className="bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Settled Revenue</span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-3xl font-black text-amber-500 font-anton">{formatPrice(stats.totalRevenue)}</p>
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
                <span className="text-[10px] text-purple-500 font-bold mt-1 inline-block">Supabase auth enabled</span>
              </div>
            </div>

            {/* Quick Actions & Store Config Note */}
            <div className="bg-white dark:bg-[#16181e] p-6 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-anton text-lg uppercase text-gray-900 dark:text-white">DriveFlyElectric — Nanshan, Shenzhen, Guangdong Province, China Warehouse</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  HQ: 1000 DriveFly Electric Way, Suite 400, Nanshan, Shenzhen, Guangdong Province, China.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('products')}
                className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider"
              >
                Manage Fleet Catalog
              </button>
            </div>

            {/* Real-Time System Activity & Integrated SMTP Notification Feed */}
            <div className="bg-white dark:bg-[#16181e] rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="font-anton text-lg uppercase text-gray-900 dark:text-white">
                      Real-Time System Activity & SMTP Mail Stream
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Live notifications for customer purchases (PDF receipts attached), account registrations, and order updates dispatched to customer and system mail.
                  </p>
                </div>
                <button
                  onClick={fetchNotifications}
                  className="text-xs font-bold text-amber-500 hover:text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10"
                >
                  Sync Feed
                </button>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-neutral-800 max-h-80 overflow-y-auto">
                {notificationsList.length === 0 && stats.recentOrders.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    Monitoring live store activity. Purchase notifications and account creation alerts will appear here in real time.
                  </div>
                ) : (
                  <>
                    {notificationsList.map((act: any) => (
                      <div key={act.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-gray-50/50 dark:hover:bg-[#191b22]">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">
                              {act.type}
                            </span>
                            <p className="text-xs font-bold text-gray-900 dark:text-white">{act.title}</p>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{act.message}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] font-mono text-gray-400 block">
                            {new Date(act.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-500">
                            {act.emailDispatched || act.systemMailDispatched ? 'SMTP Dispatched' : 'Logged & Queued'}
                          </span>
                        </div>
                      </div>
                    ))}
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
                            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider text-[10px] px-3 py-1.5 rounded-lg shadow-sm cursor-pointer"
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
        {activeTab === 'products' && (
          <div className="bg-white dark:bg-[#16181e] rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white font-anton">Fleet Products Catalog</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Total {productsList.length} items live. Create, update prices, or upload images directly.
                </p>
              </div>
              <button
                onClick={openAddModal}
                className="bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 self-start sm:self-auto shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Upload New Product</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-[#1f222a] text-gray-400 text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-6 py-3.5">Product & Image</th>
                    <th className="px-6 py-3.5">SKU / Category</th>
                    <th className="px-6 py-3.5">USD Price</th>
                    <th className="px-6 py-3.5">Stock</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {productsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        No products found. Click "Upload New Product" to add.
                      </td>
                    </tr>
                  ) : (
                    productsList.map((p) => (
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
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white truncate max-w-xs text-xs">{p.name}</p>
                            <span className="text-[11px] text-gray-400">{p.brand || 'DriveFlyElectric'}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <p className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{p.sku}</p>
                          <span className="text-[10px] text-amber-500 uppercase font-black px-2 py-0.5 rounded bg-amber-500/10">
                            {p.category}
                          </span>
                        </td>

                        <td className="px-6 py-4 font-black text-gray-900 dark:text-amber-400">
                          {formatPrice(p.price)}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${p.stock > 10
                              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                              }`}
                          >
                            {p.stock} units
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 text-gray-500 hover:text-amber-500 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
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
        )}

        {/* Tab 3: ORDERS MANAGEMENT */}
        {activeTab === 'orders' && (
          <div className="bg-white dark:bg-[#16181e] rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white font-anton">Orders & Settlements</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Orders captured via Stripe and PayPal.</p>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-semibold">Status:</span>
                <select
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-gray-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="SHIPPED">Shipped</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
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
                    ordersList.map((ord: any) => (
                      <tr key={ord.id} className="hover:bg-gray-50/60 dark:hover:bg-[#191b22] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-mono font-bold text-gray-900 dark:text-white text-xs">#{ord.orderNumber}</p>
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

                        <td className="px-6 py-4 font-black text-amber-500">
                          {formatPrice(ord.total)}
                        </td>

                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                            {ord.paymentMethod || 'STRIPE'}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <select
                            value={ord.status}
                            onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value as any)}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="PROCESSING">PROCESSING</option>
                            <option value="SHIPPED">SHIPPED</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleDownloadOrderReceipt(ord)}
                              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider text-[11px] px-3 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
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
                              <FileText className="w-3.5 h-3.5 text-amber-500" />
                              <span>View</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
      </div>

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
                        Product Media (Images & Videos to /public/images)
                      </label>
                      <p className="text-[10px] text-gray-400">
                        Select multiple images or video clips. First media item is the primary thumbnail.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-amber-500/20 text-amber-500 font-bold px-2 py-0.5 rounded">
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
                      className="text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-black hover:file:bg-amber-400 cursor-pointer w-full"
                    />
                    {isUploadingImage && (
                      <p className="text-[10px] text-amber-500 font-bold mt-1 animate-pulse">
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
                        className="px-3 py-1.5 bg-gray-200 dark:bg-neutral-800 hover:bg-amber-500 hover:text-black text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition-colors"
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
                          className={`group relative aspect-square rounded-lg overflow-hidden border-2 bg-gray-200 dark:bg-neutral-800 ${idx === 0 ? 'border-amber-500 shadow-sm' : 'border-gray-300 dark:border-neutral-700'
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
                            <span className="absolute top-1 left-1 bg-amber-500 text-black text-[8px] font-black uppercase px-1 rounded">
                              Main
                            </span>
                          )}
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity p-1">
                            {idx !== 0 && (
                              <button
                                type="button"
                                onClick={() => setPrimaryImage(idx)}
                                className="text-[8px] bg-amber-500 text-black font-bold px-1.5 py-0.5 rounded uppercase"
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
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-amber-500 outline-none transition-colors"
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
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-amber-500 outline-none transition-colors"
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
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-amber-500 outline-none transition-colors"
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
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-amber-500 outline-none transition-colors font-mono"
                      placeholder="DFE-HELI-1000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Stock Units</label>
                    <input
                      type="number"
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="25"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                    <select
                      value={productForm.category}
                      onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none transition-colors font-bold"
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
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Delivery Time</label>
                    <input
                      type="text"
                      value={productForm.deliveryTime}
                      onChange={(e) => setProductForm({ ...productForm, deliveryTime: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none transition-colors"
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
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="Highlight motor wattage, battery capacity, frame materials, top speed, and range..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isNew"
                    checked={productForm.isNew}
                    onChange={(e) => setProductForm({ ...productForm, isNew: e.target.checked })}
                    className="w-4 h-4 text-amber-500 rounded border-gray-300 dark:border-neutral-700 accent-amber-500"
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
                    className="bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider px-6 py-2.5 rounded-xl text-xs shadow-md transition-all active:scale-95"
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
                    <FileText className="w-5 h-5 text-amber-500" />
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
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider text-xs px-4 py-2.5 rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer"
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