import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import {
  MessageSquare,
  Send,
  X,
  ShoppingBag,
  Truck,
  CreditCard,
  HelpCircle,
  RotateCcw,
  BookOpen,
  Headphones,
  ExternalLink,
  AlertCircle,
  Clock,
  Lock,
  CheckCircle2,
  Trash2,
  History
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { supportApi, orderApi } from '../services/api'
import { SupportSession, SupportSelectedProduct, SupportTopic, Order } from '../types'
import { getSupportWhatsAppDigits } from '../utils/receiptPdf'

const CATEGORY_OPTIONS: Array<{ id: SupportTopic; label: string; shortDesc: string; icon: any }> = [
  { id: 'General Inquiry', label: 'General Inquiry', shortDesc: 'What item are you looking for?', icon: HelpCircle },
  { id: 'Shipping Inquiry', label: 'Shipping Inquiry', shortDesc: 'Active shipments & cart items', icon: Truck },
  { id: 'Item Purchase', label: 'Item Purchase', shortDesc: 'Price, stock & listing specs', icon: ShoppingBag },
  { id: 'Payment Queries', label: 'Payment Queries', shortDesc: 'Taxes, fees & doorstep cost', icon: CreditCard },
  { id: 'Return Policy', label: 'Return Policy', shortDesc: '21-day returns & wallet deposit', icon: RotateCcw },
]

const PAYMENT_SUB_QUESTIONS: Array<{ id: string; question: string; guidance: string }> = [
  {
    id: 'making-payment',
    question: 'I have a question about making payment',
    guidance:
      'Checkout accepts your DriveFlyElectric Wallet Balance, PayPal (plus Debit/Credit Card), and Stripe 3D-Secure cards in USD. You can also combine Wallet Balance with PayPal or Stripe.'
  },
  {
    id: 'country-taxes',
    question: 'Are taxes integrated for my country?',
    guidance:
      'Yes — estimated tax (5%) and applicable checkout totals are calculated and displayed transparently in USD before you confirm payment.'
  },
  {
    id: 'doorstep-cost',
    question: 'Help me understand total costs to my doorstep',
    guidance:
      'Standard crated doorstep freight is $0.00 (Free Express Shipping) worldwide. Your doorstep total shown in Checkout includes vehicle subtotal + estimated tax with zero hidden dispatch fees.'
  }
]

const PENDING_LIVECHAT_KEY = 'dfe_pending_livechat_intent'

const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts
    .map((p, idx) => (idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p))))
    .join('/')
}

