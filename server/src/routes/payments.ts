import express from 'express'
import Stripe from 'stripe'
import dotenv from 'dotenv'

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
// 1. STRIPE PAYMENT INTEGRATION (USD)
// ==========================================

// Create Payment Intent for Stripe Elements & Card Checkout
router.post('/stripe/create-intent', async (req, res) => {
  try {
    const { amount } = req.body

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
      description: 'DriveFlyElectric - E-Commerce Purchase',
      metadata: {
        company: 'DriveFlyElectric',
        head_office: 'Austin, Texas, USA'
      }
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

    res.status(200).json({
      success: true,
      data: {
        status: paymentIntent.status,
        paymentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
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

// Create PayPal Order
router.post('/paypal/create-order', async (req, res) => {
  try {
    const { amount } = req.body

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

// Capture PayPal Order
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

    res.status(200).json({
      success: true,
      data: {
        status: captureData.status || 'COMPLETED',
        paymentId: captureData.id,
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