import express from 'express'
import Stripe from 'stripe'
import dotenv from 'dotenv'
import { emailService } from '../utils/emailService.js'

dotenv.config()

const router = express.Router()

// Initialize Stripe with live secret key from .env
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16' as any
})

// Helper to get PayPal Access Token (auto-adapting between live and sandbox)
async function getPayPalAccessToken(): Promise<{ token: string; baseUrl: string }> {
  const clientId = process.env.PAYPAL_CLIENT_ID || ''
  const secret = process.env.PAYPAL_CLIENT_SECRET || ''

  if (!clientId || !secret) {
    throw new Error('PayPal Client ID or Secret is missing in environment variables.')
  }

  const preferredMode = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox'
  const primaryBase = preferredMode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
  const fallbackBase = preferredMode === 'live' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'

  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64')

  try {
    const res = await fetch(`${primaryBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    })
    const data = await res.json()
    if (res.ok && data.access_token) {
      return { token: data.access_token, baseUrl: primaryBase }
    }
  } catch (e) {
    console.warn('Primary PayPal endpoint failed, attempting fallback endpoint...')
  }

  // Fallback endpoint in case credentials correspond to sandbox mode
  const resFallback = await fetch(`${fallbackBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })
  const dataFallback = await resFallback.json()
  if (resFallback.ok && dataFallback.access_token) {
    return { token: dataFallback.access_token, baseUrl: fallbackBase }
  }

  throw new Error(`Failed to authenticate with PayPal: ${dataFallback.error_description || dataFallback.error || 'Unknown error'}`)
}

// ==========================================
// 0. PAYMENT GATEWAY RUNTIME CONFIGURATION
// ==========================================

// Returns public client keys and PayPal Client Token for JS SDK Buttons & Hosted Card Fields
router.get('/config', async (_req, res) => {
  const stripePublishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    'pk_live_51U1OVJAZusdAC7Xt4oUvFKuo36Qv6bYLXClwuWTzykMfDGJm29pZJPTSU98hS4R13id0KB0BFRp8sjHTcCClExjh00TOV3ZXSq'
  const paypalClientId =
    process.env.PAYPAL_CLIENT_ID ||
    process.env.VITE_PAYPAL_CLIENT_ID ||
    'AeZPJVk6Zp1zLPnNtCcOdXvQFQi-iLkWnSdbB7c0vYwyOpQMG845TpUz6MZSJd-TXLfHgFfiBrLEWxpt'
  const paypalMerchantId =
    process.env.PAYPAL_MERCHANT_ID ||
    process.env.VITE_PAYPAL_MERCHANT_ID ||
    'N7YM95SPUR8P8'
  const paypalMode = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox'

  let paypalClientToken: string | null = null
  try {
    const { token, baseUrl } = await getPayPalAccessToken()
    const tokenRes = await fetch(`${baseUrl}/v1/identity/generate-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Language': 'en_US',
        'Content-Type': 'application/json'
      }
    })
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json()
      paypalClientToken = tokenData.client_token || null
    }
  } catch {
    // Non-fatal: PayPal Smart Buttons work with clientId alone; clientToken enhances Hosted Card Fields
  }

  res.status(200).json({
    success: true,
    data: {
      stripePublishableKey,
      paypalClientId,
      paypalMerchantId,
      paypalMode,
      paypalClientToken
    }
  })
})

// ==========================================
// 1. STRIPE PAYMENT INTEGRATION (USD)
// ==========================================

// Create Payment Intent for Stripe Elements & Card Checkout
router.post('/stripe/create-intent', async (req, res) => {
  try {
    const { amount, customerEmail } = req.body

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid USD amount is required'
      })
    }

    const amountInCents = Math.round(Number(amount) * 100)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true
      },
      receipt_email: customerEmail || undefined,
      description: 'DriveFlyElectric - E-Commerce Purchase',
      metadata: {
        company: 'DriveFlyElectric',
        head_office: 'Austin, Texas, USA'
      }
    })

    emailService.recordActivity({
      type: 'PAYMENT_AUTHORIZED',
      title: `Stripe Card Intent Initialized • $${Number(amount).toFixed(2)} USD`,
      message: `Stripe PaymentIntent (${paymentIntent.id}) created for $${Number(amount).toFixed(2)} USD.`,
      userEmail: customerEmail || undefined,
      amount: Number(amount),
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      }
    })
  } catch (error: any) {
    console.error('Stripe create-intent error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Stripe payment intent'
    })
  }
})

// Confirm / Check status of Stripe payment
router.post('/stripe/confirm', async (req, res) => {
  try {
    const { paymentIntentId } = req.body

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID is required'
      })
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    const usdAmount = paymentIntent.amount / 100

    if (paymentIntent.status === 'succeeded') {
      emailService.recordActivity({
        type: 'PAYMENT_CAPTURED',
        title: `Stripe Card Payment Settled • $${usdAmount.toFixed(2)} USD`,
        message: `Stripe PaymentIntent (${paymentIntent.id}) verified as SUCCEEDED for $${usdAmount.toFixed(2)} USD.`,
        amount: usdAmount,
        emailDispatched: false,
        systemMailDispatched: false
      })
    }

    res.status(200).json({
      success: true,
      data: {
        status: paymentIntent.status,
        paymentId: paymentIntent.id,
        amount: usdAmount,
        currency: paymentIntent.currency
      }
    })
  } catch (error: any) {
    console.error('Stripe confirm error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to confirm Stripe payment'
    })
  }
})

// ==========================================
// 2. PAYPAL PAYMENT INTEGRATION (USD)
// ==========================================

// Create PayPal Order (Supports PayPal JS SDK Buttons, Hosted Card Fields & Redirect)
router.post('/paypal/create-order', async (req, res) => {
  try {
    const { amount, customerEmail } = req.body

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid USD amount is required'
      })
    }

    const { token, baseUrl } = await getPayPalAccessToken()
    const formattedAmount = Number(amount).toFixed(2)

    const origin = (req.headers.origin as string) || (req.headers.referer as string) || 'https://driveflyelectric.shop'
    const cleanOrigin = origin.replace(/\/+$/, '')

    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: `DFE-${Date.now()}`,
            description: 'DriveFlyElectric Order',
            amount: {
              currency_code: 'USD',
              value: formattedAmount
            }
          }
        ],
        application_context: {
          brand_name: 'DriveFlyElectric',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: `${cleanOrigin}/order-success`,
          cancel_url: `${cleanOrigin}/checkout`
        }
      })
    })

    const orderData = await orderRes.json()

    if (!orderRes.ok) {
      throw new Error(orderData.message || 'Failed to create PayPal order')
    }

    const approveLink = orderData.links?.find((l: any) => l.rel === 'approve')?.href || ''

    emailService.recordActivity({
      type: 'PAYMENT_AUTHORIZED',
      title: `PayPal Order Initialized • $${formattedAmount} USD`,
      message: `PayPal Order (${orderData.id}) created for $${formattedAmount} USD.`,
      userEmail: customerEmail || undefined,
      amount: Number(amount),
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      data: {
        orderId: orderData.id,
        approveUrl: approveLink,
        status: orderData.status
      }
    })
  } catch (error: any) {
    console.error('PayPal create-order error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create PayPal order'
    })
  }
})

// Capture PayPal Order (Called by PayPal JS SDK onApprove / CardFields or Return Redirect)
router.post('/paypal/capture', async (req, res) => {
  try {
    const { orderId } = req.body

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      })
    }

    const { token, baseUrl } = await getPayPalAccessToken()

    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    const captureData = await captureRes.json()

    if (!captureRes.ok) {
      throw new Error(captureData.message || 'Failed to capture PayPal payment')
    }

    const captureUnit = captureData.purchase_units?.[0]?.payments?.captures?.[0]
    const captureId = captureUnit?.id || captureData.id || orderId
    const capturedValue = Number(captureUnit?.amount?.value || 0)
    const payerEmail = captureData.payer?.email_address

    emailService.recordActivity({
      type: 'PAYMENT_CAPTURED',
      title: `PayPal Payment Captured • ${capturedValue > 0 ? `$${capturedValue.toFixed(2)} USD` : captureId}`,
      message: `PayPal Order (${orderId} / Capture ${captureId}) settled by ${payerEmail || 'Customer'}.`,
      userEmail: payerEmail || undefined,
      amount: capturedValue || undefined,
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      data: {
        status: captureData.status || 'COMPLETED',
        paymentId: captureId,
        orderId: captureData.id || orderId,
        payer: captureData.payer
      }
    })
  } catch (error: any) {
    console.error('PayPal capture error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to capture PayPal payment'
    })
  }
})

export default router