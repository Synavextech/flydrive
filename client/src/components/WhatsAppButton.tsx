import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  MessageSquare,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  ShoppingBag,
  Sparkles,
  User as UserIcon,
  Truck,
  CreditCard,
  HelpCircle,
  Package
} from 'lucide-react'
import { useProducts } from '../contexts/ProductContext'
import { useAuth } from '../contexts/AuthContext'
import { supportApi } from '../services/api'
import { SupportSession, SupportSelectedProduct, SupportTopic } from '../types'
import { getSupportWhatsAppDigits } from '../utils/receiptPdf'

const SUPPORT_TOPICS: Array<{ id: SupportTopic; label: string; icon: any }> = [
  { id: 'Item Purchase', label: 'Item Purchase', icon: ShoppingBag },
  { id: 'Payment Issue', label: 'Payment Issue', icon: CreditCard },
  { id: 'Shipping Issue', label: 'Shipping Issue', icon: Truck },
  { id: 'General Inquiry', label: 'General Inquiry', icon: HelpCircle },
]

// Safe URL encoder for local media paths
const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts.map((p, idx) => idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p))).join('/')
}

export const WhatsAppButton: React.FC = () => {
  const location = useLocation()
  const { products, currentProduct, fetchProducts } = useProducts()
  const { user } = useAuth()

  const [hoveredBtn, setHoveredBtn] = useState<'whatsapp' | 'livechat' | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')

  // Persistent visitor/session ID in localStorage
  const [sessionId] = useState<string>(() => {
    const saved = localStorage.getItem('driveflyelectric_support_session_id')
    if (saved) return saved
    const created = `dfe_chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    localStorage.setItem('driveflyelectric_support_session_id', created)
    return created
  })

  const [session, setSession] = useState<SupportSession | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<SupportTopic>('Item Purchase')
  const [selectedProducts, setSelectedProducts] = useState<SupportSelectedProduct[]>([])
  const [visitorName, setVisitorName] = useState<string>(() => localStorage.getItem('dfe_visitor_name') || '')
  const [visitorEmail, setVisitorEmail] = useState<string>(() => localStorage.getItem('dfe_visitor_email') || '')
  const [visitorPhone, setVisitorPhone] = useState<string>(() => localStorage.getItem('dfe_visitor_phone') || '')
  const [messageInput, setMessageInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Retrieve configured WhatsApp phone number
  const cleanNumber = getSupportWhatsAppDigits()

  // Ensure products are loaded so the catalogue picker is always populated
  useEffect(() => {
    if (!products || products.length === 0) {
      fetchProducts()
    }
  }, [])

  // Sync authenticated user profile into visitor fields
  useEffect(() => {
    if (user) {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
      if (fullName && !visitorName) setVisitorName(fullName)
      if (user.email && !visitorEmail) setVisitorEmail(user.email)
      if (user.phone && !visitorPhone) setVisitorPhone(user.phone)
    }
  }, [user])

  // Auto-select product when visitor views a product detail page (/product/:id or /products/:id)
  useEffect(() => {
    const isProductPage = location.pathname.startsWith('/product/') || location.pathname.startsWith('/products/')
    if (isProductPage && currentProduct) {
      setSelectedProducts(prev => {
        if (prev.some(p => p.id === currentProduct.id)) return prev
        const mapped: SupportSelectedProduct = {
          id: currentProduct.id,
          name: currentProduct.name,
          sku: currentProduct.sku,
          price: currentProduct.price,
          category: currentProduct.category,
          image: currentProduct.images?.[0] || '/images/hero1.jpeg'
        }
        return [mapped, ...prev]
      })
    }
  }, [location.pathname, currentProduct])

  // Initialize session & track online presence on site visit
  useEffect(() => {
    const init = async () => {
      try {
        const res = await supportApi.initSession({
          sessionId,
          visitorId: sessionId,
          userId: user?.id,
          visitorName: visitorName || undefined,
          visitorEmail: visitorEmail || undefined,
          visitorPhone: visitorPhone || undefined,
          topic: selectedTopic,
          selectedProducts: selectedProducts.length > 0 ? selectedProducts : undefined
        })
        if (res.success && res.data) {
          setSession(res.data)
          if (res.data.topic) setSelectedTopic(res.data.topic as SupportTopic)
          if (Array.isArray(res.data.selectedProducts) && res.data.selectedProducts.length > 0) {
            setSelectedProducts(res.data.selectedProducts)
          }
        }
      } catch {
        // Silent fallback
      }
    }
    init()

    const heartbeatInterval = setInterval(() => {
      supportApi.sendHeartbeat(sessionId, {
        isOnline: document.visibilityState === 'visible',
        visitorName: visitorName || undefined,
        visitorEmail: visitorEmail || undefined
      }).then(res => {
        if (res.success && res.data) {
          setSession(res.data)
        }
      }).catch(() => { })
    }, 20000)

    const handleOffline = () => {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || '/api'
      const url = `${apiUrl}/support/session/${encodeURIComponent(sessionId)}/heartbeat`
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ isOnline: false })], { type: 'application/json' })
        navigator.sendBeacon(url, blob)
      }
    }

    window.addEventListener('beforeunload', handleOffline)
    return () => {
      clearInterval(heartbeatInterval)
      window.removeEventListener('beforeunload', handleOffline)
    }
  }, [sessionId, user?.id])

  // Poll active conversation every 4s (passes isChatOpen so unread badge stays visible when drawer is closed and clears on open)
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await supportApi.getSession(sessionId, isChatOpen)
        if (res.success && res.data) {
          setSession(res.data)
        }
      } catch {
        // Silent fallback
      }
    }
    poll()
    const interval = setInterval(poll, 4000)
    return () => clearInterval(interval)
  }, [isChatOpen, sessionId])

  // Auto-scroll to newest message
  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [session?.messages?.length, isChatOpen])

  // Build WhatsApp Shipping Inquiry URL dynamically including any selected products
  const selectedNames = selectedProducts.map(p => `${p.name} (${p.sku})`).join(', ')
  const shippingInquiryText = selectedNames
    ? `Hello DriveFlyElectric Shipping Support! I would like to inquire about shipping & freight delivery for: ${selectedNames}.`
    : 'Hello DriveFlyElectric Shipping Support! I would like to inquire about shipping timelines, crate delivery, and order tracking.'
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(shippingInquiryText)}`

  // Toggle product selection from catalogue
  const toggleCatalogueProduct = async (prod: any) => {
    const exists = selectedProducts.some(p => p.id === prod.id)
    const nextList: SupportSelectedProduct[] = exists
      ? selectedProducts.filter(p => p.id !== prod.id)
      : [
        ...selectedProducts,
        {
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          price: prod.price,
          category: prod.category,
          image: prod.images?.[0] || '/images/hero1.jpeg'
        }
      ]
    setSelectedProducts(nextList)
    setChatError(null)
    try {
      const res = await supportApi.initSession({
        sessionId,
        visitorId: sessionId,
        userId: user?.id,
        visitorName: visitorName || undefined,
        visitorEmail: visitorEmail || undefined,
        visitorPhone: visitorPhone || undefined,
        topic: selectedTopic,
        selectedProducts: nextList
      })
      if (res.success && res.data) {
        setSession(res.data)
      } else {
        setChatError(res.error || 'Could not update selected items in chat session.')
      }
    } catch (err: any) {
      setChatError(err?.message || 'Unable to sync selected items right now.')
    }
  }

  // Handle topic pill selection
  const handleSelectTopic = async (topic: SupportTopic) => {
    setSelectedTopic(topic)
    setChatError(null)
    try {
      const res = await supportApi.initSession({
        sessionId,
        visitorId: sessionId,
        userId: user?.id,
        visitorName: visitorName || undefined,
        visitorEmail: visitorEmail || undefined,
        visitorPhone: visitorPhone || undefined,
        topic,
        selectedProducts
      })
      if (res.success && res.data) {
        setSession(res.data)
      } else {
        setChatError(res.error || 'Could not update inquiry topic.')
      }
    } catch (err: any) {
      setChatError(err?.message || 'Unable to update inquiry topic right now.')
    }
  }

  // Send quick inquiry for selected topic or selected catalogue items
  const handleQuickTopicOrCatalogueSubmit = async (customPrompt?: string) => {
    if (isSending) return
    const textToSend =
      customPrompt ||
      (selectedProducts.length > 0
        ? `I am interested in [${selectedTopic}] regarding: ${selectedProducts.map(p => `${p.name} ($${Number(p.price).toLocaleString()})`).join(', ')}. Can you share availability, specs, and purchase details?`
        : `I need assistance with: ${selectedTopic}.`)

    setChatError(null)
    setIsSending(true)
    try {
      const res = await supportApi.sendMessage(sessionId, {
        content: textToSend,
        topic: selectedTopic,
        selectedProducts,
        visitorName: visitorName || undefined,
        visitorEmail: visitorEmail || undefined,
        visitorPhone: visitorPhone || undefined
      })
      if (res.success && res.data) {
        setSession(res.data)
        setIsCatalogueOpen(false)
      } else {
        setChatError(res.error || 'Unable to submit inquiry. Please check your details and try again.')
      }
    } catch (err: any) {
      setChatError(err?.message || 'Unable to submit inquiry. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  // Handle sending free-text chat message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = messageInput.trim()
    if (!trimmed || isSending) return

    if (visitorName) localStorage.setItem('dfe_visitor_name', visitorName)
    if (visitorEmail) localStorage.setItem('dfe_visitor_email', visitorEmail)
    if (visitorPhone) localStorage.setItem('dfe_visitor_phone', visitorPhone)

    setChatError(null)
    setIsSending(true)
    try {
      const res = await supportApi.sendMessage(sessionId, {
        content: trimmed,
        topic: selectedTopic,
        selectedProducts,
        visitorName: visitorName || undefined,
        visitorEmail: visitorEmail || undefined,
        visitorPhone: visitorPhone || undefined
      })
      if (res.success && res.data) {
        setSession(res.data)
        setMessageInput('')
      } else {
        setChatError(res.error || 'Failed to send message. Please try again.')
      }
    } catch (err: any) {
      setChatError(err?.message || 'Failed to send message. Please check your connection and try again.')
    } finally {
      setIsSending(false)
    }
  }

  const safeProducts = Array.isArray(products) ? products : []
  const filteredCatalog = safeProducts.filter(p => {
    if (!catalogSearch.trim()) return true
    const q = catalogSearch.toLowerCase()
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q)
    )
  })

  const unreadClientCount = session?.unreadClientCount || 0

  return (
    <>
      {/* LiveChat Interactive Support Drawer */}
      {isChatOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[410px] max-h-[82vh] bg-white dark:bg-[#13151b] text-gray-900 dark:text-white rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-800 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Top Header */}
          <div className="bg-gradient-to-r from-[#111318] via-[#191c24] to-[#111318] text-white px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative w-9 h-9 rounded-xl bg-creamy-500 text-black flex items-center justify-center font-black shadow-md shadow-creamy-500/20">
                <Sparkles className="w-5 h-5" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#111318]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-anton text-sm uppercase tracking-wider text-white">
                    DriveFlyElectric LiveChat
                  </h3>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Online
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">
                  Order &amp; Vehicle Support
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Inquire About Shipping on WhatsApp"
                className="px-2 py-1 rounded-lg bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] border border-[#25D366]/30 text-[10px] font-bold flex items-center gap-1 transition-colors"
              >
                <Truck className="w-3 h-3" />
                <span>Shipping WA</span>
              </a>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close LiveChat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inquiry Topic Selector & Catalogue Picker Bar */}
          <div className="bg-gray-50 dark:bg-[#181b22] px-3.5 py-2.5 border-b border-gray-200 dark:border-neutral-800 space-y-2">
            {/* 1. Topic Pills: Payment Issue, Item Purchase, General Inquiry, Shipping Issue */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  1. Select Support Option:
                </span>
                <button
                  type="button"
                  onClick={() => setIsContactOpen(!isContactOpen)}
                  className="text-[10px] font-bold text-creamy-600 dark:text-creamy-400 hover:underline flex items-center gap-1"
                >
                  <UserIcon className="w-3 h-3" />
                  <span>{visitorEmail ? visitorEmail : 'Add Your Email/Name'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SUPPORT_TOPICS.map(t => {
                  const Icon = t.icon
                  const active = selectedTopic === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTopic(t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all text-left ${active
                          ? 'bg-creamy-500 text-black border-creamy-500 shadow-sm'
                          : 'bg-white dark:bg-[#13151b] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-neutral-700 hover:border-creamy-500/50'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Optional Visitor Contact Info Drawer */}
            {isContactOpen && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#13151b] border border-gray-200 dark:border-neutral-700 space-y-2">
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                  Your Contact Info (for quotes, invoices & specialist follow-up):
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    placeholder="Your Name"
                    value={visitorName}
                    onChange={e => setVisitorName(e.target.value)}
                    className="px-2 py-1 text-xs rounded-lg bg-gray-50 dark:bg-[#191c24] border border-gray-300 dark:border-neutral-700 text-gray-900 dark:text-white"
                  />
                  <input
                    type="tel"
                    placeholder="Phone (Optional)"
                    value={visitorPhone}
                    onChange={e => setVisitorPhone(e.target.value)}
                    className="px-2 py-1 text-xs rounded-lg bg-gray-50 dark:bg-[#191c24] border border-gray-300 dark:border-neutral-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="email"
                    placeholder="Email Address (e.g. you@domain.com)"
                    value={visitorEmail}
                    onChange={e => setVisitorEmail(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs rounded-lg bg-gray-50 dark:bg-[#191c24] border border-gray-300 dark:border-neutral-700 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (visitorName) localStorage.setItem('dfe_visitor_name', visitorName)
                      if (visitorEmail) localStorage.setItem('dfe_visitor_email', visitorEmail)
                      if (visitorPhone) localStorage.setItem('dfe_visitor_phone', visitorPhone)
                      setChatError(null)
                      supportApi.initSession({
                        sessionId,
                        visitorId: sessionId,
                        userId: user?.id,
                        visitorName,
                        visitorEmail,
                        visitorPhone,
                        topic: selectedTopic,
                        selectedProducts
                      }).then(res => {
                        if (res.success && res.data) {
                          setSession(res.data)
                          setIsContactOpen(false)
                        } else {
                          setChatError(res.error || 'Please enter a valid email address.')
                        }
                      }).catch((err: any) => {
                        setChatError(err?.message || 'Unable to save contact details right now.')
                      })
                    }}
                    className="px-2.5 py-1 bg-creamy-500 text-black font-bold text-xs rounded-lg"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* 2. "What are you looking to buy today?" Catalogue Selector */}
            <div>
              <button
                type="button"
                onClick={() => setIsCatalogueOpen(!isCatalogueOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-[#13151b] border border-gray-200 dark:border-neutral-700 hover:border-creamy-500 text-xs font-bold transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <Package className="w-3.5 h-3.5 text-creamy-500 flex-shrink-0" />
                  <span className="truncate">
                    What are you looking to buy today?
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {selectedProducts.length > 0 && (
                    <span className="bg-creamy-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
                      {selectedProducts.length} selected
                    </span>
                  )}
                  {isCatalogueOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Expandable Catalogue Item List */}
              {isCatalogueOpen && (
                <div className="mt-2 p-2.5 rounded-xl bg-white dark:bg-[#13151b] border border-gray-200 dark:border-neutral-700 space-y-2 shadow-inner">
                  <input
                    type="text"
                    placeholder="Filter catalogue (e.g. MiniHelicopter, Microcar, Trike)..."
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-gray-50 dark:bg-[#191c24] border border-gray-300 dark:border-neutral-700 text-gray-900 dark:text-white"
                  />
                  <div className="max-h-44 overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-800 pr-1">
                    {filteredCatalog.map(prod => {
                      const isSelected = selectedProducts.some(p => p.id === prod.id)
                      return (
                        <div
                          key={prod.id}
                          onClick={() => toggleCatalogueProduct(prod)}
                          className={`flex items-center gap-2.5 py-2 px-2 rounded-lg cursor-pointer transition-colors ${isSelected
                              ? 'bg-creamy-500/15 dark:bg-creamy-500/20'
                              : 'hover:bg-gray-50 dark:hover:bg-white/5'
                            }`}
                        >
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${isSelected
                                ? 'bg-creamy-500 border-creamy-500 text-black'
                                : 'border-gray-300 dark:border-neutral-600'
                              }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <img
                            src={getSafeMediaUrl(prod.images?.[0])}
                            alt={prod.name}
                            className="w-8 h-8 rounded object-cover flex-shrink-0 bg-gray-100 dark:bg-neutral-800"
                            onError={e => {
                              (e.target as HTMLImageElement).src = '/images/hero1.jpeg'
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-gray-900 dark:text-white truncate">
                              {prod.name}
                            </p>
                            <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase font-semibold">
                              {prod.category} • {prod.sku}
                            </p>
                          </div>
                          <span className="text-[11px] font-black text-creamy-600 dark:text-creamy-400 flex-shrink-0">
                            ${Number(prod.price || 0).toLocaleString()}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-400">
                      {selectedProducts.length} rig(s) selected
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickTopicOrCatalogueSubmit()}
                      disabled={isSending}
                      className="px-3 py-1.5 bg-creamy-500 hover:bg-creamy-400 text-black font-black text-[11px] uppercase tracking-wider rounded-lg shadow-sm transition-colors"
                    >
                      Inquire About Selected
                    </button>
                  </div>
                </div>
              )}

              {/* Selected Catalogue Chips Preview */}
              {!isCatalogueOpen && selectedProducts.length > 0 && (
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto flex-1">
                    {selectedProducts.map(sp => (
                      <span
                        key={sp.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-creamy-500/15 text-creamy-600 dark:text-creamy-400 border border-creamy-500/30"
                      >
                        <span className="truncate max-w-[130px]">{sp.name}</span>
                        <button
                          type="button"
                          onClick={() => toggleCatalogueProduct(sp)}
                          className="hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickTopicOrCatalogueSubmit()}
                    disabled={isSending}
                    className="px-2.5 py-1 bg-creamy-500 hover:bg-creamy-400 text-black font-black text-[10px] uppercase rounded-lg flex-shrink-0"
                  >
                    Ask Now
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Messages Thread */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-[230px] max-h-[320px] bg-white dark:bg-[#13151b]">
            {(session?.messages || []).map(msg => {
              const isClient = msg.senderRole === 'CLIENT'
              const isAdmin = msg.senderRole === 'ADMIN'
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isClient ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      {msg.senderName}
                    </span>
                    {isAdmin && (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                        Live Specialist
                      </span>
                    )}
                    {msg.senderRole === 'AI_ASSISTANT' && (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-creamy-500/20 text-creamy-500">
                        DriveFlyElectric Concierge
                      </span>
                    )}
                    <span className="text-[9px] text-gray-400">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line shadow-sm ${isClient
                        ? 'bg-creamy-500 text-black font-semibold rounded-br-xs'
                        : isAdmin
                          ? 'bg-emerald-950/90 text-emerald-50 border border-emerald-500/40 rounded-bl-xs'
                          : 'bg-gray-100 dark:bg-[#1c1f28] text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-neutral-800 rounded-bl-xs'
                      }`}
                  >
                    {msg.content}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {chatError && (
            <div className="px-3.5 py-2 bg-red-500/15 border-t border-red-500/30 flex items-center justify-between gap-2 text-[11px] font-semibold text-red-600 dark:text-red-300">
              <span>{chatError}</span>
              <button
                type="button"
                onClick={() => setChatError(null)}
                className="p-0.5 hover:opacity-75"
                aria-label="Dismiss chat error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Message Input Footer */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-gray-50 dark:bg-[#181b22] border-t border-gray-200 dark:border-neutral-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              placeholder={`Ask about ${selectedTopic.toLowerCase()} or selected rigs...`}
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#13151b] border border-gray-300 dark:border-neutral-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-creamy-500"
            />
            <button
              type="submit"
              disabled={isSending || !messageInput.trim()}
              className="p-2.5 rounded-xl bg-creamy-500 hover:bg-creamy-400 disabled:opacity-50 text-black font-black transition-all active:scale-95"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Bottom-Right Floating Dual Support Hub: LiveChat (Product/System Support) + WhatsApp (Shipping Inquiry) */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
        {/* 1. WhatsApp Shipping Support Button */}
        <div className="flex items-center">
          <div
            className={`hidden sm:flex items-center gap-2 mr-3 px-3 py-1.5 rounded-full bg-gray-900/95 dark:bg-black/95 text-white text-xs font-semibold backdrop-blur-md shadow-xl border border-white/10 transition-all duration-200 pointer-events-none select-none ${hoveredBtn === 'whatsapp'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-2'
              }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            <span>WhatsApp: Inquire About Shipping</span>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Inquire About Shipping on WhatsApp"
            onMouseEnter={() => setHoveredBtn('whatsapp')}
            onMouseLeave={() => setHoveredBtn(null)}
            className="relative flex items-center justify-center w-13 h-13 rounded-full bg-[#25D366] hover:bg-[#20ba5a] text-white shadow-lg shadow-[#25D366]/40 hover:shadow-xl hover:shadow-[#25D366]/60 transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none"
            title="WhatsApp Support — Inquire About Shipping"
          >
            <svg
              className="w-6 h-6 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.456h.005c6.554 0 11.89-5.335 11.893-11.893 0-3.177-1.237-6.164-3.486-8.414z" />
            </svg>
          </a>
        </div>

        {/* 2. LiveChat Product & System Support Button */}
        <div className="flex items-center">
          {!isChatOpen && unreadClientCount > 0 ? (
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="flex items-center gap-2.5 mr-3 px-3.5 py-2 rounded-2xl bg-gray-900/95 dark:bg-black/95 text-white text-xs backdrop-blur-md shadow-2xl border border-creamy-500/50 hover:border-creamy-400 transition-all max-w-[270px] text-left cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-creamy-400 tracking-wider">
                  New Specialist Reply ({unreadClientCount})
                </p>
                <p className="text-[11px] font-medium text-gray-200 truncate">
                  {session?.messages && session.messages.length > 0
                    ? session.messages[session.messages.length - 1].content
                    : 'Click to view your message'}
                </p>
              </div>
            </button>
          ) : (
            <div
              className={`hidden sm:flex items-center gap-2 mr-3 px-3.5 py-1.5 rounded-full bg-gray-900/95 dark:bg-black/95 text-white text-xs font-semibold backdrop-blur-md shadow-xl border border-creamy-500/30 transition-all duration-200 pointer-events-none select-none ${hoveredBtn === 'livechat'
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 translate-x-2'
                }`}
            >
              <span className="w-2 h-2 rounded-full bg-creamy-400 animate-pulse" />
              <span>LiveChat: Order &amp; Vehicle Support</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsChatOpen(!isChatOpen)}
            onMouseEnter={() => setHoveredBtn('livechat')}
            onMouseLeave={() => setHoveredBtn(null)}
            aria-label="Open Order & Vehicle Support LiveChat"
            title="LiveChat — Order & Vehicle Support"
            className="relative flex items-center justify-center w-14 h-14 rounded-full bg-creamy-500 hover:bg-creamy-400 text-black shadow-xl shadow-creamy-500/30 hover:shadow-creamy-500/50 transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none border-2 border-white dark:border-[#13151b]"
          >
            {/* Unread Reply Or Active Indicator */}
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
