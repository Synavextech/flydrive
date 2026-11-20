import React, { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Wallet,
  Package,
  RotateCcw,
  MessageSquare,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  ExternalLink,
  RefreshCw,
  ShoppingBag,
  X
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { walletApi, orderApi, returnsApi, supportApi } from '../services/api'
import {
  WalletSummary,
  Order,
  ReturnRequest,
  ReturnReasonType,
  SupportSession,
  EligibleExchangeResponse
} from '../types'
import { getSupportWhatsAppDigits } from '../utils/receiptPdf'

type AccountTab = 'wallet' | 'orders' | 'returns' | 'chats'

const RETURN_WINDOW_MS = 21 * 24 * 60 * 60 * 1000

const formatPrice = (amount?: number | null) =>
  `$${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`

const getReturnEligibility = (ord: Order) => {
  const anchor = ord.deliveredAt ? new Date(ord.deliveredAt) : new Date(ord.createdAt)
  const eligibleUntil = new Date(anchor.getTime() + RETURN_WINDOW_MS)
  const msLeft = eligibleUntil.getTime() - Date.now()
  const expired = msLeft < 0
  const daysRemaining = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))
  const paidEligible =
    ord.paymentStatus === 'COMPLETED' &&
    (ord.status === 'PROCESSING' || ord.status === 'SHIPPED' || ord.status === 'DELIVERED')
  return {
    eligible: paidEligible && !expired,
    paidEligible,
    expired,
    daysRemaining,
    eligibleUntil
  }
}