export const WhatsAppButton: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { items: cartItems } = useCart()

  const [hoveredBtn, setHoveredBtn] = useState<'whatsapp' | 'livechat' | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [showWelcomePop, setShowWelcomePop] = useState(false)
  const [showCustomComposer, setShowCustomComposer] = useState(false)

  const [sessionsList, setSessionsList] = useState<SupportSession[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [session, setSession] = useState<SupportSession | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)

  const [selectedTopic, setSelectedTopic] = useState<SupportTopic>('General Inquiry')
  const [selectedProducts, setSelectedProducts] = useState<SupportSelectedProduct[]>([])
  const [selectedPaymentSubId, setSelectedPaymentSubId] = useState<string | null>(null)

  const [activeShippingOrders, setActiveShippingOrders] = useState<Order[]>([])
  const [hasActiveShipping, setHasActiveShipping] = useState(false)
  const [loadingShipping, setLoadingShipping] = useState(false)
  const [selectedActiveOrderId, setSelectedActiveOrderId] = useState<string | null>(null)
  const [whatsAppGateNotice, setWhatsAppGateNotice] = useState<string | null>(null)

  const [messageInput, setMessageInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [recentlySentNotice, setRecentlySentNotice] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)
  const isChatOpenRef = useRef(isChatOpen)
  isChatOpenRef.current = isChatOpen
  const sseConnectedRef = useRef(false)
  const cleanNumber = getSupportWhatsAppDigits()

  const redirectToCreateAccountFirst = useCallback(
    (intent?: { topic?: SupportTopic; items?: SupportSelectedProduct[]; activeOrderId?: string | null }) => {
      if (intent) {
        try {
          sessionStorage.setItem(PENDING_LIVECHAT_KEY, JSON.stringify(intent))
        } catch {
          // Ignore storage error
        }
      }
      setIsChatOpen(false)
      const currentPath =
        location.pathname === '/register' || location.pathname === '/login'
          ? '/'
          : location.pathname
      const params = new URLSearchParams(location.search)
      params.set('support', '1')
      const returnPath = `${currentPath}?${params.toString()}`
      navigate(`/register?reason=support&redirect=${encodeURIComponent(returnPath)}`)
    },
    [location.pathname, location.search, navigate]
  )

  const refreshActiveShipping = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setActiveShippingOrders([])
      setHasActiveShipping(false)
      return false
    }
    setLoadingShipping(true)
    try {
      const res = await orderApi.getActiveShipping()
      if (res.success && res.data) {
        const orders = Array.isArray(res.data.orders) ? res.data.orders : []
        const hasActive = Boolean(res.data.hasActiveShipping && orders.length > 0)
        setActiveShippingOrders(orders)
        setHasActiveShipping(hasActive)
        if (hasActive && !selectedActiveOrderId) {
          setSelectedActiveOrderId(orders[0].id)
        }
        return hasActive
      }
    } catch {
      // Ignore error
    } finally {
      setLoadingShipping(false)
    }
    return false
  }, [isAuthenticated, user?.id, selectedActiveOrderId])

  const applySession = useCallback((nextSession: SupportSession) => {
    setSession(nextSession)
    if (nextSession.id) {
      setSessionId(nextSession.id)
    }
    if (nextSession.topic) {
      setSelectedTopic(nextSession.topic as SupportTopic)
    }
    if (Array.isArray(nextSession.selectedProducts) && nextSession.selectedProducts.length > 0) {
      setSelectedProducts(nextSession.selectedProducts)
    }
    if (nextSession.activeOrderId) {
      setSelectedActiveOrderId(nextSession.activeOrderId)
    }
    setSessionReady(true)
  }, [])

  const loadOrInitAuthenticatedSession = useCallback(
    async (overrides?: {
      topic?: SupportTopic
      items?: SupportSelectedProduct[]
      activeOrderId?: string | null
    }) => {
      if (!isAuthenticated || !user?.id) return null
      setIsInitializing(true)
      setChatError(null)
      try {
        const mySessionsRes = await supportApi.getMySessions()
        const existingSessions = mySessionsRes.success && Array.isArray(mySessionsRes.data) ? mySessionsRes.data : []
        setSessionsList(existingSessions)

        const targetSessionId = existingSessions[0]?.id || sessionId || undefined
        const existingProducts = existingSessions[0]?.selectedProducts || []
        const mergedProducts =
          overrides?.items && overrides.items.length > 0
            ? [
                ...overrides.items,
                ...existingProducts.filter((ep) => !overrides.items!.some((ni) => ni.id === ep.id))
              ]
            : undefined

        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
        const initRes = await supportApi.initSession({
          sessionId: targetSessionId,
          visitorId: targetSessionId,
          userId: user.id,
          visitorName: fullName,
          visitorEmail: user.email,
          visitorPhone: user.phone || undefined,
          topic: overrides?.topic || (existingSessions[0]?.topic as SupportTopic) || selectedTopic,
          selectedProducts: mergedProducts,
          activeOrderId: overrides?.activeOrderId ?? existingSessions[0]?.activeOrderId ?? null
        })

        if (initRes.success && initRes.data) {
          applySession(initRes.data)
          return initRes.data
        }
      } catch (err: any) {
        setChatError(err?.message || 'Unable to connect to your LiveChat session.')
      } finally {
        setIsInitializing(false)
      }
      return null
    },
    [isAuthenticated, user, sessionId, selectedTopic, applySession]
  )

  const openAuthenticatedSupport = useCallback(
    async (intent?: {
      topic?: SupportTopic
      items?: SupportSelectedProduct[]
      activeOrderId?: string | null
      focusComposer?: boolean
    }) => {
      if (!isAuthenticated || !user?.id) {
        redirectToCreateAccountFirst(intent)
        return
      }

      if (intent?.topic) setSelectedTopic(intent.topic)
      if (intent?.items && intent.items.length > 0) {
        setSelectedProducts((prev) => {
          const merged = [...intent.items!]
          prev.forEach((p) => {
            if (!merged.some((m) => m.id === p.id)) merged.push(p)
          })
          return merged
        })
      }
      if (intent?.activeOrderId) setSelectedActiveOrderId(intent.activeOrderId)
      if (intent?.focusComposer) setShowCustomComposer(true)

      setWhatsAppGateNotice(null)
      setIsChatOpen(true)
      setShowWelcomePop(true)

      await Promise.all([
        loadOrInitAuthenticatedSession({
          topic: intent?.topic,
          items: intent?.items,
          activeOrderId: intent?.activeOrderId
        }),
        refreshActiveShipping()
      ])
    },
    [isAuthenticated, user?.id, redirectToCreateAccountFirst, loadOrInitAuthenticatedSession, refreshActiveShipping]
  )

  // Clear local chat state immediately on logout; passively resume own session when logged in
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setSession(null)
      setSessionsList([])
      setSessionId('')
      setSessionReady(false)
      setActiveShippingOrders([])
      setHasActiveShipping(false)
      setIsChatOpen(false)
      return
    }

    let cancelled = false
    supportApi
      .getMySessions()
      .then((res) => {
        if (!cancelled && res.success && Array.isArray(res.data) && res.data.length > 0) {
          setSessionsList(res.data)
          applySession(res.data[0])
        }
      })
      .catch(() => {})

    refreshActiveShipping().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, user?.id, applySession, refreshActiveShipping])

  // Auto-open LiveChat after ?support=1 redirect or pending intent right after registration/login
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    const params = new URLSearchParams(location.search)
    const pendingRaw = sessionStorage.getItem(PENDING_LIVECHAT_KEY)

    if (params.get('support') === '1' || pendingRaw) {
      let parsedIntent: any = undefined
      if (pendingRaw) {
        try {
          parsedIntent = JSON.parse(pendingRaw)
        } catch {
          parsedIntent = undefined
        }
        sessionStorage.removeItem(PENDING_LIVECHAT_KEY)
      }
      if (params.get('support') === '1') {
        params.delete('support')
        const nextSearch = params.toString()
        navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true })
      }
      openAuthenticatedSupport(parsedIntent)
    }
  }, [isAuthenticated, user?.id, location.search, location.pathname, navigate, openAuthenticatedSupport])

  // Global custom event listener from Checkout, ProductDetailPage, HomePage, AccountPage & FAQ
  useEffect(() => {
    const handleOpenLiveChat = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {}
      openAuthenticatedSupport({
        topic: detail.topic as SupportTopic | undefined,
        items: Array.isArray(detail.items) ? detail.items : undefined,
        activeOrderId: detail.activeOrderId || undefined,
        focusComposer: Boolean(detail.focusComposer)
      })
    }
    window.addEventListener('dfe:open-livechat', handleOpenLiveChat)
    return () => window.removeEventListener('dfe:open-livechat', handleOpenLiveChat)
  }, [openAuthenticatedSupport])

  // Mark client messages read when opening LiveChat drawer
  useEffect(() => {
    if (!isChatOpen || !isAuthenticated || !sessionId) return
    supportApi
      .getSession(sessionId, true)
      .then((res) => {
        if (res.success && res.data) setSession(res.data)
      })
      .catch(() => {})
  }, [isChatOpen, isAuthenticated, sessionId])

  // Real-time SSE live chat stream for authenticated user's session
  useEffect(() => {
    if (!isAuthenticated || !sessionReady || !sessionId) return

    const unsubscribeStream = supportApi.subscribeSessionStream(
      sessionId,
      (updatedSession) => {
        setSession(updatedSession)
        if (
          updatedSession.messages?.length &&
          updatedSession.messages[updatedSession.messages.length - 1]?.senderRole === 'ADMIN'
        ) {
          setRecentlySentNotice(false)
        }
        if (isChatOpenRef.current && Number(updatedSession.unreadClientCount || 0) > 0) {
          supportApi
            .getSession(sessionId, true)
            .then((res) => {
              if (res.success && res.data) setSession(res.data)
            })
            .catch(() => {})
        }
      },
      (connected) => {
        sseConnectedRef.current = connected
      }
    )

    const fallbackInterval = setInterval(() => {
      if (sseConnectedRef.current || document.visibilityState !== 'visible' || !isChatOpenRef.current) return
      supportApi
        .getSession(sessionId, true)
        .then((res) => {
          if (res.success && res.data) setSession(res.data)
        })
        .catch(() => {})
    }, 6000)

    return () => {
      unsubscribeStream()
      clearInterval(fallbackInterval)
    }
  }, [isAuthenticated, sessionReady, sessionId])

  // Presence heartbeat for logged-in LiveChat sessions
  useEffect(() => {
    if (!isAuthenticated || !sessionReady || !sessionId) return

    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        supportApi.sendHeartbeat(sessionId, { isOnline: true }).catch(() => {})
      }
    }, 25000)

    const handleVisibilityChange = () => {
      supportApi.sendHeartbeat(sessionId, { isOnline: document.visibilityState === 'visible' }).catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearInterval(heartbeatInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, sessionReady, sessionId])

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [session?.messages?.length, isChatOpen, recentlySentNotice])

  // Build real WhatsApp Shipping URL strictly from verified active shipping orders
  const selectedActiveOrder =
    activeShippingOrders.find((o) => o.id === selectedActiveOrderId) || activeShippingOrders[0] || null

  const buildActiveShippingWhatsAppUrl = (): string | null => {
    if (!isAuthenticated || !hasActiveShipping || !selectedActiveOrder) return null
    const unitSummary = (selectedActiveOrder.items || [])
      .map((it) => `${it.product?.name || 'Ordered Unit'}${it.quantity > 1 ? ` x${it.quantity}` : ''}`)
      .join(', ')
    const trackCode = selectedActiveOrder.trackingNumber || `TRK-${selectedActiveOrder.orderNumber}`
    const msg = `Hello DriveFlyElectric Shipping Support! I am inquiring about my active shipment Order #${selectedActiveOrder.orderNumber} (Tracking: ${trackCode}, Status: ${selectedActiveOrder.status})${unitSummary ? ` for: ${unitSummary}` : ''}.`
    return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(msg)}`
  }

  const handleSecondaryWhatsAppClick = async () => {
    if (!isAuthenticated || !user?.id) {
      redirectToCreateAccountFirst({ topic: 'Shipping Inquiry' })
      return
    }
    const hasActive = await refreshActiveShipping()
    const waUrl = buildActiveShippingWhatsAppUrl()
    if (hasActive && waUrl) {
      window.open(waUrl, '_blank', 'noopener,noreferrer')
      return
    }
    setSelectedTopic('Shipping Inquiry')
    setWhatsAppGateNotice(
      'WhatsApp Shipping Support is available only when your account has an active shipping order (PROCESSING / SHIPPED). Use LiveChat below for pre-purchase or cart shipping questions.'
    )
    await openAuthenticatedSupport({ topic: 'Shipping Inquiry' })
  }

  const handleSelectTopic = async (topic: SupportTopic) => {
    setSelectedTopic(topic)
    setSelectedPaymentSubId(null)
    setWhatsAppGateNotice(null)
    setChatError(null)
    if (topic === 'Shipping Inquiry') {
      refreshActiveShipping().catch(() => {})
    }
    if (sessionId) {
      supportApi
        .initSession({
          sessionId,
          userId: user?.id,
          topic,
          selectedProducts,
          activeOrderId: topic === 'Shipping Inquiry' ? selectedActiveOrderId : null
        })
        .then((res) => {
          if (res.success && res.data) setSession(res.data)
        })
        .catch(() => {})
    }
  }

  const handleRemoveTaggedProduct = async (productId: string) => {
    const next = selectedProducts.filter((p) => p.id !== productId)
    setSelectedProducts(next)
    if (sessionId) {
      await supportApi
        .initSession({
          sessionId,
          userId: user?.id,
          topic: selectedTopic,
          selectedProducts: next
        })
        .then((res) => {
          if (res.success && res.data) setSession(res.data)
        })
        .catch(() => {})
    }
  }

  const handleTagCartItem = async (cartItem: any) => {
    if (!cartItem?.product) return
    const prod = cartItem.product
    const tagged: SupportSelectedProduct = {
      id: prod.id,
      name: prod.name,
      sku: prod.sku || '',
      price: Number(prod.price || 0),
      category: prod.category || '',
      image: prod.images?.[0] || ''
    }
    const next = selectedProducts.some((p) => p.id === tagged.id)
      ? selectedProducts
      : [tagged, ...selectedProducts]
    setSelectedProducts(next)
    setShowCustomComposer(true)
    setMessageInput(`Shipping inquiry for item in my cart: ${tagged.name} ($${Number(tagged.price).toLocaleString()} USD).`)
    messageInputRef.current?.focus()
    if (sessionId) {
      supportApi
        .initSession({
          sessionId,
          userId: user?.id,
          topic: 'Shipping Inquiry',
          selectedProducts: next
        })
        .catch(() => {})
    }
  }

  const handleTagActiveOrder = (ord: Order) => {
    setSelectedActiveOrderId(ord.id)
    setWhatsAppGateNotice(null)
    const orderItemsAsProducts: SupportSelectedProduct[] = (ord.items || [])
      .filter((i) => i.product)
      .map((i) => ({
        id: i.product.id,
        name: i.product.name,
        sku: i.product.sku || '',
        price: Number(i.price || i.product.price || 0),
        category: i.product.category || '',
        image: i.product.images?.[0] || ''
      }))
    if (orderItemsAsProducts.length > 0) {
      setSelectedProducts(orderItemsAsProducts)
    }
    setShowCustomComposer(true)
    setMessageInput(
      `Shipping inquiry for Order #${ord.orderNumber} (Tracking: ${ord.trackingNumber || `TRK-${ord.orderNumber}`}, Status: ${ord.status}).`
    )
    messageInputRef.current?.focus()
  }

  const handleSendMessage = async (e?: React.FormEvent, explicitContent?: string) => {
    if (e) e.preventDefault()
    if (!isAuthenticated || !user?.id) {
      redirectToCreateAccountFirst({ topic: selectedTopic, items: selectedProducts })
      return
    }
    const textToSend = (explicitContent !== undefined ? explicitContent : messageInput).trim()
    if (!textToSend || isSending) return

    setChatError(null)
    setIsSending(true)
    try {
      let targetId = sessionId
      if (!targetId) {
        const init = await loadOrInitAuthenticatedSession({
          topic: selectedTopic,
          items: selectedProducts,
          activeOrderId: selectedTopic === 'Shipping Inquiry' ? selectedActiveOrderId : null
        })
        targetId = init?.id || ''
      }
      if (!targetId) {
        throw new Error('Could not initialize your support thread. Please refresh and try again.')
      }

      const fullUserName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      const res = await supportApi.sendMessage(targetId, {
        content: textToSend,
        topic: selectedTopic,
        selectedProducts,
        activeOrderId: selectedTopic === 'Shipping Inquiry' ? selectedActiveOrderId : null,
        visitorName: fullUserName,
        visitorEmail: user.email,
        visitorPhone: user.phone || undefined
      })

      if (res.success && res.data) {
        applySession(res.data)
        if (explicitContent === undefined) setMessageInput('')
        setRecentlySentNotice(true)
        setShowWelcomePop(false)
      } else {
        setChatError(res.error || 'Message could not be sent.')
      }
    } catch (err: any) {
      setChatError(err?.message || 'Unable to send support message right now.')
    } finally {
      setIsSending(false)
    }
  }

  const handleBrowseCatalogForTag = () => {
    setIsChatOpen(false)
    if (location.pathname !== '/') {
      navigate('/#store-catalog')
      return
    }
    const el = document.getElementById('store-catalog')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleTalkToPerson = () => {
    setShowCustomComposer(true)
    setShowWelcomePop(false)
    if (!messageInput.trim()) {
      const taggedLabel =
        selectedProducts.length > 0
          ? ` about ${selectedProducts.map((p) => p.name).join(', ')}`
          : ''
      setMessageInput(`I would like to speak directly with a support agent regarding ${selectedTopic}${taggedLabel}.`)
    }
    setTimeout(() => messageInputRef.current?.focus(), 60)
  }

  const messages = (session?.messages || []).filter((m) => m.senderRole !== 'AI_ASSISTANT')
  const unreadClientCount = isAuthenticated ? Number(session?.unreadClientCount || 0) : 0
  const lastMessageIsClient =
    messages.length > 0 && messages[messages.length - 1]?.senderRole === 'CLIENT'
  const showReplyTimeBanner = isAuthenticated && (recentlySentNotice || lastMessageIsClient)
  const verifiedWaUrl = buildActiveShippingWhatsAppUrl()

  return (
    <>
      {/* LiveChat Drawer (Only open when authenticated) */}
      {isChatOpen && isAuthenticated && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[94vw] sm:w-[430px] max-h-[84vh] flex flex-col bg-white dark:bg-[#13151b] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden transition-all"
          role="dialog"
          aria-label="DriveFlyElectric.shop Support LiveChat"
        >
          {/* Header */}
          <div className="bg-gray-950 text-white px-4 py-3.5 flex items-center justify-between border-b border-creamy-500/30">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-creamy-500 flex items-center justify-center text-black font-black shadow-md flex-shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-white truncate">
                    DriveFlyElectric.shop Support
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Direct Admin
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 truncate">
                  Signed in as {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Link
                to="/account?tab=chats"
                onClick={() => setIsChatOpen(false)}
                title="View all my support chats in Account"
                className="p-1.5 rounded-lg text-gray-300 hover:text-creamy-400 hover:bg-white/5 transition-colors"
              >
                <History className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                aria-label="Close LiveChat"
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Popping Welcome Prompt & Category Selector */}
          <div className="px-3.5 py-3 bg-gray-50 dark:bg-[#191c24] border-b border-gray-200 dark:border-neutral-800 space-y-2.5 max-h-[46vh] overflow-y-auto">
            {showWelcomePop && (
              <div className="p-3 rounded-xl bg-creamy-500/15 border border-creamy-500/40 text-gray-900 dark:text-white animate-in fade-in slide-in-from-top-2 duration-200">
                <p className="text-xs font-black text-creamy-700 dark:text-creamy-400">
                  Welcome to DriveFlyElectric.shop Support, how can we be of help?
                </p>
                <p className="text-[11px] text-gray-600 dark:text-neutral-300 mt-0.5">
                  Choose an inquiry category below to narrow down your question, tag an item from the catalog, or write a custom message to our support team.
                </p>
              </div>
            )}

            {/* Category Pills */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const Icon = cat.icon
                const active = selectedTopic === cat.id && !showCustomComposer
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setShowCustomComposer(false)
                      handleSelectTopic(cat.id)
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      active
                        ? 'bg-creamy-500 text-black border-creamy-500 shadow-sm'
                        : 'bg-white dark:bg-[#222631] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-neutral-700 hover:border-creamy-500/50'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{cat.label}</span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={handleTalkToPerson}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                  showCustomComposer
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-gray-900 dark:border-white'
                    : 'bg-white dark:bg-[#222631] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-neutral-700 hover:border-creamy-500/50'
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                <span>Write Custom Message</span>
              </button>
            </div>

            {/* Category-Specific Narrowing Card */}
            {selectedTopic === 'General Inquiry' && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#14171f] border border-gray-200 dark:border-neutral-800 space-y-2 text-[11px]">
                <p className="font-bold text-gray-900 dark:text-white">
                  What item are you looking for today?
                </p>
                <p className="text-gray-600 dark:text-neutral-400 leading-snug">
                  Browse our live catalog to read product specifications, then tag the exact unit you want to ask about so it stays attached to your chat.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={handleBrowseCatalogForTag}
                    className="px-2.5 py-1.5 rounded-lg bg-creamy-500 hover:bg-creamy-400 text-black font-black text-[10px] uppercase tracking-wider"
                  >
                    Browse Catalog &amp; Tag Item
                  </button>
                  <Link
                    to="/faq"
                    onClick={() => setIsChatOpen(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-gray-200 font-bold text-[10px] uppercase hover:border-creamy-500"
                  >
                    <BookOpen className="w-3 h-3" /> Read FAQ
                  </Link>
                  <button
                    type="button"
                    onClick={handleTalkToPerson}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black font-bold text-[10px] uppercase"
                  >
                    Talk to a Person
                  </button>
                </div>
              </div>
            )}

            {selectedTopic === 'Shipping Inquiry' && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#14171f] border border-gray-200 dark:border-neutral-800 space-y-2 text-[11px]">
                <p className="font-bold text-gray-900 dark:text-white">
                  Shipping Inquiry — Active Shipments &amp; Cart Items
                </p>

                {loadingShipping ? (
                  <p className="text-gray-500 text-[10px]">Checking your account shipments...</p>
                ) : hasActiveShipping ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active shipment detected on your account — WhatsApp Shipping Support unlocked!
                    </p>
                    {activeShippingOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className={`p-2 rounded-lg border text-[10px] flex items-center justify-between gap-2 ${
                          selectedActiveOrder?.id === ord.id
                            ? 'border-creamy-500 bg-creamy-500/10'
                            : 'border-gray-200 dark:border-neutral-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate">
                            Order #{ord.orderNumber} • {ord.status}
                          </p>
                          <p className="text-gray-500 dark:text-neutral-400 truncate">
                            Track: {ord.trackingNumber || `TRK-${ord.orderNumber}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTagActiveOrder(ord)}
                          className="px-2 py-1 rounded bg-creamy-500 text-black font-black text-[9px] uppercase shrink-0"
                        >
                          Tag Order
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[10px] text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3 shrink-0" />
                      No active shipping recorded in your account yet.
                    </p>
                    <p>
                      WhatsApp is unlocked only once an order is in active shipping (PROCESSING / SHIPPED). You can still tag a product from your Cart below or ask LiveChat support directly.
                    </p>
                  </div>
                )}

                {whatsAppGateNotice && (
                  <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-[10px] text-red-700 dark:text-red-300 font-medium">
                    {whatsAppGateNotice}
                  </div>
                )}

                {cartItems.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Items in your cart:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cartItems.map((ci) => (
                        <button
                          key={ci.id}
                          type="button"
                          onClick={() => handleTagCartItem(ci)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-[#1b1f2a] text-[10px] font-semibold hover:border-creamy-500"
                        >
                          <span>Tag: {ci.product?.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {verifiedWaUrl ? (
                    <a
                      href={verifiedWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20ba5a] text-white font-black text-[10px] uppercase tracking-wider shadow-sm"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open WhatsApp for Shipment
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Active shipping order (PROCESSING / SHIPPED) required to unlock WhatsApp"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-neutral-800 text-gray-500 dark:text-neutral-500 font-bold text-[10px] uppercase cursor-not-allowed"
                    >
                      <Lock className="w-3 h-3" />
                      WhatsApp Locked (No Active Shipping)
                    </button>
                  )}
                  <Link
                    to="/faq#shipping"
                    onClick={() => setIsChatOpen(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-gray-200 font-bold text-[10px] uppercase"
                  >
                    <BookOpen className="w-3 h-3" /> Read FAQ
                  </Link>
                  <button
                    type="button"
                    onClick={handleTalkToPerson}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black font-bold text-[10px] uppercase"
                  >
                    Talk to a Person
                  </button>
                </div>
              </div>
            )}

            {selectedTopic === 'Item Purchase' && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#14171f] border border-gray-200 dark:border-neutral-800 space-y-2 text-[11px]">
                <p className="font-bold text-gray-900 dark:text-white">
                  Item Purchase — Price, Specs &amp; Availability
                </p>
                {selectedProducts.length > 0 ? (
                  <p className="text-gray-600 dark:text-neutral-400 leading-snug">
                    You have tagged <strong>{selectedProducts.map((p) => p.name).join(', ')}</strong>. Click any tagged card below to read its full catalog page or ask our agent directly.
                  </p>
                ) : (
                  <p className="text-gray-600 dark:text-neutral-400 leading-snug">
                    Open any unit in our live catalog and click <strong>Ask Support / Tag in LiveChat</strong> so its live price and SKU are attached to your thread.
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={handleBrowseCatalogForTag}
                    className="px-2.5 py-1.5 rounded-lg bg-creamy-500 hover:bg-creamy-400 text-black font-black text-[10px] uppercase"
                  >
                    Select Product in Catalog
                  </button>
                  <Link
                    to="/faq"
                    onClick={() => setIsChatOpen(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-gray-200 font-bold text-[10px] uppercase"
                  >
                    <BookOpen className="w-3 h-3" /> Read FAQ
                  </Link>
                  <button
                    type="button"
                    onClick={handleTalkToPerson}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black font-bold text-[10px] uppercase"
                  >
                    Talk to a Person
                  </button>
                </div>
              </div>
            )}

            {selectedTopic === 'Payment Queries' && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#14171f] border border-gray-200 dark:border-neutral-800 space-y-2 text-[11px]">
                <p className="font-bold text-gray-900 dark:text-white">Select a payment question to narrow your issue:</p>
                <div className="space-y-1">
                  {PAYMENT_SUB_QUESTIONS.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setSelectedPaymentSubId(q.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-colors ${
                        selectedPaymentSubId === q.id
                          ? 'border-creamy-500 bg-creamy-500/15 text-gray-900 dark:text-white'
                          : 'border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-300 hover:border-creamy-500/50'
                      }`}
                    >
                      {q.question}
                    </button>
                  ))}
                </div>
                {selectedPaymentSubId && (
                  <div className="p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-[10px] text-gray-800 dark:text-emerald-200 space-y-1.5">
                    <p>{PAYMENT_SUB_QUESTIONS.find((q) => q.id === selectedPaymentSubId)?.guidance}</p>
                    <button
                      type="button"
                      onClick={() => {
                        const qObj = PAYMENT_SUB_QUESTIONS.find((q) => q.id === selectedPaymentSubId)
                        if (qObj) handleSendMessage(undefined, qObj.question)
                      }}
                      className="px-2.5 py-1 rounded bg-creamy-500 text-black font-black text-[9px] uppercase"
                    >
                      Send This Question to Admin
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    to="/faq#payments"
                    onClick={() => setIsChatOpen(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-gray-200 font-bold text-[10px] uppercase"
                  >
                    <BookOpen className="w-3 h-3" /> Read FAQ
                  </Link>
                  <button
                    type="button"
                    onClick={handleTalkToPerson}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black font-bold text-[10px] uppercase"
                  >
                    Talk to a Person
                  </button>
                </div>
              </div>
            )}

            {selectedTopic === 'Return Policy' && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#14171f] border border-gray-200 dark:border-neutral-800 space-y-2 text-[11px]">
                <p className="font-bold text-gray-900 dark:text-white">What are your return policy?</p>
                <p className="text-gray-600 dark:text-neutral-300 leading-snug">
                  We offer <strong>same-day balance deposit</strong> into your DriveFlyElectric Wallet upon processing of return by a customer support agent (21-day return window). You can request a refund or an equal/close-value catalog exchange.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    to="/account?tab=returns"
                    onClick={() => setIsChatOpen(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-creamy-500 text-black font-black text-[10px] uppercase"
                  >
                    Request Return in Account
                  </Link>
                  <Link
                    to="/faq#returns"
                    onClick={() => setIsChatOpen(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-gray-200 font-bold text-[10px] uppercase"
                  >
                    <BookOpen className="w-3 h-3" /> Read FAQ
                  </Link>
                  <button
                    type="button"
                    onClick={handleTalkToPerson}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black font-bold text-[10px] uppercase"
                  >
                    Talk to a Person
                  </button>
                </div>
              </div>
            )}

            {/* Tagged Real Catalog Items Strip (Linked to real catalog product pages) */}
            {selectedProducts.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
                  Tagged Catalog Item(s):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProducts.map((p) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-white dark:bg-[#14171f] border border-creamy-500/40 text-[10px]"
                    >
                      {p.image && (
                        <img
                          src={getSafeMediaUrl(p.image)}
                          alt={p.name}
                          className="w-5 h-5 rounded object-cover"
                        />
                      )}
                      <Link
                        to={`/product/${p.id}`}
                        onClick={() => setIsChatOpen(false)}
                        className="font-bold text-gray-900 dark:text-white hover:text-creamy-500 truncate max-w-[140px]"
                        title="Read full product details in catalog"
                      >
                        {p.name}
                      </Link>
                      <span className="font-black text-creamy-600 dark:text-creamy-400">
                        ${Number(p.price || 0).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTaggedProduct(p.id)}
                        aria-label={`Remove ${p.name} tag`}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thread Switcher if user has multiple historical threads */}
            {sessionsList.length > 1 && (
              <div className="flex items-center gap-1.5 text-[10px] pt-1">
                <span className="font-bold text-gray-500">Your Threads:</span>
                <select
                  value={sessionId}
                  onChange={(e) => {
                    const chosen = sessionsList.find((s) => s.id === e.target.value)
                    if (chosen) applySession(chosen)
                  }}
                  className="px-2 py-1 rounded border border-gray-200 dark:border-neutral-700 bg-white dark:bg-[#14171f] text-gray-900 dark:text-white text-[10px] font-semibold"
                >
                  {sessionsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.topic} ({s.messages?.length || 0} msgs)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Persistent Real Bidirectional Messages Thread (Client <-> Admin only) */}
          <div className="flex-1 min-h-[160px] overflow-y-auto px-3.5 py-3 space-y-2.5 bg-white dark:bg-[#111319]">
            {isInitializing && messages.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-500">
                Loading your persistent chat history...
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-6 px-3 rounded-xl border border-dashed border-gray-200 dark:border-neutral-800 space-y-1.5">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  No messages sent yet in this thread.
                </p>
                <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                  Write your message below to contact an admin directly. Your conversation history stays saved on your account.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isClient = msg.senderRole === 'CLIENT'
                return (
                  <div key={msg.id} className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                        isClient
                          ? 'bg-creamy-500 text-black font-medium rounded-br-sm'
                          : 'bg-gray-100 dark:bg-[#1e2330] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-neutral-700 rounded-bl-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            isClient ? 'text-black/75' : 'text-creamy-600 dark:text-creamy-400'
                          }`}
                        >
                          {isClient ? 'You' : msg.senderName || 'Support Admin'}
                        </span>
                        <span className={`text-[9px] ${isClient ? 'text-black/60' : 'text-gray-400'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                )
              })
            )}

            {showReplyTimeBanner && (
              <div className="p-2.5 rounded-xl bg-creamy-500/10 border border-creamy-500/30 text-[11px] text-gray-800 dark:text-gray-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-creamy-600 dark:text-creamy-400 shrink-0" />
                  <span>Message recorded &amp; sent to Admin. An admin typically replies in minutes.</span>
                </div>
                <Link
                  to="/faq"
                  onClick={() => setIsChatOpen(false)}
                  className="text-[10px] font-black uppercase text-creamy-600 dark:text-creamy-400 underline shrink-0"
                >
                  Read FAQ
                </Link>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {chatError && (
            <div className="px-3.5 py-2 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900/50 text-[11px] text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{chatError}</span>
            </div>
          )}

          {/* Direct Message Composer */}
          <form
            onSubmit={(e) => handleSendMessage(e)}
            className="p-3 bg-gray-50 dark:bg-[#191c24] border-t border-gray-200 dark:border-neutral-800 flex items-center gap-2"
          >
            <input
              ref={messageInputRef}
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Write your custom message to Admin..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#111319] border border-gray-300 dark:border-neutral-700 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-creamy-500"
            />
            <button
              type="submit"
              disabled={isSending || !messageInput.trim()}
              className="p-2.5 rounded-xl bg-creamy-500 hover:bg-creamy-400 disabled:opacity-40 text-black font-black transition-colors"
              aria-label="Send message to admin"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Bottom-Right Floating Support Hub: Primary LiveChat + Secondary Shipping-Gated WhatsApp */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
        {/* Secondary Channel: WhatsApp Shipping Support (Gated behind Auth + Active PROCESSING/SHIPPED Shipment) */}
        <div className="flex items-center">
          <div
            className={`hidden sm:flex items-center gap-2 mr-3 px-3 py-1.5 rounded-full bg-gray-900/95 dark:bg-black/95 text-white text-xs font-semibold backdrop-blur-md shadow-xl border border-white/10 transition-all duration-200 pointer-events-none select-none ${
              hoveredBtn === 'whatsapp' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
            }`}
          >
            {isAuthenticated && hasActiveShipping ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
                <span>WhatsApp: Active Shipping Support</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-amber-400" />
                <span>WhatsApp: Active Shipment Required</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleSecondaryWhatsAppClick}
            onMouseEnter={() => setHoveredBtn('whatsapp')}
            onMouseLeave={() => setHoveredBtn(null)}
            aria-label="WhatsApp Shipping Support (Active Shipping Required)"
            title={
              isAuthenticated && hasActiveShipping
                ? 'WhatsApp Shipping Support (Active order ready)'
                : 'WhatsApp is secondary for active shipments (Account & PROCESSING/SHIPPED order required)'
            }
            className={`relative flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none ${
              isAuthenticated && hasActiveShipping
                ? 'bg-[#25D366] hover:bg-[#20ba5a] text-white shadow-[#25D366]/40'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
            }`}
          >
            {(!isAuthenticated || !hasActiveShipping) && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black flex items-center justify-center border border-gray-900">
                <Lock className="w-2.5 h-2.5" />
              </span>
            )}
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.456h.005c6.554 0 11.89-5.335 11.893-11.893 0-3.177-1.237-6.164-3.486-8.414z" />
            </svg>
          </button>
        </div>

        {/* Primary Channel: Contact Support / LiveChat Button */}
        <div className="flex items-center">
          {!isChatOpen && unreadClientCount > 0 ? (
            <button
              type="button"
              onClick={() => openAuthenticatedSupport()}
              className="flex items-center gap-2.5 mr-3 px-3.5 py-2 rounded-2xl bg-gray-900/95 dark:bg-black/95 text-white text-xs backdrop-blur-md shadow-2xl border border-creamy-500/50 hover:border-creamy-400 transition-all max-w-[270px] text-left cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-creamy-400 tracking-wider">
                  New Admin Reply ({unreadClientCount})
                </p>
                <p className="text-[11px] font-medium text-gray-200 truncate">
                  {messages.length > 0 ? messages[messages.length - 1].content : 'Click to view your message'}
                </p>
              </div>
            </button>
          ) : (
            <div
              className={`hidden sm:flex items-center gap-2 mr-3 px-3.5 py-1.5 rounded-full bg-gray-900/95 dark:bg-black/95 text-white text-xs font-semibold backdrop-blur-md shadow-xl border border-creamy-500/30 transition-all duration-200 pointer-events-none select-none ${
                hoveredBtn === 'livechat' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-creamy-400 animate-pulse" />
              <span>
                {isAuthenticated ? 'Contact Support • LiveChat' : 'Contact Support • Create Account'}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => (isChatOpen ? setIsChatOpen(false) : openAuthenticatedSupport())}
            onMouseEnter={() => setHoveredBtn('livechat')}
            onMouseLeave={() => setHoveredBtn(null)}
            aria-label="Contact Support LiveChat"
            title="LiveChat — Contact DriveFlyElectric.shop Support"
            className="relative flex items-center justify-center w-14 h-14 rounded-full bg-creamy-500 hover:bg-creamy-400 text-black shadow-xl shadow-creamy-500/30 hover:shadow-creamy-500/50 transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none border-2 border-white dark:border-[#13151b]"
          >
            {unreadClientCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white dark:border-black animate-bounce">
                {unreadClientCount}
              </span>
            ) : (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white dark:border-black" />
              </span>
            )}

            {isChatOpen ? (
              <X className="w-6 h-6 stroke-[2.5]" />
            ) : (
              <MessageSquare className="w-6 h-6 stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>
    </>
  )
}

export default WhatsAppButton
