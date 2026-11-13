import express, { Request } from 'express'
import { z } from 'zod'
import { optionalAuth } from '../middleware/auth.js'
import { createRateLimiter, resolveSafeRedirectOrigin } from '../middleware/security.js'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'
import {
  computeAuthoritativeOrderPricing,
  getPayPalAccessToken,
  getPayPalMode,
  getStripeClient,
  resolveCountryIso2
} from '../utils/paymentVerification.js'

const router = express.Router()

const paymentInitRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: 'payment-init',
  message: 'Too many payment initialization requests. Please wait a moment and try again.'
})

const paymentItemSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  quantity: z.coerce.number().int().min(1).max(50)
})

const shippingInputSchema = z
  .object({
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    address1: z.string().trim().max(255).optional(),
    address2: z.string().trim().max(255).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
    zipCode: z.string().trim().max(30).optional(),
    country: z.string().trim().max(120).optional(),
    countryCode: z.string().trim().max(5).optional()
  })
  .optional()

const createPaymentRequestSchema = z.object({
  items: z.array(paymentItemSchema).optional(),
  customerEmail: z.string().trim().email().max(254).optional().or(z.literal('')),
  shippingAddress: shippingInputSchema
})

async function resolveItemsForPricing(req: Request, requestedItems?: Array<{ productId: string; quantity: number }>) {
  if (Array.isArray(requestedItems) && requestedItems.length > 0) {
    return requestedItems
  }
  if (req.user?.id) {
    const cart = await databaseService.findOrCreateCart(req.user.id)
    if (cart.items?.length) {
      return cart.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity
      }))
    }
  }
  return []
}

// ==========================================
// 0. PAYMENT GATEWAY RUNTIME CONFIGURATION
// ==========================================

// Returns public client keys and PayPal Client Token for JS SDK Buttons & Card Fields
router.get('/config', async (_req, res) => {
  const stripePublishableKey = (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    ''
  ).trim()
  const paypalClientId = (
    process.env.PAYPAL_CLIENT_ID ||
    process.env.VITE_PAYPAL_CLIENT_ID ||
    ''
  ).trim()
  const paypalMerchantId = (
    process.env.PAYPAL_MERCHANT_ID ||
    process.env.VITE_PAYPAL_MERCHANT_ID ||
    ''
  ).trim()
  const paypalMode = getPayPalMode()

  let paypalClientToken: string | null = null
  if (paypalClientId) {
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
        const tokenData: any = await tokenRes.json()
        paypalClientToken = tokenData.client_token || null
      }
    } catch {
      // Non-fatal: PayPal Smart Buttons and Card Fields work with clientId alone
    }
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

// Create Payment Intent with authoritative server-computed USD total
router.post('/stripe/create-intent', paymentInitRateLimit, optionalAuth, async (req, res) => {
  try {
    const parsed = createPaymentRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid checkout items for payment initialization.'
      })
    }

    const items = await resolveItemsForPricing(req, parsed.data.items)
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Your checkout cart is empty. Please add an available vehicle first.'
      })
    }

    const pricing = await computeAuthoritativeOrderPricing(items)
    const amountInCents = Math.round(pricing.total * 100)
    const customerEmail = parsed.data.customerEmail || req.user?.email || undefined
    const ship = parsed.data.shippingAddress

    const stripe = getStripeClient()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true
      },
      receipt_email: customerEmail,
      description: 'DriveFlyElectric - Vehicle & Parts Order',
      ...(ship?.address1 && ship?.city && ship?.country
        ? {
            shipping: {
              name: `${ship.firstName || ''} ${ship.lastName || ''}`.trim() || 'Customer',
              address: {
                line1: ship.address1,
                line2: ship.address2 || undefined,
                city: ship.city,
                state: ship.state || undefined,
                postal_code: ship.zipCode || undefined,
                country: resolveCountryIso2(ship.country, ship.countryCode)
              }
            }
          }
        : {}),
      metadata: {
        company: 'DriveFlyElectric',
        subtotal_usd: pricing.subtotal.toFixed(2),
        tax_usd: pricing.tax.toFixed(2),
        total_usd: pricing.total.toFixed(2)
      }
    })

    emailService.recordActivity({
      type: 'PAYMENT_AUTHORIZED',
      title: `Stripe Card Intent Initialized • $${pricing.total.toFixed(2)} USD`,
      message: `Stripe PaymentIntent (${paymentIntent.id}) created for $${pricing.total.toFixed(2)} USD.`,
      userEmail: customerEmail,
      amount: pricing.total,
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: pricing.total
      }
    })
  } catch (error: any) {
    console.error('Stripe create-intent error:', error)
    const message =
      error?.message?.includes('Coming Soon') ||
      error?.message?.includes('Inventory') ||
      error?.message?.includes('Insufficient inventory') ||
      error?.message?.includes('available')
        ? error.message
        : 'Unable to initialize Stripe card payment. Please verify your cart and try again.'
    res.status(400).json({
      success: false,
      error: message
    })
  }
})