export const AccountPage: React.FC = () => {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<AccountTab>(() =>
    initialTabParam === 'orders' || initialTabParam === 'returns' || initialTabParam === 'chats'
      ? initialTabParam
      : 'wallet'
  )

  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [returnsList, setReturnsList] = useState<ReturnRequest[]>([])
  const [chatSessions, setChatSessions] = useState<SupportSession[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Return / Exchange Request Modal State
  const [returnModalOrder, setReturnModalOrder] = useState<Order | null>(null)
  const [reasonType, setReasonType] = useState<ReturnReasonType>('NOT_AS_ORDERED_REFUND')
  const [reasonDetails, setReasonDetails] = useState('')
  const [returnTrackingNumber, setReturnTrackingNumber] = useState('')
  const [exchangeOptions, setExchangeOptions] = useState<EligibleExchangeResponse | null>(null)
  const [loadingExchangeOptions, setLoadingExchangeOptions] = useState(false)
  const [selectedExchangeProductId, setSelectedExchangeProductId] = useState<string>('')
  const [submittingReturn, setSubmittingReturn] = useState(false)

  const cleanWhatsApp = getSupportWhatsAppDigits()

  const loadAccountData = useCallback(async () => {
    setLoading(true)
    try {
      const [wRes, oRes, rRes, cRes] = await Promise.allSettled([
        walletApi.getWallet(),
        orderApi.getOrders({ limit: 50 }),
        returnsApi.getMyReturns(),
        supportApi.getMySessions()
      ])
      if (wRes.status === 'fulfilled' && wRes.value.success && wRes.value.data) {
        setWalletSummary(wRes.value.data)
      }
      if (oRes.status === 'fulfilled' && oRes.value.success && Array.isArray(oRes.value.data)) {
        setOrders(oRes.value.data)
      }
      if (rRes.status === 'fulfilled' && rRes.value.success && Array.isArray(rRes.value.data)) {
        setReturnsList(rRes.value.data)
      }
      if (cRes.status === 'fulfilled' && cRes.value.success && Array.isArray(cRes.value.data)) {
        setChatSessions(cRes.value.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccountData()
  }, [loadAccountData])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (
      tabParam === 'wallet' ||
      tabParam === 'orders' ||
      tabParam === 'returns' ||
      tabParam === 'chats'
    ) {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  const switchTab = (tab: AccountTab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'wallet' ? {} : { tab }, { replace: true })
  }

  const openReturnModal = async (ord: Order) => {
    setReturnModalOrder(ord)
    setReasonType('NOT_AS_ORDERED_REFUND')
    setReasonDetails('')
    setReturnTrackingNumber('')
    setSelectedExchangeProductId('')
    setExchangeOptions(null)
    setLoadingExchangeOptions(true)
    try {
      const res = await returnsApi.getEligibleExchangeProducts(ord.id)
      if (res.success && res.data) {
        setExchangeOptions(res.data)
      }
    } catch {
      // Handled gracefully in modal
    } finally {
      setLoadingExchangeOptions(false)
    }
  }

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!returnModalOrder || submittingReturn) return

    if (reasonType === 'EXCHANGE_EQUAL_VALUE' && !selectedExchangeProductId) {
      setBanner({ type: 'error', text: 'Please select a replacement catalog item for exchange.' })
      return
    }

    setSubmittingReturn(true)
    setBanner(null)
    try {
      const res = await returnsApi.submitReturnRequest({
        orderId: returnModalOrder.id,
        reasonType,
        reasonDetails: reasonDetails.trim() || undefined,
        exchangeProductId: reasonType === 'EXCHANGE_EQUAL_VALUE' ? selectedExchangeProductId : null,
        returnTrackingNumber: returnTrackingNumber.trim() || null
      })

      if (!res.success || !res.data) {
        throw new Error(res.error || 'Could not submit return request.')
      }

      setBanner({
        type: 'success',
        text: `Return request ${res.data.returnNumber} submitted. Once reviewed by support, we offer same-day balance deposit to your Wallet while awaiting return shipping.`
      })
      setReturnModalOrder(null)
      await loadAccountData()
      switchTab('returns')
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Unable to submit return request.' })
    } finally {
      setSubmittingReturn(false)
    }
  }

  const walletBalance = Number(walletSummary?.wallet?.balance || 0)
  const transactions = walletSummary?.transactions || []

  return (
    <div className="pt-24 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Top Profile & Wallet Header */}
        <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-creamy-500 bg-creamy-500/10 px-2.5 py-1 rounded-full border border-creamy-500/20">
              DriveFlyElectric Customer Portal
            </span>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight font-anton mt-2">
              {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email}
            </h1>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">{user?.email}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-3 rounded-xl bg-creamy-500/10 border border-creamy-500/30 text-left">
              <p className="text-[10px] font-black uppercase tracking-wider text-creamy-600 dark:text-creamy-400">
                Available Wallet Balance
              </p>
              <p className="text-2xl font-black font-anton text-creamy-500">{formatPrice(walletBalance)}</p>
            </div>
            <button
              type="button"
              onClick={loadAccountData}
              className="p-3 rounded-xl border border-gray-200 dark:border-neutral-700 hover:border-creamy-500 text-gray-600 dark:text-gray-300 transition-colors"
              title="Refresh account data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {banner && (
          <div
            className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              banner.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button type="button" onClick={() => setBanner(null)} className="text-[11px] font-bold underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-neutral-800 gap-6 overflow-x-auto">
          {[
            { id: 'wallet', label: 'Wallet & Ledger', icon: Wallet },
            { id: 'orders', label: `Orders & Shipments (${orders.length})`, icon: Package },
            { id: 'returns', label: `21-Day Returns (${returnsList.length})`, icon: RotateCcw },
            { id: 'chats', label: `My Support Chats (${chatSessions.length})`, icon: MessageSquare }
          ].map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id as AccountTab)}
                className={`flex items-center gap-2 py-3.5 px-1 text-xs font-black uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-creamy-500 text-creamy-500'
                    : 'border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab 1: Wallet & Ledger */}
        {activeTab === 'wallet' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-6 space-y-3">
                <h2 className="text-base font-black uppercase tracking-wider flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-creamy-500" />
                  DriveFlyElectric Store Wallet (USD)
                </h2>
                <p className="text-xs text-gray-600 dark:text-neutral-300 leading-relaxed">
                  Refunds processed under our <strong>Same-Day Return Policy</strong> are deposited directly here while awaiting return shipping. You can spend your Wallet balance for full or partial payment at Checkout immediately.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <Link
                    to="/"
                    className="px-4 py-2 rounded-xl bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase text-xs tracking-wider"
                  >
                    Browse Catalog
                  </Link>
                  <Link
                    to="/checkout"
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 hover:border-creamy-500 font-bold uppercase text-xs tracking-wider"
                  >
                    Go to Checkout
                  </Link>
                  <Link
                    to="/faq#returns"
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 hover:border-creamy-500 font-bold uppercase text-xs tracking-wider"
                  >
                    Read 21-Day Return Policy
                  </Link>
                </div>
              </div>

              <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-6 flex flex-col justify-center">
                <p className="text-[11px] font-bold uppercase text-gray-500">Current Spendable Credit</p>
                <p className="text-4xl font-black font-anton text-creamy-500 mt-1">{formatPrice(walletBalance)}</p>
                <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-2">
                  {transactions.length} ledger {transactions.length === 1 ? 'entry' : 'entries'} recorded
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-neutral-800">
                <h3 className="text-xs font-black uppercase tracking-wider">Wallet Transaction Ledger</h3>
              </div>
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  No wallet credits or checkout debits recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {transactions.map((tx) => {
                    const isCredit = tx.direction === 'CREDIT'
                    return (
                      <div key={tx.id} className="px-6 py-4 flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isCredit
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-blue-500/15 text-blue-500'
                            }`}
                          >
                            {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 dark:text-white truncate">{tx.description}</p>
                            <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-0.5">
                              {tx.type} • Balance: {formatPrice(tx.balanceBefore)} → {formatPrice(tx.balanceAfter)} •{' '}
                              {new Date(tx.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`font-black text-sm shrink-0 ${
                            isCredit ? 'text-emerald-500' : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {formatPrice(tx.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Orders & Active Shipments */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-10 text-center space-y-3">
                <ShoppingBag className="w-10 h-10 text-gray-400 mx-auto" />
                <p className="text-sm font-bold">No orders placed under this account yet.</p>
                <Link
                  to="/"
                  className="inline-block px-5 py-2.5 rounded-xl bg-creamy-500 text-black font-black text-xs uppercase tracking-wider"
                >
                  Browse Catalog
                </Link>
              </div>
            ) : (
              orders.map((ord) => {
                const eligibility = getReturnEligibility(ord)
                const existingReturn = returnsList.find(
                  (r) => r.orderId === ord.id && r.status !== 'REJECTED'
                )
                const isActiveShipment = ord.status === 'PROCESSING' || ord.status === 'SHIPPED'
                const trackingNum = ord.trackingNumber || `TRK-${ord.orderNumber}`
                const unitNames = (ord.items || [])
                  .map((i) => `${i.product?.name || 'Ordered Unit'}${i.quantity > 1 ? ` x${i.quantity}` : ''}`)
                  .join(', ')
                const waUrl = `https://wa.me/${cleanWhatsApp}?text=${encodeURIComponent(
                  `Hello DriveFlyElectric Shipping Support! I am inquiring about my active shipment Order #${ord.orderNumber} (Tracking: ${trackingNum}, Status: ${ord.status})${unitNames ? ` for: ${unitNames}` : ''}.`
                )}`

                return (
                  <div
                    key={ord.id}
                    className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-neutral-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-sm">Order #{ord.orderNumber}</span>
                          <span className="px-2 py-0.5 rounded bg-creamy-500/15 text-creamy-600 dark:text-creamy-400 text-[10px] font-black uppercase">
                            {ord.status}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 text-[10px] font-black uppercase">
                            {ord.paymentMethod}
                          </span>
                          {Number(ord.walletAmountUsed || 0) > 0 && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[10px] font-bold">
                              Wallet Used: {formatPrice(ord.walletAmountUsed)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-1">
                          Tracking: <strong className="font-mono">{trackingNum}</strong> • Placed:{' '}
                          {new Date(ord.createdAt).toLocaleDateString()}
                          {ord.deliveredAt && ` • Delivered: ${new Date(ord.deliveredAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-lg font-black text-creamy-500">{formatPrice(ord.total)}</p>
                        <p className="text-[10px] text-gray-500">Payment: {ord.paymentStatus}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {(ord.items || []).map((item) => (
                        <Link
                          key={item.id}
                          to={`/product/${item.productId}`}
                          className="flex items-center gap-2.5 p-2 rounded-xl bg-gray-50 dark:bg-[#1a1d24] border border-gray-200 dark:border-neutral-800 hover:border-creamy-500 transition-colors"
                        >
                          <img
                            src={item.product?.images?.[0] || '/images/hero1.jpeg'}
                            alt={item.product?.name || 'Product'}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                          <div className="text-xs">
                            <p className="font-bold">{item.product?.name || 'Catalog Unit'}</p>
                            <p className="text-[10px] text-gray-500">
                              Qty {item.quantity} × {formatPrice(item.price)}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-neutral-800">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {isActiveShipment && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                window.dispatchEvent(
                                  new CustomEvent('dfe:open-livechat', {
                                    detail: {
                                      topic: 'Shipping Inquiry',
                                      activeOrderId: ord.id,
                                      items: (ord.items || [])
                                        .filter((i) => i.product)
                                        .map((i) => ({
                                          id: i.product.id,
                                          name: i.product.name,
                                          sku: i.product.sku,
                                          price: i.price,
                                          category: i.product.category,
                                          image: i.product.images?.[0] || ''
                                        }))
                                    }
                                  })
                                )
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-creamy-500/15 text-creamy-600 dark:text-creamy-400 font-bold hover:bg-creamy-500/25"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              LiveChat Shipping Inquiry
                            </button>
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              WhatsApp Shipment Support
                            </a>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {existingReturn ? (
                          <button
                            type="button"
                            onClick={() => switchTab('returns')}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 font-bold text-xs"
                          >
                            Return {existingReturn.returnNumber}: {existingReturn.status}
                          </button>
                        ) : eligibility.eligible ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {eligibility.daysRemaining}d left (21-day window)
                            </span>
                            <button
                              type="button"
                              onClick={() => openReturnModal(ord)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black font-black text-xs uppercase tracking-wider hover:opacity-90"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Request Return / Exchange
                            </button>
                          </div>
                        ) : eligibility.paidEligible && eligibility.expired ? (
                          <span className="text-[11px] text-gray-500 font-medium">
                            21-Day Return Window Expired
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Tab 3: Return Requests */}
        {activeTab === 'returns' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-creamy-500/10 border border-creamy-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p>
                <strong>21-Day Return &amp; Exchange Policy:</strong> Eligible within 21 days. Once processed by a support agent,{' '}
                <strong>same-day refund balance is deposited immediately into your Wallet</strong> while awaiting return shipping.
              </p>
              <Link to="/faq#returns" className="font-black text-creamy-600 dark:text-creamy-400 underline shrink-0">
                Read Full Return Terms
              </Link>
            </div>

            {returnsList.length === 0 ? (
              <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-10 text-center text-xs text-gray-500">
                No return or exchange requests yet. Open the <strong>Orders &amp; Shipments</strong> tab to submit a 21-day return request on an eligible order.
              </div>
            ) : (
              returnsList.map((ret) => (
                <div
                  key={ret.id}
                  className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-neutral-800 pb-3">
                    <div>
                      <span className="font-mono font-black text-sm">{ret.returnNumber}</span>
                      <span className="ml-2 text-gray-500">Order #{ret.orderNumber || ret.orderId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {ret.walletCredited && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-black text-[10px] uppercase">
                          Same-Day Wallet Credited
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full bg-creamy-500/15 text-creamy-600 dark:text-creamy-400 font-black text-[10px] uppercase">
                        {ret.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-gray-500 font-bold uppercase text-[10px]">Selected Policy Option</p>
                      <p className="font-semibold mt-0.5">
                        {ret.reasonType === 'EXCHANGE_EQUAL_VALUE'
                          ? `Catalog Exchange (${ret.exchangeProduct?.name || ret.exchangeProductId || 'Replacement Unit'})`
                          : 'Item not what I ordered — Money back to Wallet'}
                      </p>
                      {ret.reasonDetails && (
                        <p className="text-gray-500 dark:text-neutral-400 mt-1">{ret.reasonDetails}</p>
                      )}
                    </div>
                    <div className="space-y-1 sm:text-right">
                      <p>
                        <strong>Amount:</strong> {formatPrice(ret.refundAmount)}
                      </p>
                      <p>
                        <strong>Return Tracking:</strong> {ret.returnTrackingNumber || 'Pending'}
                      </p>
                      <p>
                        <strong>21-Day Expiry:</strong> {new Date(ret.eligibleUntil).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {ret.adminNotes && (
                    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-[#1a1d24] border border-gray-200 dark:border-neutral-800 text-[11px]">
                      <strong>Support Agent Note:</strong> {ret.adminNotes}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: My Persistent Support Chats */}
        {activeTab === 'chats' && (
          <div className="space-y-4">
            {chatSessions.length === 0 ? (
              <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-10 text-center space-y-3">
                <MessageSquare className="w-10 h-10 text-gray-400 mx-auto" />
                <p className="text-xs text-gray-500">You have not started any support threads yet.</p>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('dfe:open-livechat', { detail: { topic: 'General Inquiry' } }))}
                  className="px-4 py-2 rounded-xl bg-creamy-500 text-black font-black text-xs uppercase tracking-wider"
                >
                  Open Support LiveChat
                </button>
              </div>
            ) : (
              chatSessions.map((sess) => {
                const realMessages = (sess.messages || []).filter((m) => m.senderRole !== 'AI_ASSISTANT')
                return (
                  <div
                    key={sess.id}
                    className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-neutral-800 pb-3">
                      <div>
                        <span className="font-black text-xs uppercase tracking-wider text-creamy-500">
                          {sess.topic}
                        </span>
                        <span className="ml-2 text-[11px] text-gray-500">
                          Updated {new Date(sess.updatedAt).toLocaleString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent('dfe:open-livechat', {
                              detail: { sessionId: sess.id, topic: sess.topic }
                            })
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-creamy-500 text-black font-black text-[11px] uppercase hover:bg-creamy-400 transition-colors"
                      >
                        Resume in LiveChat
                      </button>
                    </div>
                    {sess.selectedProducts && sess.selectedProducts.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {sess.selectedProducts.map((p) => (
                          <Link
                            key={p.id}
                            to={`/product/${p.id}`}
                            className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-neutral-800 text-[11px] font-bold hover:text-creamy-500"
                          >
                            {p.name} ({formatPrice(p.price)})
                          </Link>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {realMessages.map((m) => (
                        <div
                          key={m.id}
                          className={`p-2.5 rounded-xl text-xs ${
                            m.senderRole === 'CLIENT'
                              ? 'bg-creamy-500/15 border border-creamy-500/30 ml-6'
                              : 'bg-gray-100 dark:bg-[#1a1d24] mr-6'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-bold mb-0.5 text-gray-500">
                            <span>{m.senderRole === 'CLIENT' ? 'You' : m.senderName || 'Support Admin'}</span>
                            <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* 21-Day Return / Exchange Request Modal */}
      {returnModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 border-b border-gray-200 dark:border-neutral-800 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase text-creamy-500">21-Day Return &amp; Exchange</p>
                <h3 className="text-lg font-black font-anton uppercase">
                  Order #{returnModalOrder.orderNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalOrder(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReturn} className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="font-black uppercase tracking-wider text-[11px] block">
                  Select Return Reason / Option:
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer ${
                    reasonType === 'NOT_AS_ORDERED_REFUND'
                      ? 'border-creamy-500 bg-creamy-500/10'
                      : 'border-gray-200 dark:border-neutral-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="returnReason"
                    checked={reasonType === 'NOT_AS_ORDERED_REFUND'}
                    onChange={() => setReasonType('NOT_AS_ORDERED_REFUND')}
                    className="mt-0.5 accent-creamy-500"
                  />
                  <div>
                    <p className="font-bold">Item not what I ordered — I want my money back</p>
                    <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                      Same-day refund ({formatPrice(returnModalOrder.total)}) deposited directly into your Wallet once processed by support, while awaiting return shipping.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer ${
                    reasonType === 'EXCHANGE_EQUAL_VALUE'
                      ? 'border-creamy-500 bg-creamy-500/10'
                      : 'border-gray-200 dark:border-neutral-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="returnReason"
                    checked={reasonType === 'EXCHANGE_EQUAL_VALUE'}
                    onChange={() => setReasonType('EXCHANGE_EQUAL_VALUE')}
                    className="mt-0.5 accent-creamy-500"
                  />
                  <div>
                    <p className="font-bold">I want to change — select a different item from catalog of equal value</p>
                    <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                      Choose an equal or close-value replacement unit from our active catalog (price differences are settled via your Wallet).
                    </p>
                  </div>
                </label>
              </div>

              {reasonType === 'EXCHANGE_EQUAL_VALUE' && (
                <div className="space-y-2">
                  <label className="font-bold block">Select Replacement Item from Live Catalog:</label>
                  {loadingExchangeOptions ? (
                    <p className="text-gray-500">Loading eligible catalog items...</p>
                  ) : !exchangeOptions || exchangeOptions.products.length === 0 ? (
                    <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300">
                      No alternate in-stock items matched the ±{exchangeOptions?.tolerancePercent || 10}% value band. Choose money-back refund to Wallet above or contact LiveChat support.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {exchangeOptions.products.map((prod) => (
                        <label
                          key={prod.id}
                          className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer ${
                            selectedExchangeProductId === prod.id
                              ? 'border-creamy-500 bg-creamy-500/10'
                              : 'border-gray-200 dark:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="radio"
                              name="exchangeProduct"
                              checked={selectedExchangeProductId === prod.id}
                              onChange={() => setSelectedExchangeProductId(prod.id)}
                              className="accent-creamy-500"
                            />
                            <img
                              src={prod.images?.[0] || '/images/hero1.jpeg'}
                              alt={prod.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                            <div className="min-w-0">
                              <p className="font-bold truncate">{prod.name}</p>
                              <p className="text-[10px] text-gray-500">
                                {formatPrice(prod.price)} •{' '}
                                {prod.exactMatch
                                  ? 'Exact equal value'
                                  : prod.priceDifference < 0
                                    ? `${formatPrice(Math.abs(prod.priceDifference))} credited to Wallet`
                                    : `+${formatPrice(prod.priceDifference)} covered by Wallet`}
                              </p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="font-bold block mb-1">Return Carrier Tracking # (Optional)</label>
                <input
                  type="text"
                  value={returnTrackingNumber}
                  onChange={(e) => setReturnTrackingNumber(e.target.value)}
                  placeholder="Enter return shipping tracking if already dispatched"
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-[#1a1d24] text-xs"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Details / Notes</label>
                <textarea
                  rows={3}
                  value={reasonDetails}
                  onChange={(e) => setReasonDetails(e.target.value)}
                  placeholder="Describe why you are returning or exchanging this item..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-[#1a1d24] text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnModalOrder(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="px-5 py-2 rounded-xl bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider disabled:opacity-50"
                >
                  {submittingReturn ? 'Submitting...' : 'Submit Return Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountPage
