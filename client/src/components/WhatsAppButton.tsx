import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  Headphones,
  AlertCircle,
  Clock,
  Lock,
  Trash2,
  History,
  ArrowLeft,
  ChevronRight
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

const PENDING_LIVECHAT_KEY = 'dfe_pending_livechat_intent'

const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts
    .map((p, idx) => (idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p))))
    .join('/')
}

type SupportViewMode = 'ACTIVE_THREAD' | 'INQUIRIES_HUB'

export const WhatsAppButton: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { items: cartItems } = useCart()

  const [hoveredBtn, setHoveredBtn] = useState<'whatsapp' | 'livechat' | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [viewMode, setViewMode] = useState<SupportViewMode>('ACTIVE_THREAD')

  const [sessionsList, setSessionsList] = useState<SupportSession[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [session, setSession] = useState<SupportSession | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)

  const [selectedTopic, setSelectedTopic] = useState<SupportTopic>('General Inquiry')
  const [selectedProducts, setSelectedProducts] = useState<SupportSelectedProduct[]>([])

  const [activeShippingOrders, setActiveShippingOrders] = useState<Order[]>([])
  const [hasActiveShipping, setHasActiveShipping] = useState(false)
  const [selectedActiveOrderId, setSelectedActiveOrderId] = useState<string | null>(null)

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

  const totalUnreadCount = useMemo(() => {
    if (!isAuthenticated) return 0
    return sessionsList.reduce((acc, s) => acc + Number(s.unreadClientCount || 0), 0)
  }, [isAuthenticated, sessionsList])

  const redirectToCreateAccountFirst = useCallback(
    (intent?: { sessionId?: string; topic?: SupportTopic; items?: SupportSelectedProduct[]; activeOrderId?: string | null }) => {
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

    // Keep session updated in sessionsList
    setSessionsList((prev) => {
      const idx = prev.findIndex((s) => s.id === nextSession.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = nextSession
        return next
      }
      return [nextSession, ...prev]
    })
  }, [])

  // Open a specific historical thread: sets active thread, marks read, and hides all template clutter
  const handleOpenSpecificThread = useCallback(
    async (thread: SupportSession) => {
      applySession(thread)
      setViewMode('ACTIVE_THREAD')
      setRecentlySentNotice(false)
      setChatError(null)

      if (Number(thread.unreadClientCount || 0) > 0) {
        // Optimistically clear unread badge locally
        setSessionsList((prev) =>
          prev.map((s) => (s.id === thread.id ? { ...s, unreadClientCount: 0 } : s))
        )
        // Mark read on server
        supportApi
          .getSession(thread.id, true)
          .then((res) => {
            if (res.success && res.data) applySession(res.data)
          })
          .catch(() => {})
      }
    },
    [applySession]
  )

  const loadOrInitAuthenticatedSession = useCallback(
    async (overrides?: {
      sessionId?: string
      topic?: SupportTopic
      items?: SupportSelectedProduct[]
      activeOrderId?: string | null
      forceNew?: boolean
    }) => {
      if (!isAuthenticated || !user?.id) return null
      setIsInitializing(true)
      setChatError(null)
      try {
        const mySessionsRes = await supportApi.getMySessions()
        const existingSessions = mySessionsRes.success && Array.isArray(mySessionsRes.data) ? mySessionsRes.data : []
        setSessionsList(existingSessions)

        // If target sessionId was requested explicitly, load that exact thread
        if (overrides?.sessionId) {
          const match = existingSessions.find((s) => s.id === overrides.sessionId)
          if (match) {
            applySession(match)
            return match
          }
          const getRes = await supportApi.getSession(overrides.sessionId, true)
          if (getRes.success && getRes.data) {
            applySession(getRes.data)
            return getRes.data
          }
        }

        // If user wants a new inquiry (or has no existing sessions), initialize a new thread
        const shouldStartNew = overrides?.forceNew || (existingSessions.length === 0 && !sessionId)
        const targetSessionId = shouldStartNew ? undefined : (sessionId || existingSessions[0]?.id)
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email

        const initRes = await supportApi.initSession({
          sessionId: targetSessionId,
          userId: user.id,
          visitorName: fullName,
          visitorEmail: user.email,
          visitorPhone: user.phone || undefined,
          topic: overrides?.topic || (targetSessionId ? existingSessions.find((s) => s.id === targetSessionId)?.topic as SupportTopic : undefined) || selectedTopic,
          selectedProducts: overrides?.items || (targetSessionId ? existingSessions.find((s) => s.id === targetSessionId)?.selectedProducts : undefined) || selectedProducts,
          activeOrderId: overrides?.activeOrderId ?? (targetSessionId ? existingSessions.find((s) => s.id === targetSessionId)?.activeOrderId : null)
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
    [isAuthenticated, user, sessionId, selectedTopic, selectedProducts, applySession]
  )

  const openAuthenticatedSupport = useCallback(
    async (intent?: {
      sessionId?: string
      topic?: SupportTopic
      items?: SupportSelectedProduct[]
      activeOrderId?: string | null
      focusComposer?: boolean
      viewMode?: SupportViewMode
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

      setIsChatOpen(true)

      // When opening with an explicit intent or thread, switch directly to conversation view
      // Otherwise, if user has multiple past sessions and didn't specify an intent, open hub
      if (intent?.sessionId) {
        setViewMode('ACTIVE_THREAD')
      } else if (intent?.topic || (intent?.items && intent.items.length > 0)) {
        setViewMode('ACTIVE_THREAD')
      } else if (intent?.viewMode) {
        setViewMode(intent.viewMode)
      }

      await Promise.all([
        loadOrInitAuthenticatedSession({
          sessionId: intent?.sessionId,
          topic: intent?.topic,
          items: intent?.items,
          activeOrderId: intent?.activeOrderId,
          forceNew: Boolean(intent?.topic && !intent?.sessionId)
        }),
        refreshActiveShipping()
      ])

      if (intent?.focusComposer) {
        setTimeout(() => messageInputRef.current?.focus(), 80)
      }
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
          // Default active session to the latest updated conversation
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
        sessionId: detail.sessionId || undefined,
        topic: detail.topic as SupportTopic | undefined,
        items: Array.isArray(detail.items) ? detail.items : undefined,
        activeOrderId: detail.activeOrderId || undefined,
        focusComposer: Boolean(detail.focusComposer),
        viewMode: detail.sessionId ? 'ACTIVE_THREAD' : undefined
      })
    }
    window.addEventListener('dfe:open-livechat', handleOpenLiveChat)
    return () => window.removeEventListener('dfe:open-livechat', handleOpenLiveChat)
  }, [openAuthenticatedSupport])

  // Mark client messages read when opening LiveChat drawer on active thread
  useEffect(() => {
    if (!isChatOpen || !isAuthenticated || !sessionId || viewMode !== 'ACTIVE_THREAD') return
    supportApi
      .getSession(sessionId, true)
      .then((res) => {
        if (res.success && res.data) {
          setSession(res.data)
          setSessionsList((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, unreadClientCount: 0 } : s))
          )
        }
      })
      .catch(() => {})
  }, [isChatOpen, isAuthenticated, sessionId, viewMode])

  // Real-time SSE live chat stream for current active thread + periodic sync for all user threads
  useEffect(() => {
    if (!isAuthenticated || !sessionReady || !sessionId) return

    const unsubscribeStream = supportApi.subscribeSessionStream(
      sessionId,
      (updatedSession) => {
        setSession(updatedSession)
        setSessionsList((prev) => {
          const idx = prev.findIndex((s) => s.id === updatedSession.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = updatedSession
            return next
          }
          return [updatedSession, ...prev]
        })
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
              if (res.success && res.data) {
                setSession(res.data)
                setSessionsList((prev) =>
                  prev.map((s) => (s.id === sessionId ? { ...s, unreadClientCount: 0 } : s))
                )
              }
            })
            .catch(() => {})
        }
      },
      (connected) => {
        sseConnectedRef.current = connected
      }
    )

    const fallbackInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      // Periodically refresh all user threads so new admin replies on other threads update the unread count
      supportApi
        .getMySessions()
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setSessionsList(res.data)
            const activeMatch = res.data.find((s) => s.id === sessionId)
            if (activeMatch) setSession(activeMatch)
          }
        })
        .catch(() => {})
    }, 8000)

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
    if (isChatOpen && viewMode === 'ACTIVE_THREAD') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [session?.messages?.length, isChatOpen, viewMode, recentlySentNotice])

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
    await openAuthenticatedSupport({ topic: 'Shipping Inquiry' })
  }

  // Starts or selects an inquiry topic: immediately transitions to ACTIVE_THREAD so templates disappear
  const handleStartInquiryTopic = async (topic: SupportTopic, initialMessage?: string) => {
    setSelectedTopic(topic)
    setChatError(null)

    // Switch immediately to conversation view — all category selectors vanish
    setViewMode('ACTIVE_THREAD')

    if (topic === 'Shipping Inquiry') {
      refreshActiveShipping().catch(() => {})
    }

    const newSession = await loadOrInitAuthenticatedSession({
      topic,
      items: selectedProducts,
      activeOrderId: topic === 'Shipping Inquiry' ? selectedActiveOrderId : null,
      forceNew: true
    })

    if (initialMessage && newSession?.id) {
      await handleSendMessage(undefined, initialMessage, newSession.id)
    } else {
      setTimeout(() => messageInputRef.current?.focus(), 80)
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
          if (res.success && res.data) applySession(res.data)
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
    const initialText = `Shipping inquiry for item in my cart: ${tagged.name} ($${Number(tagged.price).toLocaleString()} USD).`
    await handleStartInquiryTopic('Shipping Inquiry', initialText)
  }

  const handleSendMessage = async (e?: React.FormEvent, explicitContent?: string, targetSessionIdOverride?: string) => {
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
      let targetId = targetSessionIdOverride || sessionId
      if (!targetId) {
        const init = await loadOrInitAuthenticatedSession({
          topic: selectedTopic,
          items: selectedProducts,
          activeOrderId: selectedTopic === 'Shipping Inquiry' ? selectedActiveOrderId : null,
          forceNew: true
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
        setViewMode('ACTIVE_THREAD')
      } else {
        setChatError(res.error || 'Message could not be sent.')
      }
    } catch (err: any) {
      setChatError(err?.message || 'Unable to send support message right now.')
    } finally {
      setIsSending(false)
    }
  }

  const handleStartCustomMessage = () => {
    handleStartInquiryTopic(selectedTopic || 'General Inquiry')
  }

  const messages = (session?.messages || []).filter((m) => m.senderRole !== 'AI_ASSISTANT')
  const lastMessageIsClient =
    messages.length > 0 && messages[messages.length - 1]?.senderRole === 'CLIENT'
  const showReplyTimeBanner = isAuthenticated && (recentlySentNotice || lastMessageIsClient)

  return (
    <>
      {/* LiveChat Drawer (Only open when authenticated) */}
      {isChatOpen && isAuthenticated && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[94vw] sm:w-[440px] h-[82vh] max-h-[680px] flex flex-col bg-white dark:bg-[#13151b] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden transition-all"
          role="dialog"
          aria-label="DriveFlyElectric.shop Support LiveChat"
        >
          {/* =========================================================================
              VIEW MODE A: ACTIVE CONVERSATION VIEW
              When viewing an active thread, ALL template features disappear completely!
             ========================================================================= */}
          {viewMode === 'ACTIVE_THREAD' ? (
            <>
              {/* Active Conversation Top Bar */}
              <div className="bg-gray-950 text-white px-3.5 py-3 flex items-center justify-between border-b border-creamy-500/30 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setViewMode('INQUIRIES_HUB')}
                    title="View all inquiries or start a new inquiry"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Inquiries ({sessionsList.length})</span>
                  </button>

                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="font-anton uppercase tracking-wider text-xs text-white truncate max-w-[150px]">
                      {session?.topic || selectedTopic}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                        session?.status === 'RESOLVED'
                          ? 'bg-gray-800 text-gray-400 border-gray-700'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {session?.status || 'OPEN'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Link
                    to="/account?tab=chats"
                    onClick={() => setIsChatOpen(false)}
                    title="View all my support chats in Account"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-creamy-400 hover:bg-white/5 transition-colors"
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

              {/* Tagged Product / Order Bar (if any) */}
              {selectedProducts.length > 0 && (
                <div className="px-3.5 py-2 bg-creamy-500/10 dark:bg-[#1a1e28] border-b border-creamy-500/20 flex items-center justify-between gap-2 text-[10px] flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0 overflow-x-auto py-0.5">
                    <span className="font-bold text-gray-500 uppercase flex-shrink-0">Tagged Item:</span>
                    {selectedProducts.map((p) => (
                      <div
                        key={p.id}
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-lg bg-white dark:bg-[#12141a] border border-creamy-500/40 text-[10px] flex-shrink-0"
                      >
                        {p.image && (
                          <img
                            src={getSafeMediaUrl(p.image)}
                            alt={p.name}
                            className="w-4 h-4 rounded object-cover"
                          />
                        )}
                        <Link
                          to={`/product/${p.id}`}
                          onClick={() => setIsChatOpen(false)}
                          className="font-bold text-gray-900 dark:text-white hover:text-creamy-500 truncate max-w-[130px]"
                          title="Read product specifications in catalog"
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
                          className="text-gray-400 hover:text-red-500 ml-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 100% Full Space Conversation Message Stream */}
              <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3 bg-white dark:bg-[#111319]">
                {isInitializing && messages.length === 0 ? (
                  <div className="text-center py-12 text-xs text-gray-500">
                    Loading your persistent chat messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-gray-200 dark:border-neutral-800 space-y-2">
                    <div className="w-10 h-10 rounded-2xl bg-creamy-500/15 text-creamy-600 dark:text-creamy-400 flex items-center justify-center mx-auto">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      Thread started for {selectedTopic}.
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-neutral-400 max-w-xs mx-auto">
                      Type your message below to send directly to an admin specialist. Your entire thread is permanently saved.
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
                              ? 'bg-creamy-500 text-black font-medium rounded-br-xs'
                              : 'bg-gray-100 dark:bg-[#1e2330] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-neutral-700 rounded-bl-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider ${
                                isClient ? 'text-black/75' : 'text-creamy-600 dark:text-creamy-400'
                              }`}
                            >
                              {isClient ? 'You' : msg.senderName || 'Support Specialist'}
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
                  <div className="p-2.5 rounded-xl bg-creamy-500/10 border border-creamy-500/30 text-[11px] text-gray-800 dark:text-gray-200 flex items-center justify-between gap-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="w-3.5 h-3.5 text-creamy-600 dark:text-creamy-400 shrink-0" />
                      <span className="truncate">Admin notified — typically replies in minutes.</span>
                    </div>
                    <Link
                      to="/faq"
                      onClick={() => setIsChatOpen(false)}
                      className="text-[10px] font-black uppercase text-creamy-600 dark:text-creamy-400 underline shrink-0 hover:text-creamy-500"
                    >
                      Read FAQ
                    </Link>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {chatError && (
                <div className="px-3.5 py-2 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900/50 text-[11px] text-red-700 dark:text-red-300 flex items-center gap-2 flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}

              {/* Direct Reply Composer */}
              <form
                onSubmit={(e) => handleSendMessage(e)}
                className="p-3 bg-gray-50 dark:bg-[#191c24] border-t border-gray-200 dark:border-neutral-800 flex items-center gap-2 flex-shrink-0"
              >
                <input
                  ref={messageInputRef}
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Reply directly to support admin..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#111319] border border-gray-300 dark:border-neutral-700 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                />
                <button
                  type="submit"
                  disabled={isSending || !messageInput.trim()}
                  className="p-2.5 rounded-xl bg-creamy-500 hover:bg-creamy-400 disabled:opacity-40 text-black font-black transition-colors shrink-0"
                  aria-label="Send reply to admin"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            /* =========================================================================
               VIEW MODE B: INQUIRIES HUB VIEW
               Multi-thread list + category cards to launch a new inquiry
               ========================================================================= */
            <>
              {/* Inquiries Hub Header */}
              <div className="bg-gray-950 text-white px-4 py-3.5 flex items-center justify-between border-b border-creamy-500/30 flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-creamy-500 flex items-center justify-center text-black font-black shadow-md flex-shrink-0">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black uppercase tracking-wider text-white truncate">
                      DriveFlyElectric.shop Support Hub
                    </h3>
                    <p className="text-[10px] text-gray-400 truncate">
                      Signed in as {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {session && (
                    <button
                      type="button"
                      onClick={() => setViewMode('ACTIVE_THREAD')}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-creamy-500 text-black hover:bg-creamy-400 transition-colors"
                    >
                      Resume Chat
                    </button>
                  )}
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

              {/* Inquiries Hub Body: Saved Threads + Start New Inquiry */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-[#12141a]">
                {/* Popping Welcome Card */}
                <div className="p-3.5 rounded-2xl bg-creamy-500/15 border border-creamy-500/40 text-gray-900 dark:text-white space-y-1">
                  <p className="text-xs font-black text-creamy-700 dark:text-creamy-400">
                    Welcome to DriveFlyElectric.shop Support, how can we be of help?
                  </p>
                  <p className="text-[11px] text-gray-600 dark:text-neutral-300">
                    Select an inquiry category below to contact an admin directly, or reopen any of your saved conversations.
                  </p>
                </div>

                {/* Section 1: Start a New Inquiry */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Start a New Inquiry:
                    </span>
                    <button
                      type="button"
                      onClick={handleStartCustomMessage}
                      className="text-[10px] font-black uppercase text-creamy-600 dark:text-creamy-400 hover:underline"
                    >
                      + Write Custom Message
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const Icon = cat.icon
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleStartInquiryTopic(cat.id)}
                          className="p-2.5 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#181b24] hover:border-creamy-500/80 hover:bg-creamy-500/5 transition-all text-left group flex items-start gap-2 shadow-2xs"
                        >
                          <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-neutral-800 group-hover:bg-creamy-500 group-hover:text-black flex items-center justify-center shrink-0 transition-colors">
                            <Icon className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300 group-hover:text-black" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-900 dark:text-white leading-tight group-hover:text-creamy-500">
                              {cat.label}
                            </p>
                            <p className="text-[9px] text-gray-500 dark:text-neutral-400 truncate mt-0.5">
                              {cat.shortDesc}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Shipping & Active Cart Support Strip */}
                {cartItems.length > 0 && (
                  <div className="p-3 rounded-xl bg-white dark:bg-[#181b24] border border-gray-200 dark:border-neutral-800 space-y-2">
                    <p className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1.5">
                      <Truck className="w-3 h-3 text-creamy-500" />
                      Inquire about items in your cart:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cartItems.map((ci) => (
                        <button
                          key={ci.id}
                          type="button"
                          onClick={() => handleTagCartItem(ci)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-[#12141a] text-[10px] font-bold hover:border-creamy-500 transition-colors truncate max-w-full"
                        >
                          <span>Ask about: {ci.product?.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 2: Saved Persistent Conversations */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Your Conversations ({sessionsList.length}):
                    </span>
                    <Link
                      to="/account?tab=chats"
                      onClick={() => setIsChatOpen(false)}
                      className="text-[10px] font-bold text-gray-400 hover:text-creamy-400 flex items-center gap-0.5"
                    >
                      <span>All in Account</span>
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {sessionsList.length === 0 ? (
                    <div className="p-6 text-center rounded-xl border border-dashed border-gray-200 dark:border-neutral-800 text-xs text-gray-400 space-y-1">
                      <p className="font-semibold text-gray-700 dark:text-gray-300">No conversations started yet.</p>
                      <p className="text-[10px]">Click any category above to start your first support thread.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessionsList.map((s) => {
                        const sMessages = (s.messages || []).filter((m) => m.senderRole !== 'AI_ASSISTANT')
                        const lastMsg = sMessages[sMessages.length - 1]
                        const hasUnread = Number(s.unreadClientCount || 0) > 0
                        const isCurrentActive = s.id === sessionId

                        return (
                          <div
                            key={s.id}
                            onClick={() => handleOpenSpecificThread(s)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                              isCurrentActive
                                ? 'border-creamy-500 bg-creamy-500/10'
                                : 'border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#181b24] hover:border-creamy-500/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-anton uppercase tracking-wider text-xs text-gray-900 dark:text-white truncate">
                                  {s.topic}
                                </span>
                                {hasUnread && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[9px] font-black uppercase flex items-center gap-1 animate-pulse">
                                    <span className="w-1 h-1 rounded-full bg-black" />
                                    New Reply ({s.unreadClientCount})
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-gray-400 shrink-0">
                                {new Date(s.updatedAt || s.createdAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>

                            <p className="text-[11px] text-gray-600 dark:text-neutral-300 truncate">
                              {lastMsg
                                ? `${lastMsg.senderRole === 'CLIENT' ? 'You: ' : 'Admin: '}${lastMsg.content}`
                                : 'Thread started — click to write message'}
                            </p>

                            <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-neutral-800/60 text-[9px] text-gray-400">
                              <span>{sMessages.length} message(s)</span>
                              <span className="font-bold text-creamy-600 dark:text-creamy-400 group-hover:underline">
                                Open thread &rarr;
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
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
          {!isChatOpen && totalUnreadCount > 0 ? (
            <button
              type="button"
              onClick={() => openAuthenticatedSupport()}
              className="flex items-center gap-2.5 mr-3 px-3.5 py-2 rounded-2xl bg-gray-900/95 dark:bg-black/95 text-white text-xs backdrop-blur-md shadow-2xl border border-creamy-500/50 hover:border-creamy-400 transition-all max-w-[270px] text-left cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-creamy-400 tracking-wider">
                  New Admin Reply ({totalUnreadCount})
                </p>
                <p className="text-[11px] font-medium text-gray-200 truncate">
                  Click to open your support thread
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
            {totalUnreadCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white dark:border-black animate-bounce">
                {totalUnreadCount}
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