// Confirm / Check status of Stripe payment
router.post('/stripe/confirm', paymentInitRateLimit, async (req, res) => {
  try {
    const parsed = z
      .object({
        paymentIntentId: z.string().trim().min(5, 'Payment intent ID is required.').max(200)
      })
      .safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Payment intent ID is required.'
      })
    }

    const stripe = getStripeClient()
    const paymentIntent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId)
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
  } catch (error) {
    console.error('Stripe confirm error:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to confirm Stripe payment status.'
    })
  }
})

// ==========================================
// 2. PAYPAL PAYMENT INTEGRATION (USD)
// ==========================================

// Create PayPal Order with authoritative server-computed USD total
router.post('/paypal/create-order', paymentInitRateLimit, optionalAuth, async (req, res) => {
  try {
    const parsed = createPaymentRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid checkout items for PayPal order.'
      })
    }

    const items = await resolveItemsForPricing(req, parsed.data.items)
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Your checkout cart is empty. Please add an available vehicle first.'
      })
    }

    const pricing = await computeAuthoritativeOrderPricing(items)
    const { token, baseUrl } = await getPayPalAccessToken()
    const formattedTotal = pricing.total.toFixed(2)
    const cleanOrigin = resolveSafeRedirectOrigin(req)
    const customerEmail = parsed.data.customerEmail || req.user?.email || undefined
    const ship = parsed.data.shippingAddress
    const hasShippingAddress = Boolean(ship?.address1 && ship?.city && ship?.country)

    const orderPayload: any = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `DFE-${Date.now()}`,
          description: 'DriveFlyElectric Order',
          amount: {
            currency_code: 'USD',
            value: formattedTotal,
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: pricing.subtotal.toFixed(2)
              },
              tax_total: {
                currency_code: 'USD',
                value: pricing.tax.toFixed(2)
              },
              shipping: {
                currency_code: 'USD',
                value: pricing.shipping.toFixed(2)
              }
            }
          },
          ...(hasShippingAddress && ship
            ? {
                shipping: {
                  name: {
                    full_name: `${ship.firstName || ''} ${ship.lastName || ''}`.trim() || 'DriveFlyElectric Customer'
                  },
                  address: {
                    address_line_1: ship.address1,
                    ...(ship.address2 ? { address_line_2: ship.address2 } : {}),
                    admin_area_2: ship.city,
                    ...(ship.state ? { admin_area_1: ship.state } : {}),
                    ...(ship.zipCode ? { postal_code: ship.zipCode } : {}),
                    country_code: resolveCountryIso2(ship.country, ship.countryCode)
                  }
                }
              }
            : {})
        }
      ],
      application_context: {
        brand_name: 'DriveFlyElectric',
        shipping_preference: hasShippingAddress ? 'SET_PROVIDED_ADDRESS' : 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${cleanOrigin}/order-success`,
        cancel_url: `${cleanOrigin}/checkout`
      }
    }

    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    })

    const orderData: any = await orderRes.json()

    if (!orderRes.ok) {
      console.error('PayPal create-order API rejected:', orderData)
      return res.status(502).json({
        success: false,
        error: 'PayPal could not initialize this checkout session. Please verify your address and try again.'
      })
    }

    const approveLink = orderData.links?.find((l: any) => l.rel === 'approve')?.href || ''

    emailService.recordActivity({
      type: 'PAYMENT_AUTHORIZED',
      title: `PayPal Order Initialized • $${formattedTotal} USD`,
      message: `PayPal Order (${orderData.id}) created for $${formattedTotal} USD.`,
      userEmail: customerEmail,
      amount: pricing.total,
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      data: {
        orderId: orderData.id,
        approveUrl: approveLink,
        status: orderData.status,
        amount: pricing.total
      }
    })
  } catch (error: any) {
    console.error('PayPal create-order error:', error)
    const message =
      error?.message?.includes('Coming Soon') ||
      error?.message?.includes('Insufficient inventory') ||
      error?.message?.includes('available')
        ? error.message
        : 'Unable to initialize PayPal checkout. Please try again.'
    res.status(400).json({
      success: false,
      error: message
    })
  }
})

// Capture PayPal Order (Called by PayPal JS SDK onApprove / CardFields or Return Redirect)
router.post('/paypal/capture', paymentInitRateLimit, async (req, res) => {
  try {
    const parsed = z
      .object({
        orderId: z.string().trim().min(3, 'PayPal Order ID is required.').max(120)
      })
      .safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'PayPal Order ID is required.'
      })
    }

    const { orderId } = parsed.data
    const { token, baseUrl } = await getPayPalAccessToken()

    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    const captureData: any = await captureRes.json()

    if (!captureRes.ok) {
      console.error('PayPal capture API rejected:', captureData)
      return res.status(400).json({
        success: false,
        error: captureData?.details?.[0]?.description || 'Payment authorization was declined or could not be captured.'
      })
    }

    const captureUnit = captureData.purchase_units?.[0]?.payments?.captures?.[0]
    const captureId = captureUnit?.id || captureData.id || orderId
    const capturedValue = Number(captureUnit?.amount?.value || 0)
    const currency = captureUnit?.amount?.currency_code || 'USD'
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
        amount: capturedValue,
        currency,
        payer: captureData.payer
      }
    })
  } catch (error) {
    console.error('PayPal capture error:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to capture PayPal payment. Please contact support if charged.'
    })
  }
})

export default router