import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  CheckCircle,
  Package,
  Home,
  Loader2,
  AlertCircle,
  Download,
  Printer,
  Copy,
  Check,
  FileText,
  Truck
} from 'lucide-react'
import { paymentApi, orderApi } from '../services/api'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import {
  OrderReceiptData,
  generateReceiptText,
  downloadReceiptPdf,
  formatSupportPhone,
  getSupportContactEmail,
  getSupportWhatsAppDigits
} from '../utils/receiptPdf'
import { resolveClientCountryIso2 } from '../data/countries'

export type { OrderReceiptData }

interface LocationState {
  orderId?: string
  receiptToken?: string
  orderNumber?: string
  trackingNumber?: string
  total?: number
  paymentMethod?: string
  shippingAddress?: string
  receiptData?: OrderReceiptData
}

const OrderSuccessPage = () => {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { setAuthenticatedUser } = useAuth()
  const { clearCart } = useCart()

  const state = (location.state as LocationState) || {}
  const payPalTokenFromUrl = searchParams.get('token')
  const isReturningFromPayPal = Boolean(
    payPalTokenFromUrl && localStorage.getItem('pending_paypal_order') && !state.orderNumber
  )

  // Restore cached receipt if page was refreshed (ignored during a fresh PayPal return flow)
  const getCachedReceipt = (): OrderReceiptData | null => {
    if (isReturningFromPayPal) return null
    try {
      const saved = localStorage.getItem('latest_order_receipt')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  }

  const initialReceipt = state.receiptData || getCachedReceipt()
  const processedPayPalTokenRef = useRef<string | null>(null)

  const [receipt, setReceipt] = useState<OrderReceiptData | null>(initialReceipt)
  const [orderNumber, setOrderNumber] = useState<string>(
    state.orderNumber || initialReceipt?.orderNumber || ''
  )
  const [trackingNumber, setTrackingNumber] = useState<string>(
    state.trackingNumber ||
      initialReceipt?.trackingNumber ||
      (state.orderNumber || initialReceipt?.orderNumber
        ? `TRK-${state.orderNumber || initialReceipt?.orderNumber}`
        : '')
  )
  const [copiedTracking, setCopiedTracking] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<string>(
    state.paymentMethod || (initialReceipt?.paymentSource?.includes('PayPal') ? 'PAYPAL' : 'STRIPE')
  )
  const [total, setTotal] = useState<number | null>(
    state.total || (initialReceipt?.finalCost ? parseFloat(initialReceipt.finalCost.replace(/[^0-9.]/g, '')) : null)
  )

  const [copied, setCopied] = useState(false)
  const [loadingPayPal, setLoadingPayPal] = useState(false)
  const [payPalError, setPayPalError] = useState<string | null>(null)

  const supportPhone = formatSupportPhone()
  const whatsAppDigits = getSupportWhatsAppDigits()
  const apiUrl = (import.meta as any).env?.VITE_API_URL || '/api'

  useEffect(() => {
    const payPalToken = searchParams.get('token')
    const pendingData = localStorage.getItem('pending_paypal_order')

    if (payPalToken && pendingData && !orderNumber && processedPayPalTokenRef.current !== payPalToken) {
      processedPayPalTokenRef.current = payPalToken
      const processPayPalReturn = async () => {
        setLoadingPayPal(true)
        setPayPalError(null)

        try {
          const parsed = JSON.parse(pendingData)
          // 1. Capture the PayPal payment
          const captureRes = await paymentApi.capturePayPalPayment(payPalToken)
          if (!captureRes.data || !captureRes.data.paymentId) {
            throw new Error(captureRes.error || 'Failed to capture PayPal payment')
          }

          const orderPayload = parsed.orderData || {
            items: (parsed.items || []).map((i: any) => ({
              productId: i.productId || i.id,
              quantity: i.quantity || 1
            })),
            paymentMethod: 'PAYPAL' as const,
            shippingAddress: {
              firstName: parsed.shippingData?.firstName || 'Valued',
              lastName: parsed.shippingData?.lastName || 'Customer',
              email: parsed.shippingData?.email || '',
              phone: parsed.shippingData?.phone || '',
              address1: parsed.shippingData?.address1 || '',
              address2: parsed.shippingData?.address2 || '',
              city: parsed.shippingData?.city || '',
              state: parsed.shippingData?.state || '',
              postalCode: parsed.shippingData?.postalCode || parsed.shippingData?.zipCode || '',
              country: parsed.shippingData?.country || 'United States',
              countryCode: resolveClientCountryIso2(parsed.shippingData?.country)
            },
            createAccount: Boolean(parsed.createAccount),
            password: parsed.createAccount ? (parsed.accountPassword || '') : '',
            notes: `Dispatch to ${parsed.shippingData?.city || 'Destination'}, ${parsed.shippingData?.country || 'United States'} (${captureRes.data.paymentId})`
          }

          // 2. Finalize and settle order in database
          const createRes = await orderApi.createOrder({
            ...orderPayload,
            paymentMethod: 'PAYPAL',
            paymentId: captureRes.data.paymentId,
            paypalOrderId:
              captureRes.data.orderId ||
              (typeof payPalToken === 'string' ? payPalToken : parsed.ppOrderId),
            paymentStatus: 'COMPLETED'
          })

          if (createRes.data) {
            const confirmedOrderNumber = createRes.data.orderNumber || `ORD-${Date.now()}`
            const confirmedTrackingNumber =
              createRes.data.trackingNumber || `TRK-${confirmedOrderNumber}`
            setOrderNumber(confirmedOrderNumber)
            setTrackingNumber(confirmedTrackingNumber)
            setPaymentMethod('PAYPAL')
            const finalTotal = Number(createRes.data.total || parsed.grandTotal || parsed.total || 0)
            setTotal(finalTotal)

            const orderDateStr = new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })
            const zipVal = parsed.shippingData?.postalCode || parsed.shippingData?.zipCode || ''
            const fullAddress = `${parsed.shippingData?.address1 || ''}${parsed.shippingData?.address2 ? `, ${parsed.shippingData.address2}` : ''}, ${parsed.shippingData?.city || ''}, ${parsed.shippingData?.state || ''} ${zipVal}, ${parsed.shippingData?.country || 'United States'}`

            const ppReceipt: OrderReceiptData = {
              orderId: createRes.data.id,
              receiptToken: createRes.data.receiptToken,
              date: orderDateStr,
              orderDate: orderDateStr,
              orderNumber: confirmedOrderNumber,
              trackingNumber: confirmedTrackingNumber,
              transactionId: captureRes.data.paymentId || (typeof payPalToken === 'string' ? payPalToken : `PP-${Date.now()}`),
              userName: `${parsed.shippingData?.firstName || ''} ${parsed.shippingData?.lastName || ''}`.trim() || 'Valued Customer',
              address: fullAddress,
              paymentSource: 'PayPal Express',
              initialCharge: `$${Number(parsed.subtotal || finalTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              finalCost: `$${finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              totalRefund: '$0.00',
              refundTrans: 'N/A',
              shippingCost: parsed.shippingCost ? `$${Number(parsed.shippingCost).toFixed(2)}` : '$0.00 (Free Shipping)',
              tax: parsed.tax ? `$${Number(parsed.tax).toFixed(2)}` : '$0.00',
              items: (parsed.items || []).map((i: any) => ({
                name: i.name || 'High-Performance Vehicle',
                quantity: i.quantity || 1,
                price: `$${Number(i.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                total: `$${(Number(i.price || 0) * (i.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              }))
            }

            setReceipt(ppReceipt)
            localStorage.setItem('latest_order_receipt', JSON.stringify(ppReceipt))
            try {
              const prevTrackings = JSON.parse(localStorage.getItem('dfe_recent_trackings') || '[]')
              const nextEntry = {
                orderNumber: confirmedOrderNumber,
                trackingNumber: confirmedTrackingNumber,
                date: orderDateStr,
                total: finalTotal,
                destination: fullAddress,
                status: 'PROCESSING',
                items: ppReceipt.items
              }
              const deduped = [nextEntry, ...prevTrackings.filter((t: any) => t.trackingNumber !== confirmedTrackingNumber && t.orderNumber !== confirmedOrderNumber)].slice(0, 8)
              localStorage.setItem('dfe_recent_trackings', JSON.stringify(deduped))
            } catch {
              // Ignore storage error
            }

            // Auto-login if guest account was registered
            if (createRes.token && createRes.user) {
              setAuthenticatedUser(createRes.user, createRes.token)
            }

            // Clear cart & cleanup pending state
            clearCart()
            localStorage.removeItem('pending_paypal_order')
          } else {
            throw new Error(createRes.error || 'Failed to record settled order')
          }
        } catch (err: any) {
          console.error('PayPal return error:', err)
          setPayPalError(err.message || 'Payment verification failed. Please contact support.')
        } finally {
          setLoadingPayPal(false)
        }
      }

      processPayPalReturn()
    }
  }, [searchParams, orderNumber, setAuthenticatedUser])

  const hasVerifiedOrder = Boolean(orderNumber || receipt?.orderNumber)
  const displayOrderNumber = orderNumber || receipt?.orderNumber || ''
  const displayTrackingNumber =
    trackingNumber || receipt?.trackingNumber || (displayOrderNumber ? `TRK-${displayOrderNumber}` : '')
  const formattedTotal = total
    ? `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null

  const activeReceipt: OrderReceiptData | null = receipt
    ? {
        ...receipt,
        orderId: receipt.orderId || state.orderId,
        receiptToken: receipt.receiptToken || state.receiptToken,
        trackingNumber: receipt.trackingNumber || displayTrackingNumber
      }
    : displayOrderNumber
    ? {
        orderId: state.orderId,
        receiptToken: state.receiptToken,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        orderDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        orderNumber: displayOrderNumber,
        trackingNumber: displayTrackingNumber,
        transactionId: 'Verified Settlement',
        userName: 'Valued Customer',
        address: state.shippingAddress || 'Express Shipping to Destination on File',
        paymentSource:
          paymentMethod === 'STRIPE'
            ? 'Credit / Debit Card (Stripe)'
            : paymentMethod === 'PAYPAL'
              ? 'PayPal Express'
              : paymentMethod,
        initialCharge: formattedTotal || '$0.00',
        finalCost: formattedTotal || '$0.00',
        totalRefund: '$0.00',
        refundTrans: 'N/A'
      }
    : null

  // Automatically generate and download PDF receipt once when a verified purchase completes
  useEffect(() => {
    if (!loadingPayPal && !payPalError && hasVerifiedOrder && activeReceipt?.orderNumber) {
      const autoKey = `auto_pdf_receipt_${activeReceipt.orderNumber}`
      if (!sessionStorage.getItem(autoKey)) {
        sessionStorage.setItem(autoKey, 'true')
        try {
          downloadReceiptPdf(activeReceipt)
        } catch {
          // Ignore automatic download block if browser restricts popup/download
        }
      }
    }
  }, [loadingPayPal, payPalError, hasVerifiedOrder, activeReceipt?.orderNumber])

  if (loadingPayPal) {
    return (
      <div className="pt-20 min-h-screen bg-gray-50 dark:bg-[#0e1014] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white dark:bg-[#16181e] rounded-2xl shadow-xl p-8 text-center border border-gray-100 dark:border-neutral-800">
          <Loader2 className="w-12 h-12 text-creamy-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Finalizing PayPal Payment...</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Please do not refresh or close this window while we secure your order.</p>
        </div>
      </div>
    )
  }

  if (payPalError) {
    return (
      <div className="pt-20 min-h-screen bg-gray-50 dark:bg-[#0e1014] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white dark:bg-[#16181e] rounded-2xl shadow-xl p-8 text-center border border-red-100 dark:border-red-900/40">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Payment Verification Error</h2>
          <p className="text-red-600 dark:text-red-400 text-sm mb-6">{payPalError}</p>
          <div className="space-y-3">
            <Link
              to="/checkout"
              className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-sm font-black uppercase tracking-wider rounded-xl text-black bg-creamy-500 hover:bg-creamy-400 shadow-md transition duration-200"
            >
              Return to Checkout
            </Link>
            <Link
              to="/"
              className="w-full flex items-center justify-center px-6 py-3 border border-gray-300 dark:border-neutral-700 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1a1d24] hover:bg-gray-50 dark:hover:bg-neutral-800 transition duration-200"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!activeReceipt) {
    return (
      <div className="pt-24 pb-20 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-creamy-500/10 text-creamy-500 border border-creamy-500/30 rounded-full flex items-center justify-center mx-auto">
            <Package className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight font-anton text-gray-900 dark:text-white">
              Looking For Your Order Receipt?
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mt-2 leading-relaxed">
              No active confirmation is loaded in this browser session. Enter your order or tracking number in the live tracker, or return to the store catalog.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('dfe:open-track-order', { detail: {} }))}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-xs rounded-xl transition-all"
            >
              <Truck className="w-4 h-4" />
              <span>Track Existing Order</span>
            </button>
            <Link
              to="/"
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-900 dark:text-white font-bold text-xs rounded-xl border border-gray-200 dark:border-neutral-700 transition-all"
            >
              <Home className="w-4 h-4" />
              <span>Return to Store</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const handleCopyTrackingNumber = async () => {
    try {
      await navigator.clipboard.writeText(displayTrackingNumber)
      setCopiedTracking(true)
      setTimeout(() => setCopiedTracking(false), 2000)
    } catch {
      // Ignore
    }
  }

  const handleOpenLiveTracker = () => {
    window.dispatchEvent(
      new CustomEvent('dfe:open-track-order', {
        detail: { trackingNumber: displayTrackingNumber }
      })
    )
  }

  const handleDownloadReceipt = async () => {
    if (activeReceipt.orderId && (activeReceipt.receiptToken || localStorage.getItem('token'))) {
      try {
        const token = localStorage.getItem('token')
        const qs = activeReceipt.receiptToken ? `?token=${encodeURIComponent(activeReceipt.receiptToken)}` : ''
        const res = await fetch(`${apiUrl}/orders/${encodeURIComponent(activeReceipt.orderId)}/receipt.pdf${qs}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `Receipt-${activeReceipt.orderNumber}.pdf`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(url), 1000)
          return
        }
      } catch {
        // Fallback to local PDF generation
      }
    }
    downloadReceiptPdf(activeReceipt)
  }

  const handlePrintReceipt = () => {
    window.print()
  }

  const handleCopyReceipt = async () => {
    try {
      await navigator.clipboard.writeText(generateReceiptText(activeReceipt))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  return (
    <div className="pt-24 pb-20 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

        {/* Order Confirmation Hero Banner (no-print) */}
        <div className="no-print bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6 sm:p-8 text-center transition-colors">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
            <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12" />
          </div>

          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            Payment Verified & Settled
          </span>

          <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-gray-900 dark:text-white mt-3 font-anton">
            Order Confirmed!
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 max-w-xl mx-auto mt-2 font-medium">
            Thank you for choosing <span className="text-creamy-500 font-bold">DriveFlyElectric</span>. Your order has been placed and scheduled for Worldwide Express Dispatch.
          </p>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 dark:bg-[#1a1d24] rounded-xl p-4 border border-gray-200 dark:border-neutral-800 text-left">
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-neutral-400">Order Ref</p>
              <p className="text-xs font-black text-gray-900 dark:text-white font-mono truncate">{displayOrderNumber}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-neutral-400">Tracking #</p>
              <p className="text-xs font-black text-creamy-500 font-mono truncate">{displayTrackingNumber}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-neutral-400">Total USD</p>
              <p className="text-xs font-black text-creamy-500 font-anton">{activeReceipt.finalCost}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-neutral-400">Dispatch</p>
              <p className="text-xs font-bold text-emerald-500">2-4 Business Days</p>
            </div>
          </div>

          {/* Dedicated Tracking Number & Live Order Tracking Callout */}
          <div className="mt-5 p-4 sm:p-5 rounded-xl bg-creamy-500/10 border border-creamy-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-creamy-500 text-black flex items-center justify-center shrink-0 shadow-md">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-creamy-500">
                  Official Shipment Tracking Number Issued
                </p>
                <p className="text-sm sm:text-base font-black font-mono text-gray-900 dark:text-white mt-0.5">
                  {displayTrackingNumber}
                </p>
                <p className="text-[11px] text-gray-600 dark:text-neutral-300">
                  Use this tracking number anytime via the <strong>Track Order</strong> button on the top navigation bar.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={handleCopyTrackingNumber}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#13151b] border border-gray-300 dark:border-neutral-700 text-xs font-bold text-gray-800 dark:text-white hover:border-creamy-500 transition-colors cursor-pointer"
              >
                {copiedTracking ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-creamy-500" />}
                <span>{copiedTracking ? 'Copied!' : 'Copy Tracking #'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenLiveTracker}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-xs shadow-md transition-all cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Track Order Live</span>
              </button>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleDownloadReceipt}
              className="inline-flex items-center gap-2 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-xs px-5 py-3 rounded-xl shadow-lg shadow-creamy-500/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Receipt (.pdf)
            </button>

            <button
              onClick={handlePrintReceipt}
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-900 dark:text-white font-bold text-xs px-5 py-3 rounded-xl border border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
              Print Receipt
            </button>

            <button
              onClick={handleCopyReceipt}
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-900 dark:text-white font-bold text-xs px-4 py-3 rounded-xl border border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-gray-500 dark:text-neutral-400" />}
              {copied ? 'Copied!' : 'Copy Summary'}
            </button>
          </div>
        </div>

        {/* Official Printable Receipt Card */}
        <div
          id="printable-receipt"
          className="bg-white dark:bg-[#16181e] border-2 border-gray-300 dark:border-neutral-800 rounded-2xl shadow-2xl p-6 sm:p-10 font-mono text-xs text-gray-900 dark:text-neutral-100 transition-colors"
        >
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-neutral-800 pb-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-creamy-500 no-print" />
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wider font-sans text-gray-900 dark:text-white">
                  Official Purchase Receipt
                </h2>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-0.5">
                DriveFlyElectric • Order Summary & Verification
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-creamy-500/10 text-creamy-600 dark:text-creamy-400 border border-creamy-500/20">
                Settled in Full
              </span>
            </div>
          </div>

          {/* Formatted Receipt Block matching exact prompt layout */}
          <div className="bg-gray-50 dark:bg-[#101217] p-5 rounded-xl border border-gray-200 dark:border-neutral-800 text-[11px] sm:text-xs leading-relaxed space-y-4 whitespace-pre-wrap select-text">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Receipt </p>
              <p className="font-bold text-gray-900 dark:text-white"> Order Summary </p>
              <p className="text-gray-700 dark:text-neutral-300">Date: {activeReceipt.date}</p>
              <p className="text-gray-400 dark:text-neutral-600">--------------------------------------------------------------------------------  </p>
            </div>

            <div>
              <p className="text-gray-900 dark:text-white font-medium">Hello, </p>
              <p className="text-gray-800 dark:text-neutral-200">Thank you for choosing to shop with us. Here's a summary of your order. </p>
            </div>

            <div>
              <p className="font-bold text-gray-900 dark:text-white">Order Details </p>
              <p className="text-gray-400 dark:text-neutral-600">********************************************************************************  </p>
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Order Date     :</span>
                <span className="col-span-8 sm:col-span-9 font-semibold text-gray-900 dark:text-white">{activeReceipt.orderDate}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Order Number   :</span>
                <span className="col-span-8 sm:col-span-9 font-bold text-creamy-600 dark:text-creamy-400">{activeReceipt.orderNumber}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Tracking Number:</span>
                <span className="col-span-8 sm:col-span-9 font-bold text-creamy-600 dark:text-creamy-400 font-mono">{displayTrackingNumber}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Transaction ID :</span>
                <span className="col-span-8 sm:col-span-9 text-gray-800 dark:text-neutral-200 font-mono">{activeReceipt.transactionId}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">User Name      :</span>
                <span className="col-span-8 sm:col-span-9 font-semibold text-gray-900 dark:text-white">{activeReceipt.userName}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Address        :</span>
                <span className="col-span-8 sm:col-span-9 text-gray-800 dark:text-neutral-200">{activeReceipt.address}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Payment source :</span>
                <span className="col-span-8 sm:col-span-9 font-semibold text-gray-900 dark:text-white">{activeReceipt.paymentSource}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Initial Charge :</span>
                <span className="col-span-8 sm:col-span-9 font-semibold text-gray-900 dark:text-white">{activeReceipt.initialCharge}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Final Cost     :</span>
                <span className="col-span-8 sm:col-span-9 font-bold text-emerald-600 dark:text-emerald-400">{activeReceipt.finalCost}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Total Refund   :</span>
                <span className="col-span-8 sm:col-span-9 text-gray-800 dark:text-neutral-200">{activeReceipt.totalRefund || '$0.00'}</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <span className="col-span-4 sm:col-span-3 text-gray-500 dark:text-neutral-400">Refund Trans   :</span>
                <span className="col-span-8 sm:col-span-9 text-gray-800 dark:text-neutral-200">{activeReceipt.refundTrans || 'N/A'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-neutral-800 space-y-2 text-gray-600 dark:text-neutral-400 text-[10px] sm:text-[11px]">
              <p className="font-semibold text-gray-900 dark:text-white">Full details for this order have been reviewed by customer</p>
              <p className="font-semibold text-gray-800 dark:text-neutral-300">Additional Transaction Details:</p>
              <p>
                If you&apos;ve purchased this item, it means you have reviewed the selected model specifications and agreed with our terms and conditions applying to order settlement.
              </p>
              <p>
                Feel free to contact our Customer Service via email (<a href={`mailto:${getSupportContactEmail()}`} className="text-creamy-500 font-semibold underline">{getSupportContactEmail()}</a>) or WhatsApp (<a href={`https://wa.me/${whatsAppDigits}`} target="_blank" rel="noopener noreferrer" className="text-creamy-500 font-semibold underline">{supportPhone}</a>) if you have any questions or concerns. We&apos;re available 24/7.
              </p>
              <p className="pt-1">Regards,<br />DriveFlyElectric Team<br /><a href="https://driveflyelectric.shop/" target="_blank" rel="noreferrer" className="text-creamy-500 font-semibold hover:underline">https://driveflyelectric.shop/</a></p>
            </div>
          </div>

          {/* Line Items Breakdown (Optional extra detail in print view) */}
          {activeReceipt.items && activeReceipt.items.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-200 dark:border-neutral-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-neutral-300 mb-2">
                Purchased Units:
              </h3>
              <div className="space-y-1.5">
                {activeReceipt.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px] text-gray-700 dark:text-neutral-300">
                    <span>{item.name} × {item.quantity}</span>
                    <span className="font-bold text-gray-900 dark:text-white font-mono">{item.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation (no-print) */}
        <div className="no-print flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-xs rounded-xl shadow-lg shadow-creamy-500/20 transition-all"
          >
            <Home className="w-4 h-4" />
            Continue Shopping
          </Link>
          <Link
            to="/cart"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700 text-gray-800 dark:text-white font-bold text-xs rounded-xl border border-gray-300 dark:border-neutral-700 transition-all"
          >
            <Package className="w-4 h-4 text-gray-500" />
            View Cart
          </Link>
        </div>

      </div>
    </div>
  )
}

export default OrderSuccessPage
