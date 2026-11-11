import React, { useState, useRef, useEffect, useCallback } from 'react'
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
import { CreditCard, Truck, Lock, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { orderApi, paymentApi, addressApi } from '../services/api'

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

// Initialize Stripe with synced Live Publishable Key from .env
const defaultStripePublishableKey =
  (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
  'pk_live_51U1OVJAZusdAC7Xt4oUvFKuo36Qv6bYLXClwuWTzykMfDGJm29pZJPTSU98hS4R13id0KB0BFRp8sjHTcCClExjh00TOV3ZXSq'

const defaultPayPalClientId =
  (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ||
  'AeZPJVk6Zp1zLPnNtCcOdXvQFQi-iLkWnSdbB7c0vYwyOpQMG845TpUz6MZSJd-TXLfHgFfiBrLEWxpt'

const stripePromise = loadStripe(defaultStripePublishableKey)

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

  // Supported payment modes: Direct Card (Stripe Hosted Fields) or PayPal (Smart Button + PayPal Hosted Card Fields)
  const [paymentMethod, setPaymentMethod] = useState<'STRIPE' | 'PAYPAL'>('STRIPE')
  const [cardholderName, setCardholderName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  // PayPal JS SDK state
  const [paypalSdkReady, setPaypalSdkReady] = useState(false)
  const [paypalCardFieldsEligible, setPaypalCardFieldsEligible] = useState(false)
  const paypalButtonsContainerRef = useRef<HTMLDivElement>(null)
  const paypalCardFieldsInstanceRef = useRef<any>(null)

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
      }).catch(() => {})
    }
  }, [user, isAuthenticated])

  const validateShippingBeforeCheckout = useCallback((): boolean => {
    const { shippingData: sd, isAuthenticated: isAuth, createAccount: ca, accountPassword: pwd } = latestCheckoutRef.current
    if (!sd.firstName || !sd.lastName || !sd.email || !sd.address1 || !sd.city || !sd.zipCode) {
      setErrorMessage('Please fill in all required delivery destination fields (First Name, Last Name, Email, Street Address, City, ZIP Code) before completing payment.')
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return false
    }
    if (!isAuth && ca && (!pwd || pwd.length < 6)) {
      setErrorMessage('Please provide an account password with at least 6 characters.')
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return false
    }
    setErrorMessage(null)
    return true
  }, [])

  // Unified Order Settlement Handler (Used by Stripe Card Fields, PayPal Smart Buttons, and PayPal Hosted Card Fields)
  const finalizeSettledOrder = useCallback(async (
    settledMethod: 'STRIPE' | 'PAYPAL',
    paymentRecordId: string,
    paymentSourceLabel?: string
  ) => {
    const {
      shippingData: sd,
      createAccount: ca,
      accountPassword: pwd,
      items: currentItems,
      totalPrice: subTotal,
      grandTotal: finalTotal,
      estimatedTax: taxAmt
    } = latestCheckoutRef.current

    setIsProcessing(true)
    setProcessingStep('Securing your settled order & generating official PDF receipt...')

    const orderRes = await orderApi.createOrder({
      items: currentItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod: settledMethod,
      paymentId: paymentRecordId,
      paymentStatus: 'COMPLETED',
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
        country: sd.country
      },
      createAccount: ca,
      password: ca ? pwd : undefined,
      notes: `Nanshan, Shenzhen, Guangdong Province, China Warehouse Express Delivery to ${sd.city}, ${sd.state} (${sd.zipCode}). Paid & Settled via ${settledMethod} (${paymentRecordId})`
    } as any)

    if ((orderRes as any).token && (orderRes as any).user) {
      setAuthenticatedUser((orderRes as any).user, (orderRes as any).token)
    }

    const orderNumber = orderRes.data?.orderNumber || `DFE-${Math.floor(100000 + Math.random() * 900000)}`
    const trackingNumber =
      orderRes.data?.trackingNumber ||
      `TRK-DFE-${orderNumber.replace(/^DFE-?/i, '').slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`
    const formattedOrderDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    const fullAddressString = `${sd.address1}${sd.address2 ? `, ${sd.address2}` : ''}, ${sd.city}, ${sd.state} ${sd.zipCode}, ${sd.country}`

    const receiptData = {
      date: formattedOrderDate,
      orderDate: formattedOrderDate,
      orderNumber,
      trackingNumber,
      transactionId: paymentRecordId || `TXN-${Date.now()}`,
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
        destination: `${sd.city}, ${sd.state} ${sd.zipCode}, ${sd.country}`,
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
        orderNumber,
        trackingNumber,
        total: finalTotal,
        paymentMethod: settledMethod,
        shippingAddress: fullAddressString,
        receiptData
      }
    })
  }, [clearCart, navigate, setAuthenticatedUser])

  // Load PayPal JavaScript SDK (Smart Buttons + Expanded Checkout Hosted Card Fields)
  useEffect(() => {
    let isMounted = true

    const loadPayPalSdk = async () => {
      if ((window as any).paypal) {
        if (isMounted) setPaypalSdkReady(true)
        return
      }

      let clientId = defaultPayPalClientId
      let clientToken: string | null = null

      try {
        const cfgRes = await paymentApi.getConfig()
        if (cfgRes.success && cfgRes.data) {
          if (cfgRes.data.paypalClientId) clientId = cfgRes.data.paypalClientId
          if (cfgRes.data.paypalClientToken) clientToken = cfgRes.data.paypalClientToken
        }
      } catch {
        // Use fallback clientId
      }

      const existingScript = document.getElementById('dfe-paypal-js-sdk') as HTMLScriptElement | null
      if (existingScript) {
        existingScript.addEventListener('load', () => {
          if (isMounted) setPaypalSdkReady(true)
        })
        return
      }

      const script = document.createElement('script')
      script.id = 'dfe-paypal-js-sdk'
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons,card-fields&enable-funding=paylater,venmo`
      script.async = true
      if (clientToken) {
        script.setAttribute('data-client-token', clientToken)
      }
      script.onload = () => {
        if (isMounted) setPaypalSdkReady(true)
      }
      script.onerror = () => {
        console.warn('PayPal JS SDK script could not be loaded; fallback redirect remains active.')
      }
      document.body.appendChild(script)
    }

    loadPayPalSdk()
    return () => {
      isMounted = false
    }
  }, [])

  // Render PayPal Smart Buttons ("Pay with PayPal") & Expanded Checkout Hosted Card Fields when SDK is ready
  useEffect(() => {
    const paypal = (window as any).paypal
    if (!paypalSdkReady || !paypal || items.length === 0) return

    // 1. Render "Pay with PayPal" Smart Button
    if (paypal.Buttons && paypalButtonsContainerRef.current) {
      paypalButtonsContainerRef.current.innerHTML = ''
      try {
        const buttons = paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'silver',
            shape: 'rect',
            label: 'paypal',
            height: 44
          },
          onClick: (_data: any, actions: any) => {
            if (!validateShippingBeforeCheckout()) {
              return actions.reject()
            }
            return actions.resolve()
          },
          createOrder: async () => {
            const { grandTotal: totalToCharge, shippingData: sd } = latestCheckoutRef.current
            setProcessingStep('Creating PayPal USD order...')
            const res = await paymentApi.createPayPalOrder(totalToCharge, sd.email)
            if (!res.success || !res.data?.orderId) {
              throw new Error(res.error || 'Could not initialize PayPal order.')
            }
            return res.data.orderId
          },
          onApprove: async (data: any) => {
            try {
              setIsProcessing(true)
              setProcessingStep('Capturing PayPal payment...')
              const capRes = await paymentApi.capturePayPalPayment(data.orderID)
              if (!capRes.success) {
                throw new Error(capRes.error || 'Failed to capture PayPal order.')
              }
              const txId = capRes.data?.paymentId || data.orderID
              await finalizeSettledOrder('PAYPAL', txId, 'PayPal Express (JS SDK)')
            } catch (err: any) {
              setIsProcessing(false)
              setErrorMessage(err.message || 'PayPal payment capture failed.')
            }
          },
          onError: (err: any) => {
            console.warn('PayPal Buttons notice:', err)
          }
        })
        if (buttons.isEligible()) {
          buttons.render(paypalButtonsContainerRef.current).catch(() => {})
        }
      } catch (e) {
        console.warn('PayPal Buttons render notice:', e)
      }
    }

    // 2. Render PayPal Expanded Checkout Hosted Card Fields if eligible on merchant account
    if (paypal.CardFields) {
      try {
        const cardFields = paypal.CardFields({
          createOrder: async () => {
            if (!validateShippingBeforeCheckout()) {
              throw new Error('Missing required shipping address fields.')
            }
            const { grandTotal: totalToCharge, shippingData: sd } = latestCheckoutRef.current
            const res = await paymentApi.createPayPalOrder(totalToCharge, sd.email)
            if (!res.success || !res.data?.orderId) {
              throw new Error(res.error || 'Failed to create order for CardFields.')
            }
            return res.data.orderId
          },
          onApprove: async (data: any) => {
            try {
              setIsProcessing(true)
              setProcessingStep('Capturing card payment via PayPal Expanded Checkout...')
              const capRes = await paymentApi.capturePayPalPayment(data.orderID)
              if (!capRes.success) {
                throw new Error(capRes.error || 'Card capture failed.')
              }
              const txId = capRes.data?.paymentId || data.orderID
              await finalizeSettledOrder('PAYPAL', txId, 'Card via PayPal Expanded Checkout')
            } catch (err: any) {
              setIsProcessing(false)
              setErrorMessage(err.message || 'Card payment capture failed.')
            }
          },
          onError: (err: any) => {
            setIsProcessing(false)
            setErrorMessage(err?.message || 'Card authorization failed.')
          }
        })

        if (cardFields.isEligible()) {
          setPaypalCardFieldsEligible(true)
          paypalCardFieldsInstanceRef.current = cardFields
          const nameContainer = document.getElementById('paypal-card-name-container')
          const numberContainer = document.getElementById('paypal-card-number-container')
          const expiryContainer = document.getElementById('paypal-card-expiry-container')
          const cvvContainer = document.getElementById('paypal-card-cvv-container')
          if (nameContainer && numberContainer && expiryContainer && cvvContainer) {
            nameContainer.innerHTML = ''
            numberContainer.innerHTML = ''
            expiryContainer.innerHTML = ''
            cvvContainer.innerHTML = ''
            cardFields.NameField().render('#paypal-card-name-container').catch(() => {})
            cardFields.NumberField().render('#paypal-card-number-container').catch(() => {})
            cardFields.ExpiryField().render('#paypal-card-expiry-container').catch(() => {})
            cardFields.CVVField().render('#paypal-card-cvv-container').catch(() => {})
          }
        }
      } catch {
        setPaypalCardFieldsEligible(false)
      }
    }
  }, [paypalSdkReady, items.length, validateShippingBeforeCheckout, finalizeSettledOrder])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (errorMessage) setErrorMessage(null)
    setShippingData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // Primary Submit Handler supporting Direct Card (Stripe Hosted Fields), PayPal Hosted Card Fields, and PayPal Redirect Fallback
  const handlePayment = async () => {
    if (!validateShippingBeforeCheckout()) return

    setErrorMessage(null)
    setIsProcessing(true)

    try {
      if (paymentMethod === 'STRIPE') {
        if (!stripe || !elements) {
          throw new Error('Stripe Card Gateway is initializing. Please wait a moment and try again.')
        }

        const cardNumberElement = elements.getElement(CardNumberElement)
        if (!cardNumberElement) {
          throw new Error('Card input fields are not ready. Please refresh the page.')
        }

        setProcessingStep('Initializing secure USD card transaction with Stripe...')
        const intentRes = await paymentApi.createStripePaymentIntent(grandTotal, shippingData.email)
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
                state: shippingData.state,
                postal_code: shippingData.zipCode,
                country: 'US'
              }
            }
          }
        })

        if (confirmResult.error) {
          throw new Error(confirmResult.error.message || 'Card authorization was declined. Please check your card details or use PayPal below.')
        }

        if (!confirmResult.paymentIntent || confirmResult.paymentIntent.status !== 'succeeded') {
          throw new Error(`Payment could not be completed. Status: ${confirmResult.paymentIntent?.status || 'unconfirmed'}`)
        }

        // Confirm on backend to log real-time capture event
        await paymentApi.confirmStripePayment(confirmResult.paymentIntent.id).catch(() => {})

        await finalizeSettledOrder('STRIPE', confirmResult.paymentIntent.id, 'Credit / Debit Card (Stripe)')
        return
      }

      if (paymentMethod === 'PAYPAL') {
        // If PayPal Expanded Checkout Hosted Card Fields are mounted and user submitted via main button
        if (paypalCardFieldsEligible && paypalCardFieldsInstanceRef.current) {
          setProcessingStep('Submitting card via PayPal Expanded Checkout...')
          await paypalCardFieldsInstanceRef.current.submit({
            billingAddress: {
              addressLine1: shippingData.address1,
              addressLine2: shippingData.address2 || undefined,
              adminArea1: shippingData.state,
              adminArea2: shippingData.city,
              postalCode: shippingData.zipCode,
              countryCode: 'US'
            }
          })
          return
        }

        // Otherwise create PayPal order and redirect to PayPal approval URL (or capture directly)
        setProcessingStep('Connecting to PayPal Express Checkout...')
        const ppRes = await paymentApi.createPayPalOrder(grandTotal, shippingData.email)
        if (!ppRes.success || !ppRes.data?.orderId) {
          throw new Error(ppRes.error || 'Failed to connect to PayPal.')
        }

        const ppOrderId = ppRes.data.orderId
        const approveUrl = ppRes.data.approveUrl

        if (approveUrl) {
          const orderPayload = {
            items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
            paymentMethod: 'PAYPAL',
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
              country: shippingData.country
            },
            createAccount,
            password: createAccount ? accountPassword : undefined,
            notes: `Nanshan, Shenzhen, Guangdong Province, China Warehouse Express Delivery to ${shippingData.city}, ${shippingData.state} (${shippingData.zipCode}). Paid & Settled via PAYPAL (${ppOrderId})`
          }

          localStorage.setItem('pending_paypal_order', JSON.stringify({
            ppOrderId,
            grandTotal,
            subtotal: totalPrice,
            shippingCost,
            tax: estimatedTax,
            shippingData,
            createAccount,
            accountPassword,
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
        await finalizeSettledOrder('PAYPAL', captureRes.data?.paymentId || ppOrderId, 'PayPal Express')
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
        color: '#f3f4f6',
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
                  1. Delivery Destination (USA & Global)
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
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">State / Region *</label>
                    <input
                      type="text"
                      name="state"
                      placeholder="TX"
                      value={shippingData.state}
                      onChange={handleInputChange}
                      className={inputClasses}
                      required
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
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Country *</label>
                  <select
                    name="country"
                    value={shippingData.country}
                    onChange={handleInputChange}
                    className={inputClasses}
                  >
                    <option value="United States">United States</option>
                    <option value="Canada">Canada</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Australia">Australia</option>
                    <option value="Germany">Germany</option>
                    <option value="Other">Other International Destination</option>
                  </select>
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
                          placeholder="Choose password (at least 6 characters)"
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

            {/* 2. Payment Method — Direct Card Input Fields Alongside PayPal JS SDK ("Pay with PayPal" + Expanded Card Fields) */}
            <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6 transition-colors">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 dark:border-neutral-800 pb-3">
                <h2 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-creamy-500" />
                  2. Payment Method (Card or PayPal)
                </h2>
                <span className="text-[10px] uppercase font-bold text-creamy-500 bg-creamy-500/10 px-2 py-0.5 rounded">
                  USD ($) Encrypted
                </span>
              </div>

              {/* Express "Pay with PayPal" Smart Button Rendered Directly Above / Alongside Card Fields */}
              <div className="mb-5 p-4 rounded-xl bg-gray-50 dark:bg-[#1a1d24] border border-gray-200 dark:border-neutral-800">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-[#003087] flex items-center justify-center font-black text-white text-[11px]">
                      P
                    </div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-900 dark:text-white">
                      Express Pay with PayPal / Pay Later
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    PayPal Buyer Protection
                  </span>
                </div>

                {/* Official PayPal JavaScript SDK Buttons Container */}
                <div ref={paypalButtonsContainerRef} className="min-h-[46px]" />

                {!paypalSdkReady && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('PAYPAL')
                      handlePayment()
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-creamy-500 hover:bg-creamy-400 text-black font-black text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <span>Pay with PayPal ({formatPrice(grandTotal)})</span>
                  </button>
                )}
              </div>

              <div className="relative flex py-1 items-center mb-5">
                <div className="flex-grow border-t border-gray-200 dark:border-neutral-800" />
                <span className="flex-shrink mx-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Or Pay Directly With Credit / Debit Card
                </span>
                <div className="flex-grow border-t border-gray-200 dark:border-neutral-800" />
              </div>

              <div className="space-y-4">
                {/* Option 1: Direct Credit / Debit Card Input Fields (Hosted Card Fields) */}
                <div
                  onClick={() => {
                    if (paymentMethod !== 'STRIPE') setPaymentMethod('STRIPE')
                  }}
                  className={`p-4 border rounded-xl transition-all cursor-pointer ${
                    paymentMethod === 'STRIPE'
                      ? 'border-creamy-500 bg-creamy-50/30 dark:bg-creamy-500/5 shadow-sm'
                      : 'border-gray-300 dark:border-neutral-700 bg-gray-50/50 dark:bg-[#1a1d24]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
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
                          Credit or Debit Card (Direct Hosted Card Fields)
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                          Visa, Mastercard, American Express, Discover — Instant 3D-Secure Authorization
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      <Lock className="w-3 h-3" />
                      <span>256-Bit SSL</span>
                    </div>
                  </div>

                  {paymentMethod === 'STRIPE' && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800 space-y-3.5">
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

                {/* Option 2: PayPal Expanded Checkout / Portal Option */}
                <div
                  onClick={() => {
                    if (paymentMethod !== 'PAYPAL') setPaymentMethod('PAYPAL')
                  }}
                  className={`p-4 border rounded-xl transition-all cursor-pointer ${
                    paymentMethod === 'PAYPAL'
                      ? 'border-creamy-500 bg-creamy-50/30 dark:bg-creamy-500/5 shadow-sm'
                      : 'border-gray-300 dark:border-neutral-700 bg-gray-50/50 dark:bg-[#1a1d24]'
                  }`}
                >
                  <div className="flex items-center justify-between">
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
                      <div className="w-6 h-6 rounded bg-[#003087] flex items-center justify-center font-black text-white text-xs">
                        P
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-900 dark:text-white">
                          PayPal Expanded Checkout {paypalCardFieldsEligible ? '& Hosted Card Fields' : '& Wallet'}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                          Pay with PayPal Balance, Pay Later, Venmo, or PayPal Hosted Card Processing
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-creamy-100 dark:bg-creamy-900/40 text-creamy-700 dark:text-creamy-300">
                      PayPal SDK
                    </span>
                  </div>

                  {paymentMethod === 'PAYPAL' && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800 space-y-3">
                      {paypalCardFieldsEligible ? (
                        <div className="space-y-3">
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold">
                            Enter your card in PayPal Hosted Card Fields below or click the PayPal button above:
                          </p>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Cardholder Name</label>
                            <div id="paypal-card-name-container" className="min-h-[42px] bg-white rounded-xl px-2 border border-gray-300" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Card Number</label>
                            <div id="paypal-card-number-container" className="min-h-[42px] bg-white rounded-xl px-2 border border-gray-300" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Expiration Date</label>
                              <div id="paypal-card-expiry-container" className="min-h-[42px] bg-white rounded-xl px-2 border border-gray-300" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">CVV</label>
                              <div id="paypal-card-cvv-container" className="min-h-[42px] bg-white rounded-xl px-2 border border-gray-300" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <span>
                            Use the interactive <strong>Pay with PayPal</strong> button above for instant in-page checkout, or click <strong>Confirm & Pay with PayPal</strong> on the right to complete via PayPal's portal.
                          </span>
                        </p>
                      )}
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
                    Confirm & Pay {formatPrice(grandTotal)} with {paymentMethod === 'STRIPE' ? 'Card' : 'PayPal'}
                  </span>
                )}
              </button>

              <div className="mt-4 p-3 bg-gray-50 dark:bg-[#1a1d24] rounded-xl border border-gray-200 dark:border-neutral-800 text-[10px] text-gray-500 dark:text-gray-400 space-y-1">
                <p className="font-bold text-gray-700 dark:text-gray-300">DriveFlyElectric Express Dispatch</p>
                <p>Nanshan, Shenzhen, Guangdong Province, China Warehouse • North America HQ: Austin, TX</p>
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
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  )
}

export default CheckoutPage
