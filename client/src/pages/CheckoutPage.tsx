import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js'
import { CreditCard, Truck, Lock, CheckCircle, AlertCircle, Globe, Search } from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { orderApi, paymentApi, addressApi, cartApi } from '../services/api'
import { COUNTRIES, POPULAR_COUNTRY_CODES, resolveClientCountryIso2 } from '../data/countries'

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

// Initialize Stripe with synced Live Publishable Key from .env (with runtime server sync in CheckoutPage)
const defaultStripePublishableKey =
  (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
  'pk_live_51U1OVJAZusdAC7Xt4oUvFKuo36Qv6bYLXClwuWTzykMfDGJm29pZJPTSU98hS4R13id0KB0BFRp8sjHTcCClExjh00TOV3ZXSq'

const defaultPayPalClientId =
  (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ||
  'AeZPJVk6Zp1zLPnNtCcOdXvQFQi-iLkWnSdbB7c0vYwyOpQMG845TpUz6MZSJd-TXLfHgFfiBrLEWxpt'

const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>()
const getOrLoadStripePromise = (publishableKey: string) => {
  const cleanKey = (publishableKey || defaultStripePublishableKey).trim()
  let cached = stripePromiseCache.get(cleanKey)
  if (!cached) {
    cached = loadStripe(cleanKey)
    stripePromiseCache.set(cleanKey, cached)
  }
  return cached
}
getOrLoadStripePromise(defaultStripePublishableKey)

const ArrowLeft = ({ className }: { className?: string }) => (
  <svg className={className || 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

interface ShippingFormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  state: string
  zipCode: string
  country: string
}

const CheckoutForm: React.FC = () => {
  const navigate = useNavigate()
  const stripe = useStripe()
  const elements = useElements()

  const { items, totalPrice, clearCart } = useCart()
  const { user, isAuthenticated, setAuthenticatedUser } = useAuth()

  // Account creation for guest shoppers
  const [createAccount, setCreateAccount] = useState(false)
  const [accountPassword, setAccountPassword] = useState('')

  // Supported payment modes: PayPal Primary (Standard SDK: PayPal + Debit or Credit Card) or Stripe Secondary Card
  const [paymentMethod, setPaymentMethod] = useState<'PAYPAL' | 'STRIPE'>('PAYPAL')
  const [cardholderName, setCardholderName] = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  // PayPal JS SDK v5 Expanded Checkout state & container refs
  const [paypalSdkReady, setPaypalSdkReady] = useState(false)
  const [paypalSdkStatus, setPaypalSdkStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [paypalCardFieldsEligible, setPaypalCardFieldsEligible] = useState(false)
  const [paypalCardFieldError, setPaypalCardFieldError] = useState<string | null>(null)
  const paypalButtonsContainerRef = useRef<HTMLDivElement>(null)
  const paypalCardNameRef = useRef<HTMLDivElement>(null)
  const paypalCardNumberRef = useRef<HTMLDivElement>(null)
  const paypalCardExpiryRef = useRef<HTMLDivElement>(null)
  const paypalCardCvvRef = useRef<HTMLDivElement>(null)
  const paypalCardFieldsRef = useRef<any>(null)
  const submitPayPalCardFieldsRef = useRef<() => Promise<void>>(async () => { })

  const [shippingData, setShippingData] = useState<ShippingFormData>({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address1: '',
    address2: '',
    city: '',
    state: 'TX',
    zipCode: '',
    country: 'United States'
  })

  // Keep a ref to latest shippingData & totals so PayPal SDK callbacks always read fresh values
  const latestCheckoutRef = useRef({
    shippingData,
    createAccount,
    accountPassword,
    isAuthenticated,
    items,
    totalPrice,
    grandTotal: 0,
    estimatedTax: 0,
    shippingCost: 0
  })

  // Format price in USD
  const formatPrice = (price: number) => {
    return `$${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // 100% Free Express Shipping on all store orders
  const shippingCost = 0
  const estimatedTax = totalPrice * 0.05
  const grandTotal = totalPrice + shippingCost + estimatedTax

  useEffect(() => {
    latestCheckoutRef.current = {
      shippingData,
      createAccount,
      accountPassword,
      isAuthenticated,
      items,
      totalPrice,
      grandTotal,
      estimatedTax,
      shippingCost
    }
  }, [shippingData, createAccount, accountPassword, isAuthenticated, items, totalPrice, grandTotal, estimatedTax, shippingCost])

  // Sync user profile and saved default shipping address when authenticated
  useEffect(() => {
    if (user) {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
      if (fullName && !cardholderName) setCardholderName(fullName)
      setShippingData(prev => ({
        ...prev,
        firstName: prev.firstName || user.firstName || '',
        lastName: prev.lastName || user.lastName || '',
        email: prev.email || user.email || '',
        phone: prev.phone || user.phone || ''
      }))
    }
    if (isAuthenticated) {
      addressApi.getAddresses().then(res => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const defaultAddr = res.data.find((a: any) => a.isDefault) || res.data[0]
          if (defaultAddr) {
            setShippingData(prev => ({
              ...prev,
              firstName: prev.firstName || defaultAddr.firstName || '',
              lastName: prev.lastName || defaultAddr.lastName || '',
              phone: prev.phone || defaultAddr.phone || '',
              address1: prev.address1 || defaultAddr.address1 || '',
              address2: prev.address2 || defaultAddr.address2 || '',
              city: prev.city || defaultAddr.city || '',
              state: prev.state || defaultAddr.state || 'TX',
              zipCode: prev.zipCode || defaultAddr.zipCode || '',
              country: prev.country || defaultAddr.country || 'United States'
            }))
          }
        }
      }).catch(() => { })
    }
  }, [user, isAuthenticated])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
    const syncDark = () => setIsDarkMode(document.documentElement.classList.contains('dark'))
    syncDark()
    const observer = new MutationObserver(syncDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Sync unpaid checkout cart snapshot for progressive reminder emails (1h, 6h, 12h, 24h, 48h, 72h)
  useEffect(() => {
    if (items.length === 0) return
    const email = (shippingData.email || '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return

    const customerName = `${shippingData.firstName || ''} ${shippingData.lastName || ''}`.trim()
    try {
      localStorage.setItem('dfe_checkout_email', email)
      if (customerName) localStorage.setItem('dfe_checkout_name', customerName)
    } catch {
      // ignore storage error
    }

    if (isAuthenticated) return

    const timer = window.setTimeout(() => {
      let visitorId: string | undefined
      try {
        visitorId = localStorage.getItem('dfe_cart_visitor_id') || undefined
        if (!visitorId && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          visitorId = crypto.randomUUID()
          localStorage.setItem('dfe_cart_visitor_id', visitorId)
        }
      } catch {
        visitorId = undefined
      }

      cartApi
        .syncReminderSnapshot({
          email,
          customerName: customerName || undefined,
          visitorId,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        })
        .catch(() => { })
    }, 1200)

    return () => window.clearTimeout(timer)
  }, [items, shippingData.email, shippingData.firstName, shippingData.lastName, isAuthenticated])

  const buildPaymentRequestPayload = useCallback(() => {
    const { items: currentItems, shippingData: sd } = latestCheckoutRef.current
    return {
      items: currentItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
      customerEmail: sd.email,
      shippingAddress: {
        firstName: sd.firstName,
        lastName: sd.lastName,
        email: sd.email,
        phone: sd.phone,
        address1: sd.address1,
        address2: sd.address2,
        city: sd.city,
        state: sd.state,
        zipCode: sd.zipCode,
        country: sd.country,
        countryCode: resolveClientCountryIso2(sd.country),
      },
    }
  }, [])

  const validateShippingBeforeCheckout = useCallback((): boolean => {
    const { shippingData: sd, isAuthenticated: isAuth, createAccount: ca, accountPassword: pwd } = latestCheckoutRef.current
    if (!sd.firstName || !sd.lastName || !sd.email || !sd.address1 || !sd.city || !sd.zipCode || !sd.country) {
      setErrorMessage('Please fill in all required delivery destination fields (First Name, Last Name, Email, Street Address, City, Postal/ZIP Code, and Country) before completing payment.')
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return false
    }
    if (!isAuth && ca && (!pwd || pwd.length < 8)) {
      setErrorMessage('Please provide an account password with at least 8 characters.')
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return false
    }
    setErrorMessage(null)
    return true
  }, [])

  // Unified Order Settlement Handler (Used by PayPal Expanded Checkout & Stripe Card Elements)
  const finalizeSettledOrder = useCallback(async (
    settledMethod: 'STRIPE' | 'PAYPAL',
    paymentRecordId: string,
    paymentSourceLabel?: string,
    paypalOrderId?: string
  ) => {
    const {
      shippingData: sd,
      createAccount: ca,
      accountPassword: pwd,
      isAuthenticated: isAuth,
      items: currentItems,
      totalPrice: subTotal,
      grandTotal: finalTotal,
      estimatedTax: taxAmt
    } = latestCheckoutRef.current

    const shouldCreateAccount = !isAuth && ca
    const countryCode = resolveClientCountryIso2(sd.country)
    setIsProcessing(true)
    setProcessingStep('Securing your settled order & generating official PDF receipt...')

    const orderRes = await orderApi.createOrder({
      items: currentItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod: settledMethod,
      paymentId: paymentRecordId,
      paymentStatus: 'COMPLETED',
      ...(paypalOrderId ? { paypalOrderId } : {}),
      shippingAddress: {
        firstName: sd.firstName,
        lastName: sd.lastName,
        email: sd.email,
        phone: sd.phone,
        address1: sd.address1,
        address2: sd.address2,
        city: sd.city,
        state: sd.state,
        postalCode: sd.zipCode,
        country: sd.country,
        countryCode
      },
      createAccount: shouldCreateAccount,
      password: shouldCreateAccount ? pwd : undefined,
      notes: `Express Worldwide Dispatch to ${sd.city}${sd.state ? `, ${sd.state}` : ''}, ${sd.country} (${sd.zipCode}). Paid & Settled via ${settledMethod} (${paymentRecordId})`
    })

    if (!orderRes.success || !orderRes.data) {
      throw new Error(orderRes.error || 'Payment succeeded, but saving the order failed. Please contact support with your payment reference.')
    }

    if (orderRes.token && orderRes.user) {
      setAuthenticatedUser(orderRes.user, orderRes.token)
    }

    const orderId = orderRes.data.id || ''
    const receiptToken = orderRes.data.receiptToken || undefined
    const orderNumber = orderRes.data?.orderNumber || ''
    const trackingNumber =
      orderRes.data?.trackingNumber ||
      (orderNumber ? `TRK-${orderNumber}` : '')
    const formattedOrderDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    const locationPart = [sd.city, sd.state, sd.zipCode].filter(Boolean).join(', ')
    const fullAddressString = `${sd.address1}${sd.address2 ? `, ${sd.address2}` : ''}, ${locationPart}, ${sd.country}`

    const receiptData = {
      orderId,
      receiptToken,
      date: formattedOrderDate,
      orderDate: formattedOrderDate,
      orderNumber,
      trackingNumber,
      transactionId: paymentRecordId,
      userName: `${sd.firstName} ${sd.lastName}`.trim() || 'Valued Customer',
      address: fullAddressString,
      paymentSource: paymentSourceLabel || (settledMethod === 'STRIPE' ? 'Credit / Debit Card (Stripe)' : 'PayPal Express'),
      initialCharge: `$${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      finalCost: `$${finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      totalRefund: '$0.00',
      refundTrans: 'N/A',
      shippingCost: '$0.00 (Free Express Shipping)',
      tax: `$${taxAmt.toFixed(2)}`,
      items: currentItems.map(i => ({
        name: i.product.name,
        quantity: i.quantity,
        price: `$${i.product.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        total: `$${(i.quantity * i.product.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }))
    }

    localStorage.setItem('latest_order_receipt', JSON.stringify(receiptData))
    try {
      const prevTrackings = JSON.parse(localStorage.getItem('dfe_recent_trackings') || '[]')
      const nextEntry = {
        orderNumber,
        trackingNumber,
        date: formattedOrderDate,
        total: finalTotal,
        destination: `${locationPart}, ${sd.country}`,
        status: 'PROCESSING',
        items: receiptData.items
      }
      const deduped = [nextEntry, ...prevTrackings.filter((t: any) => t.trackingNumber !== trackingNumber && t.orderNumber !== orderNumber)].slice(0, 8)
      localStorage.setItem('dfe_recent_trackings', JSON.stringify(deduped))
    } catch {
      // Ignore storage error
    }
    clearCart()

    navigate('/order-success', {
      state: {
        orderId,
        receiptToken,
        orderNumber,
        trackingNumber,
        total: finalTotal,
        paymentMethod: settledMethod,
        shippingAddress: fullAddressString,
        receiptData
      }
    })
  }, [clearCart, navigate, setAuthenticatedUser])

  // Load PayPal JS SDK v5 Expanded Checkout (PayPal Wallet Button + Hosted Card Fields)
  useEffect(() => {
    let isMounted = true

    const handleLoaded = () => {
      if (!isMounted) return
      if ((window as any).paypal) {
        setPaypalSdkStatus('ready')
        setPaypalSdkReady(true)
      } else {
        setPaypalSdkStatus('error')
      }
    }

    const handleFailed = () => {
      if (!isMounted) return
      setPaypalSdkStatus('error')
    }

    const loadPayPalSdk = async () => {
      if ((window as any).paypal) {
        handleLoaded()
        return
      }

      let clientId = defaultPayPalClientId
      let clientToken: string | null = null

      try {
        const cfgRes = await paymentApi.getConfig()
        if (cfgRes.success && cfgRes.data) {
          if (cfgRes.data.paypalClientId) {
            clientId = cfgRes.data.paypalClientId
          }
          if (cfgRes.data.paypalClientToken) {
            clientToken = cfgRes.data.paypalClientToken
          }
        }
      } catch {
        // Use fallback clientId from client environment
      }

      if (!isMounted) return
      if ((window as any).paypal) {
        handleLoaded()
        return
      }

      const existingScript = document.getElementById('dfe-paypal-js-sdk') as HTMLScriptElement | null
      if (existingScript) {
        existingScript.addEventListener('load', handleLoaded)
        existingScript.addEventListener('error', handleFailed)
        return
      }

      if (!clientId) {
        handleFailed()
        return
      }

      const script = document.createElement('script')
      script.id = 'dfe-paypal-js-sdk'
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons,card-fields&enable-funding=card&disable-funding=paylater,venmo`
      if (clientToken) {
        script.setAttribute('data-client-token', clientToken)
      }
      script.async = true
      script.addEventListener('load', handleLoaded)
      script.addEventListener('error', handleFailed)
      document.body.appendChild(script)
    }

    loadPayPalSdk()
    return () => {
      isMounted = false
      const existingScript = document.getElementById('dfe-paypal-js-sdk') as HTMLScriptElement | null
      if (existingScript) {
        existingScript.removeEventListener('load', handleLoaded)
        existingScript.removeEventListener('error', handleFailed)
      }
    }
  }, [])

  // Submit handler for PayPal Expanded Hosted Card Fields (Name, Number, Expiry, CVV)
  const submitPayPalCardFields = useCallback(async () => {
    if (isProcessing) return
    const cf = paypalCardFieldsRef.current
    if (!cf || typeof cf.submit !== 'function') {
      setErrorMessage('PayPal Card Fields are still initializing. Please try again in a moment.')
      return
    }
    if (!validateShippingBeforeCheckout()) return

    setErrorMessage(null)
    setPaypalCardFieldError(null)

    try {
      if (typeof cf.getState === 'function') {
        const cfState = await cf.getState()
        if (cfState && cfState.isFormValid === false) {
          const msg = 'Please enter a valid cardholder name, card number, expiration date, and security code (CVV).'
          setPaypalCardFieldError(msg)
          setErrorMessage(msg)
          setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
          return
        }
      }

      setIsProcessing(true)
      setProcessingStep('Authorizing card via PayPal Expanded Checkout...')

      const { shippingData: sd } = latestCheckoutRef.current
      await cf.submit({
        billingAddress: {
          addressLine1: sd.address1,
          addressLine2: sd.address2 || undefined,
          adminArea2: sd.city,
          adminArea1: sd.state || undefined,
          postalCode: sd.zipCode,
          countryCode: resolveClientCountryIso2(sd.country),
        },
      })
    } catch (err: any) {
      setIsProcessing(false)
      setProcessingStep('')
      const msg = err?.message || 'Unable to authorize your card through PayPal. Please check your card details or use PayPal Wallet / Stripe.'
      setPaypalCardFieldError(msg)
      setErrorMessage(msg)
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    }
  }, [isProcessing, validateShippingBeforeCheckout])

  useEffect(() => {
    submitPayPalCardFieldsRef.current = submitPayPalCardFields
  }, [submitPayPalCardFields])

  // Mount PayPal Expanded Checkout ("Pay with PayPal" button + Hosted Card Fields)
  // Containers stay mounted in the DOM (toggled via CSS) so SDK iframes remain intact across method switches.
  useEffect(() => {
    const paypal = (window as any).paypal
    if (!paypalSdkReady || !paypal || !paypalButtonsContainerRef.current || items.length === 0) return

    let cancelled = false
    let buttonsInstance: { close?: () => Promise<void> } | null = null
    const cardFieldChildren: Array<{ close?: () => Promise<void> }> = []

    const clearPayPalMountContainers = () => {
      if (paypalButtonsContainerRef.current) paypalButtonsContainerRef.current.innerHTML = ''
      if (paypalCardNameRef.current) paypalCardNameRef.current.innerHTML = ''
      if (paypalCardNumberRef.current) paypalCardNumberRef.current.innerHTML = ''
      if (paypalCardExpiryRef.current) paypalCardExpiryRef.current.innerHTML = ''
      if (paypalCardCvvRef.current) paypalCardCvvRef.current.innerHTML = ''
    }

    paypalCardFieldsRef.current = null
    setPaypalCardFieldsEligible(false)
    setPaypalCardFieldError(null)
    clearPayPalMountContainers()

    const createPayPalOrderId = async () => {
      setPaypalCardFieldError(null)
      setProcessingStep('Creating encrypted PayPal USD order...')
      const res = await paymentApi.createPayPalOrder(buildPaymentRequestPayload())
      if (!res.success || !res.data?.orderId) {
        throw new Error(res.error || 'Could not initialize PayPal order.')
      }
      return res.data.orderId
    }

    const handlePayPalApprove = async (data: any, sourceLabel?: string) => {
      try {
        setIsProcessing(true)
        setProcessingStep('Capturing & verifying PayPal settlement...')
        const capRes = await paymentApi.capturePayPalPayment(data.orderID)
        if (!capRes.success) {
          throw new Error(capRes.error || 'Failed to capture PayPal payment.')
        }
        const txId = capRes.data?.paymentId || data.orderID
        const resolvedLabel =
          sourceLabel ||
          (data?.paymentSource === 'card' ? 'Debit or Credit Card (PayPal)' : 'PayPal Checkout')
        await finalizeSettledOrder('PAYPAL', txId, resolvedLabel, data.orderID)
      } catch (err: any) {
        setIsProcessing(false)
        setProcessingStep('')
        setErrorMessage(err?.message || 'PayPal payment capture failed.')
        setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      }
    }

    const handlePayPalCancel = () => {
      setIsProcessing(false)
      setProcessingStep('')
    }

    const handlePayPalError = (err: any, fromCardFields = false) => {
      setIsProcessing(false)
      setProcessingStep('')
      const msg = String(err?.message || err || '')
      if (msg.includes('VALIDATION_HANDLED')) return
      if (msg) {
        if (fromCardFields) setPaypalCardFieldError(msg)
        setErrorMessage(msg)
        setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      }
    }

    // 1. Initialize Expanded Hosted Card Fields if merchant/browser is eligible
    let cardFieldsEligible = false
    try {
      if (typeof paypal.CardFields === 'function') {
        const cardFields = paypal.CardFields({
          createOrder: createPayPalOrderId,
          onApprove: (data: any) => handlePayPalApprove(data, 'Debit or Credit Card (PayPal)'),
          onCancel: handlePayPalCancel,
          onError: (err: any) => handlePayPalError(err, true),
          style: {
            input: {
              background: isDarkMode ? '#14171f' : '#ffffff',
              border: 'none',
              'box-shadow': 'none',
              outline: 'none',
              'font-size': '14px',
              'font-family': 'ui-sans-serif, system-ui, -apple-system, sans-serif',
              'font-weight': '500',
              color: isDarkMode ? '#f3f4f6' : '#111827',
              padding: '10px 12px',
            },
            '.invalid': {
              color: '#ef4444',
            },
            '::placeholder': {
              color: isDarkMode ? '#6b7280' : '#9ca3af',
            },
          },
          inputEvents: {
            onChange: (data: any) => {
              if (data?.isFormValid) {
                setPaypalCardFieldError(null)
              }
            },
            onFocus: () => {
              setPaypalCardFieldError(prev => (prev ? null : prev))
            },
            onInputSubmitRequest: () => {
              submitPayPalCardFieldsRef.current().catch(() => { })
            },
          },
        })

        if (cardFields && typeof cardFields.isEligible === 'function' && cardFields.isEligible() && !cancelled) {
          cardFieldsEligible = true
          paypalCardFieldsRef.current = cardFields
          setPaypalCardFieldsEligible(true)

          const fieldSpecs = [
            { field: cardFields.NameField?.({ placeholder: 'Cardholder full name' }), container: paypalCardNameRef.current },
            { field: cardFields.NumberField?.({ placeholder: '1234 5678 9012 3456' }), container: paypalCardNumberRef.current },
            { field: cardFields.ExpiryField?.({ placeholder: 'MM / YY' }), container: paypalCardExpiryRef.current },
            { field: cardFields.CVVField?.({ placeholder: 'CVV' }), container: paypalCardCvvRef.current },
          ]

          for (const spec of fieldSpecs) {
            if (spec.field && spec.container) {
              cardFieldChildren.push(spec.field)
              Promise.resolve(spec.field.render(spec.container)).catch((renderErr: any) => {
                console.warn('PayPal CardField render notice:', renderErr)
              })
            }
          }
        }
      }
    } catch (e) {
      console.warn('PayPal CardFields initialization notice:', e)
    }

    // 2. Mount PayPal Wallet Button (standalone when Hosted Card Fields are active; full vertical stack as fallback)
    if (paypal.Buttons) {
      try {
        const useStandalonePayPalButton = Boolean(cardFieldsEligible && paypal.FUNDING?.PAYPAL)
        const buttonStyle: Record<string, any> = {
          color: 'gold',
          shape: 'rect',
          label: 'paypal',
          height: 46,
        }
        if (!useStandalonePayPalButton) {
          buttonStyle.layout = 'vertical'
        }

        const instance = paypal.Buttons({
          ...(useStandalonePayPalButton ? { fundingSource: paypal.FUNDING.PAYPAL } : {}),
          style: buttonStyle,
          onClick: (_data: any, actions: any) => {
            if (!validateShippingBeforeCheckout()) {
              return actions.reject()
            }
            return actions.resolve()
          },
          createOrder: createPayPalOrderId,
          onApprove: (data: any) => handlePayPalApprove(data),
          onCancel: handlePayPalCancel,
          onError: (err: any) => handlePayPalError(err, false),
        })

        if (instance.isEligible() && !cancelled) {
          buttonsInstance = instance
          instance.render(paypalButtonsContainerRef.current).catch((renderErr: any) => {
            console.warn('PayPal Buttons render notice:', renderErr)
          })
        }
      } catch (e) {
        console.warn('PayPal Buttons initialization notice:', e)
      }
    }

    return () => {
      cancelled = true
      paypalCardFieldsRef.current = null
      if (buttonsInstance && typeof buttonsInstance.close === 'function') {
        buttonsInstance.close().catch(() => { })
      }
      for (const child of cardFieldChildren) {
        if (child && typeof child.close === 'function') {
          child.close().catch(() => { })
        }
      }
      clearPayPalMountContainers()
    }
  }, [paypalSdkReady, items.length, isDarkMode, validateShippingBeforeCheckout, buildPaymentRequestPayload, finalizeSettledOrder])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (errorMessage) setErrorMessage(null)
    setShippingData(prev => {
      if (name === 'country') {
        if (value !== 'United States' && prev.state === 'TX') {
          return { ...prev, country: value, state: '' }
        }
        if (value === 'United States' && !prev.state) {
          return { ...prev, country: value, state: 'TX' }
        }
      }
      return {
        ...prev,
        [name]: value
      }
    })
  }

  // Primary Submit Handler supporting PayPal Expanded CardFields, PayPal Express Portal Redirect, and Stripe Card Elements
  const handlePayment = async () => {
    if (!validateShippingBeforeCheckout()) return

    if (
      paymentMethod === 'PAYPAL' &&
      paypalCardFieldsRef.current &&
      typeof paypalCardFieldsRef.current.getState === 'function'
    ) {
      try {
        const cfState = await Promise.race([
          paypalCardFieldsRef.current.getState(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 600)),
        ])
        const hasTypedCard = Boolean(
          cfState?.fields &&
          Object.values(cfState.fields).some((f: any) => f && f.isEmpty === false)
        )
        if (hasTypedCard) {
          await submitPayPalCardFields()
          return
        }
      } catch {
        // Proceed with Express Checkout redirect fallback
      }
    }

    const countryCode = resolveClientCountryIso2(shippingData.country)
    const paymentPayload = buildPaymentRequestPayload()

    setErrorMessage(null)
    setIsProcessing(true)

    try {
      if (paymentMethod === 'PAYPAL') {
        // Redirect fallback or direct order settlement when submitting via primary summary button
        setProcessingStep('Connecting to PayPal Express Checkout...')
        const ppRes = await paymentApi.createPayPalOrder(paymentPayload)
        if (!ppRes.success || !ppRes.data?.orderId) {
          throw new Error(ppRes.error || 'Failed to connect to PayPal.')
        }

        const ppOrderId = ppRes.data.orderId
        const approveUrl = ppRes.data.approveUrl

        if (approveUrl) {
          const shouldCreateAccount = !isAuthenticated && createAccount
          const orderPayload = {
            items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
            paymentMethod: 'PAYPAL' as const,
            shippingAddress: {
              firstName: shippingData.firstName,
              lastName: shippingData.lastName,
              email: shippingData.email,
              phone: shippingData.phone,
              address1: shippingData.address1,
              address2: shippingData.address2,
              city: shippingData.city,
              state: shippingData.state,
              postalCode: shippingData.zipCode,
              country: shippingData.country,
              countryCode
            },
            createAccount: shouldCreateAccount,
            password: shouldCreateAccount ? accountPassword : '',
            notes: `Express Worldwide Dispatch to ${shippingData.city}${shippingData.state ? `, ${shippingData.state}` : ''}, ${shippingData.country} (${shippingData.zipCode}). Paid & Settled via PAYPAL (${ppOrderId})`
          }

          localStorage.setItem('pending_paypal_order', JSON.stringify({
            ppOrderId,
            grandTotal,
            subtotal: totalPrice,
            shippingCost,
            tax: estimatedTax,
            shippingData,
            createAccount: shouldCreateAccount,
            accountPassword: shouldCreateAccount ? accountPassword : '',
            items: items.map(i => ({
              productId: i.productId,
              name: i.product.name,
              quantity: i.quantity,
              price: i.product.price
            })),
            orderData: orderPayload
          }))
          window.location.href = approveUrl
          return
        }

        const captureRes = await paymentApi.capturePayPalPayment(ppOrderId)
        if (!captureRes.success) {
          throw new Error(captureRes.error || 'PayPal capture failed.')
        }
        await finalizeSettledOrder('PAYPAL', captureRes.data?.paymentId || ppOrderId, 'PayPal Express', ppOrderId)
        return
      }

      if (paymentMethod === 'STRIPE') {
        if (!stripe || !elements) {
          throw new Error('Stripe Card Gateway is initializing. Please wait a moment and try again.')
        }

        const cardNumberElement = elements.getElement(CardNumberElement)
        if (!cardNumberElement) {
          throw new Error('Card input fields are not ready. Please refresh the page.')
        }

        setProcessingStep('Initializing secure USD card transaction with Stripe...')
        const intentRes = await paymentApi.createStripePaymentIntent(paymentPayload)
        if (!intentRes.success || !intentRes.data?.clientSecret) {
          throw new Error(intentRes.error || 'Failed to initialize card payment with Stripe.')
        }

        const clientSecret = intentRes.data.clientSecret

        setProcessingStep('Authorizing card with your bank (3D-Secure)...')
        const confirmResult = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardNumberElement,
            billing_details: {
              name: cardholderName.trim() || `${shippingData.firstName} ${shippingData.lastName}`.trim(),
              email: shippingData.email,
              phone: shippingData.phone || undefined,
              address: {
                line1: shippingData.address1,
                line2: shippingData.address2 || undefined,
                city: shippingData.city,
                state: shippingData.state || undefined,
                postal_code: shippingData.zipCode,
                country: countryCode
              }
            }
          }
        })

        if (confirmResult.error) {
          throw new Error(confirmResult.error.message || 'Card authorization was declined. Please check your card details or use PayPal.')
        }

        if (!confirmResult.paymentIntent || confirmResult.paymentIntent.status !== 'succeeded') {
          throw new Error(`Payment could not be completed. Status: ${confirmResult.paymentIntent?.status || 'unconfirmed'}`)
        }

        await paymentApi.confirmStripePayment(confirmResult.paymentIntent.id).catch(() => { })

        await finalizeSettledOrder('STRIPE', confirmResult.paymentIntent.id, 'Credit / Debit Card (Stripe)')
        return
      }
    } catch (error: any) {
      console.error('Payment checkout error:', error)
      setErrorMessage(error.message || 'Payment processing was unsuccessful. Please verify your details and try again.')
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    } finally {
      setIsProcessing(false)
    }
  }

  const inputClasses =
    'w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-creamy-500 transition-colors text-xs font-medium'

  const stripeElementOptions = {
    style: {
      base: {
        fontSize: '14px',
        color: isDarkMode ? '#f3f4f6' : '#111827',
        '::placeholder': {
          color: '#9ca3af',
        },
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      invalid: {
        color: '#ef4444',
        iconColor: '#ef4444',
      },
    },
  }

  if (items.length === 0) {
    return (
      <div className="pt-28 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-creamy-50 dark:bg-creamy-500/10 text-creamy-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-creamy-500/20">
            <Truck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black uppercase text-gray-900 dark:text-white mb-2 font-anton">
            Your Cart is Empty
          </h2>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mb-6 font-medium">
            Select a MiniHelicopter, Electric Microcar, Drift Trike, Go Kart, or Dirt Bike from our fleet to proceed to checkout.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full inline-flex items-center justify-center gap-2 bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider py-3.5 px-6 rounded-xl transition-all text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse Fleet Catalog
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-24 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/cart')}
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Cart
        </button>

        <div className="mb-8">
          <span className="text-[10px] font-black uppercase tracking-widest text-creamy-500 bg-creamy-500/10 px-2.5 py-1 rounded-full border border-creamy-500/20">
            DriveFlyElectric Official Checkout
          </span>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-gray-900 dark:text-white mt-2 font-anton">
            Express Order Finalization
          </h1>
        </div>

        {errorMessage && (
          <div
            ref={errorRef}
            className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="font-semibold text-xs">{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 text-xs font-bold">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Shipping & Payment Options */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Delivery Destination */}
            <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6 transition-colors">
              <div className="flex items-center justify-between mb-5 border-b border-gray-100 dark:border-neutral-800 pb-3">
                <h2 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                  <Truck className="w-5 h-5 text-creamy-500" />
                  1. Delivery Destination (Please Ensure accurate delivery details for shipping)
                </h2>
                <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">* Required</span>
              </div>

              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                    <input
                      type="text"
                      name="firstName"
                      placeholder="John"
                      value={shippingData.firstName}
                      onChange={handleInputChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                    <input
                      type="text"
                      name="lastName"
                      placeholder="Doe"
                      value={shippingData.lastName}
                      onChange={handleInputChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Email Address (for PDF Receipt) *</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="john@example.com"
                      value={shippingData.email}
                      onChange={handleInputChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Contact Phone *</label>
                    <input
                      type="tel"
                      name="phone"
                      placeholder="+1 (512) 000-0000"
                      value={shippingData.phone}
                      onChange={handleInputChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Street Address *</label>
                  <input
                    type="text"
                    name="address1"
                    placeholder="1000 DriveFly Electric Way, Suite 400"
                    value={shippingData.address1}
                    onChange={handleInputChange}
                    className={inputClasses}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Apartment, Suite, Unit (Optional)</label>
                  <input
                    type="text"
                    name="address2"
                    placeholder="Apt 4B"
                    value={shippingData.address2}
                    onChange={handleInputChange}
                    className={inputClasses}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">City *</label>
                    <input
                      type="text"
                      name="city"
                      placeholder="Austin"
                      value={shippingData.city}
                      onChange={handleInputChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">State / Province / Region</label>
                    <input
                      type="text"
                      name="state"
                      placeholder="TX / Province / Region"
                      value={shippingData.state}
                      onChange={handleInputChange}
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Postal / ZIP Code *</label>
                    <input
                      type="text"
                      name="zipCode"
                      placeholder="78701"
                      value={shippingData.zipCode}
                      onChange={handleInputChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-creamy-500" />
                      <span>Country / Destination *</span>
                      <span className="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400">
                        ISO: {resolveClientCountryIso2(shippingData.country)}
                      </span>
                    </label>
                    <div className="relative sm:w-56">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        placeholder="Filter all countries..."
                        aria-label="Filter countries"
                        className="w-full pl-8 pr-2.5 py-1 bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-lg text-[11px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-creamy-500"
                      />
                    </div>
                  </div>
                  {(() => {
                    const normalizedQuery = countrySearch.trim().toLowerCase()
                    const popularCountries = POPULAR_COUNTRY_CODES
                      .map((code) => COUNTRIES.find((c) => c.code === code))
                      .filter((c): c is NonNullable<typeof c> => Boolean(c))
                    const filteredCountries = normalizedQuery
                      ? COUNTRIES.filter(
                        (c) =>
                          c.name.toLowerCase().includes(normalizedQuery) ||
                          c.code.toLowerCase() === normalizedQuery
                      )
                      : COUNTRIES
                    const hasSelectedInFiltered = filteredCountries.some(
                      (c) => c.name === shippingData.country
                    )

                    return (
                      <select
                        name="country"
                        value={shippingData.country}
                        onChange={handleInputChange}
                        className={inputClasses}
                        required
                      >
                        {!normalizedQuery ? (
                          <>
                            <optgroup label="Popular Destinations">
                              {popularCountries.map((country) => (
                                <option key={`pop-${country.code}`} value={country.name}>
                                  {country.name} ({country.code})
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={`All Countries & Territories (${COUNTRIES.length})`}>
                              {COUNTRIES.map((country) => (
                                <option key={country.code} value={country.name}>
                                  {country.name} ({country.code})
                                </option>
                              ))}
                            </optgroup>
                          </>
                        ) : (
                          <>
                            {!hasSelectedInFiltered && shippingData.country && (
                              <option value={shippingData.country}>{shippingData.country}</option>
                            )}
                            {filteredCountries.length > 0 ? (
                              filteredCountries.map((country) => (
                                <option key={country.code} value={country.name}>
                                  {country.name} ({country.code})
                                </option>
                              ))
                            ) : (
                              <option value={shippingData.country} disabled>
                                No matching country found — clear filter to view all
                              </option>
                            )}
                          </>
                        )}
                      </select>
                    )
                  })()}
                </div>

                {/* Inline Account Creation for Guest / New Shoppers */}
                {!isAuthenticated && (
                  <div className="pt-3 border-t border-gray-100 dark:border-neutral-800">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={createAccount}
                        onChange={(e) => setCreateAccount(e.target.checked)}
                        className="w-4 h-4 rounded text-creamy-500 focus:ring-creamy-400 accent-creamy-500 bg-gray-100 dark:bg-neutral-800 border-gray-300 dark:border-neutral-700"
                      />
                      <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                        Create a DriveFlyElectric account with this order <span className="text-creamy-500 font-semibold">(save address & track deliveries)</span>
                      </span>
                    </label>

                    {createAccount && (
                      <div className="mt-3 p-3.5 bg-gray-50 dark:bg-[#1a1d24] rounded-xl border border-gray-200 dark:border-neutral-800 space-y-2">
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                          Create Account Password *
                        </label>
                        <input
                          type="password"
                          placeholder="Choose password (at least 8 characters)"
                          value={accountPassword}
                          onChange={(e) => setAccountPassword(e.target.value)}
                          className={inputClasses}
                        />
                        <p className="text-[10px] text-gray-400">
                          Account will be registered to <span className="font-mono text-creamy-500">{shippingData.email || 'your email'}</span> automatically upon placing your order.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>

            {/* 2. Payment Method — PayPal Primary (Integrated Card Fields + Wallet) & Stripe Secondary Card */}
            <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6 transition-colors">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 dark:border-neutral-800 pb-3">
                <h2 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-creamy-500" />
                  2. Payment Method
                </h2>
                <span className="text-[10px] uppercase font-bold text-creamy-500 bg-creamy-500/10 px-2 py-0.5 rounded">
                  USD ($) Encrypted
                </span>
              </div>

              <div className="space-y-4">
                {/* Option 1 (Primary): PayPal Checkout — Integrated Card Processing & Express Wallet */}
                <div
                  onClick={() => {
                    if (paymentMethod !== 'PAYPAL') {
                      setPaymentMethod('PAYPAL')
                      if (errorMessage) setErrorMessage(null)
                    }
                  }}
                  className={`p-4 border rounded-xl transition-all cursor-pointer ${paymentMethod === 'PAYPAL'
                    ? 'border-creamy-500 bg-creamy-50/30 dark:bg-creamy-500/5 shadow-sm'
                    : 'border-gray-300 dark:border-neutral-700 bg-gray-50/50 dark:bg-[#1a1d24]'
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="PAYPAL"
                        checked={paymentMethod === 'PAYPAL'}
                        onChange={() => {
                          setPaymentMethod('PAYPAL')
                          if (errorMessage) setErrorMessage(null)
                        }}
                        className="w-4 h-4 text-creamy-500 focus:ring-creamy-400 accent-creamy-500"
                      />
                      <div className="w-6 h-6 rounded bg-[#003087] flex items-center justify-center font-black text-white text-xs shrink-0">
                        P
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-gray-900 dark:text-white">
                            PayPal &amp; Debit or Credit Card
                          </p>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                          Supports PayPal Wallet &amp; Debit or Credit Card (no PayPal account needed)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Keep PayPal iframe container permanently mounted in the DOM and toggle via CSS */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={
                      paymentMethod === 'PAYPAL'
                        ? 'mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800 space-y-4 cursor-default'
                        : 'hidden'
                    }
                  >
                    <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-[#14171f] border border-gray-200 dark:border-neutral-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-creamy-500" />
                          PayPal Expanded Checkout
                        </span>
                        <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          256-Bit SSL
                        </span>
                      </div>

                      {paypalSdkStatus === 'loading' && (
                        <div className="space-y-2.5 animate-pulse py-1">
                          <div className="h-11 rounded-lg bg-gray-200 dark:bg-neutral-800" />
                          <div className="h-11 rounded-lg bg-gray-200 dark:bg-neutral-800" />
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Initializing PayPal Wallet &amp; Hosted Card Fields...
                          </p>
                        </div>
                      )}

                      <div className={paypalSdkStatus === 'ready' ? 'space-y-3.5' : 'hidden'}>
                        {/* 1. Pay with PayPal Express Button */}
                        <div ref={paypalButtonsContainerRef} className="min-h-[48px]" />

                        {/* 2. Expanded Direct Hosted Card Fields (mounted in DOM when eligible) */}
                        <div className={paypalCardFieldsEligible ? 'space-y-3 pt-1' : 'hidden'}>
                          <div className="relative flex items-center py-1">
                            <div className="flex-grow border-t border-gray-200 dark:border-neutral-800" />
                            <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-neutral-500">
                              Or pay directly with Debit / Credit Card
                            </span>
                            <div className="flex-grow border-t border-gray-200 dark:border-neutral-800" />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                              Name on Card *
                            </label>
                            <div
                              ref={paypalCardNameRef}
                              className="min-h-[44px] w-full bg-white dark:bg-[#14171f] border border-gray-300 dark:border-neutral-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-creamy-500 transition-shadow"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                              Card Number *
                            </label>
                            <div
                              ref={paypalCardNumberRef}
                              className="min-h-[44px] w-full bg-white dark:bg-[#14171f] border border-gray-300 dark:border-neutral-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-creamy-500 transition-shadow"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3.5">
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                                Expiration Date (MM/YY) *
                              </label>
                              <div
                                ref={paypalCardExpiryRef}
                                className="min-h-[44px] w-full bg-white dark:bg-[#14171f] border border-gray-300 dark:border-neutral-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-creamy-500 transition-shadow"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                                Security Code (CVV) *
                              </label>
                              <div
                                ref={paypalCardCvvRef}
                                className="min-h-[44px] w-full bg-white dark:bg-[#14171f] border border-gray-300 dark:border-neutral-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-creamy-500 transition-shadow"
                              />
                            </div>
                          </div>

                          {paypalCardFieldError && (
                            <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[11px] flex items-center gap-2">
                              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              <span>{paypalCardFieldError}</span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={submitPayPalCardFields}
                            disabled={isProcessing}
                            className="w-full bg-gray-900 hover:bg-gray-800 dark:bg-creamy-500 dark:hover:bg-creamy-400 disabled:bg-gray-400 dark:disabled:bg-neutral-700 text-white dark:text-black font-black uppercase tracking-wider py-3 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                          >
                            {isProcessing ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                <span>{processingStep || 'Authorizing Card...'}</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Pay {formatPrice(grandTotal)} with Debit or Credit Card</span>
                              </>
                            )}
                          </button>
                        </div>

                        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-2 pt-1">
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>
                            Complete your shipping destination above for{' '}
                            <span className="font-semibold text-gray-700 dark:text-gray-200">{shippingData.country}</span>, then click{' '}
                            <strong>PayPal</strong>{' '}
                            {paypalCardFieldsEligible ? (
                              <>or enter your card details in the encrypted fields above and click <strong>Pay with Debit or Credit Card</strong>.</>
                            ) : (
                              <>or click <strong>Debit or Credit Card</strong> below it to pay securely without a PayPal account.</>
                            )}
                          </span>
                        </p>
                      </div>

                      {paypalSdkStatus === 'error' && (
                        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300">
                          PayPal embedded SDK is currently blocked or unavailable in your browser. You can still click{' '}
                          <strong>Continue &amp; Pay via PayPal</strong> on the right to complete payment securely at PayPal.com, or select <strong>Stripe Direct Card</strong> below.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Option 2 (Secondary): Direct Credit / Debit Card via Stripe Hosted Elements */}
                <div
                  onClick={() => {
                    if (paymentMethod !== 'STRIPE') {
                      setPaymentMethod('STRIPE')
                      if (errorMessage) setErrorMessage(null)
                    }
                  }}
                  className={`p-4 border rounded-xl transition-all cursor-pointer ${paymentMethod === 'STRIPE'
                    ? 'border-creamy-500 bg-creamy-50/30 dark:bg-creamy-500/5 shadow-sm'
                    : 'border-gray-300 dark:border-neutral-700 bg-gray-50/50 dark:bg-[#1a1d24]'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="STRIPE"
                        checked={paymentMethod === 'STRIPE'}
                        onChange={() => {
                          setPaymentMethod('STRIPE')
                          if (errorMessage) setErrorMessage(null)
                        }}
                        className="w-4 h-4 text-creamy-500 focus:ring-creamy-400 accent-creamy-500"
                      />
                      <CreditCard className="w-5 h-5 text-creamy-500" />
                      <div>
                        <p className="font-bold text-sm text-gray-900 dark:text-white">
                          Credit or Debit Card (Stripe Gateway)
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                          Alternative card checkout — Visa, Mastercard, Amex, Discover with 3D-Secure
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      <Lock className="w-3 h-3" />
                      <span>256-Bit SSL</span>
                    </div>
                  </div>

                  {paymentMethod === 'STRIPE' && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800 space-y-3.5 cursor-default"
                    >
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Name on Card *
                        </label>
                        <input
                          type="text"
                          placeholder="JOHN DOE"
                          value={cardholderName}
                          onChange={(e) => setCardholderName(e.target.value)}
                          className={inputClasses}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Card Number *
                        </label>
                        <div className="px-4 py-3 bg-white dark:bg-[#14171f] border border-gray-300 dark:border-neutral-700 rounded-xl focus-within:ring-2 focus-within:ring-creamy-500">
                          <CardNumberElement options={{ ...stripeElementOptions, showIcon: true }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                            Expiration Date (MM/YY) *
                          </label>
                          <div className="px-4 py-3 bg-white dark:bg-[#14171f] border border-gray-300 dark:border-neutral-700 rounded-xl focus-within:ring-2 focus-within:ring-creamy-500">
                            <CardExpiryElement options={stripeElementOptions} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                            Security Code (CVC/CVV) *
                          </label>
                          <div className="px-4 py-3 bg-white dark:bg-[#14171f] border border-gray-300 dark:border-neutral-700 rounded-xl focus-within:ring-2 focus-within:ring-creamy-500">
                            <CardCvcElement options={stripeElementOptions} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6 sticky top-24 transition-colors">
              <h2 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white mb-4 pb-3 border-b border-gray-100 dark:border-neutral-800 font-anton">
                Order Review ({items.length} {items.length === 1 ? 'rig' : 'rigs'})
              </h2>

              <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1f222a] transition-colors">
                    <div className="w-14 h-14 bg-gray-100 dark:bg-neutral-800 rounded-xl overflow-hidden flex-shrink-0 border border-gray-200 dark:border-neutral-700">
                      {item.product.images && item.product.images.length > 0 ? (
                        isVideoMedia(item.product.images[0]) ? (
                          <video
                            src={getSafeMediaUrl(item.product.images[0])}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={getSafeMediaUrl(item.product.images[0])}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              if (!target.src.endsWith('/images/hero1.jpeg')) {
                                target.src = '/images/hero1.jpeg'
                              }
                            }}
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                          Rig
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-xs text-gray-900 dark:text-white truncate">
                        {item.product.name}
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-neutral-400 font-medium">
                        Qty: {item.quantity} × {formatPrice(item.product.price)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-xs text-gray-900 dark:text-creamy-400">
                        {formatPrice(item.quantity * item.product.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-gray-200 dark:border-neutral-800 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600 dark:text-neutral-400 font-medium">
                  <span>Subtotal</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatPrice(totalPrice)}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-neutral-400 font-medium">
                  <span>Express Crate Shipping</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    FREE ($0.00)
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-neutral-400 font-medium">
                  <span>Estimated Tax (5%)</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatPrice(estimatedTax)}</span>
                </div>
                <div className="pt-3 border-t border-gray-200 dark:border-neutral-800 flex justify-between items-baseline">
                  <span className="text-sm font-black uppercase text-gray-900 dark:text-white">Total USD</span>
                  <span className="text-2xl font-black text-creamy-500 font-anton">
                    {formatPrice(grandTotal)}
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="mt-4 p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="font-medium text-[11px] leading-snug">{errorMessage}</span>
                </div>
              )}

              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="w-full mt-6 bg-creamy-500 hover:bg-creamy-400 disabled:bg-gray-400 dark:disabled:bg-neutral-700 text-black font-black uppercase tracking-wider py-4 px-4 rounded-xl shadow-lg shadow-creamy-500/20 disabled:cursor-not-allowed transition-all text-xs flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>{processingStep || 'Authorizing Checkout...'}</span>
                  </>
                ) : (
                  <span>
                    {paymentMethod === 'PAYPAL'
                      ? `Continue & Pay ${formatPrice(grandTotal)} via PayPal`
                      : `Confirm & Pay ${formatPrice(grandTotal)} with Card (Stripe)`}
                  </span>
                )}
              </button>

              <div className="mt-4 p-3 bg-gray-50 dark:bg-[#1a1d24] rounded-xl border border-gray-200 dark:border-neutral-800 text-[10px] text-gray-500 dark:text-gray-400 space-y-1">
                <p className="font-bold text-gray-700 dark:text-gray-300">DriveFlyElectric Express Dispatch</p>
                <p>Austin, TX HQ • Worldwide Express Crate Delivery</p>
                <p>Orders include an official PDF Purchase Receipt & 12-month factory warranty.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const CheckoutPage = () => {
  const [stripeKey, setStripeKey] = useState<string>(() =>
    String(defaultStripePublishableKey || '').trim()
  )
  const stripePromise = useMemo(() => getOrLoadStripePromise(stripeKey), [stripeKey])

  useEffect(() => {
    let active = true
    paymentApi
      .getConfig()
      .then((res) => {
        if (!active || !res.success || !res.data?.stripePublishableKey) return
        const liveKey = res.data.stripePublishableKey.trim()
        if (liveKey) {
          setStripeKey((prev) => (liveKey !== prev ? liveKey : prev))
        }
      })
      .catch(() => { })
    return () => {
      active = false
    }
  }, [])

  return (
    <Elements key={stripeKey} stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  )
}

export default CheckoutPage
