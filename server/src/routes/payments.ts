import express, { Request, Response } from 'express'
import Stripe from 'stripe'
import { z } from 'zod'
import { optionalAuth } from '../middleware/auth.js'
import { createRateLimiter, getAdminContactEmail, resolveSafeRedirectOrigin } from '../middleware/security.js'
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
  shippingAddress: shippingInputSchema,
  useWallet: z.boolean().optional()
})

async function resolveGatewayAmountsWithWallet(
  req: Request,
  totalUsd: number,
  useWallet?: boolean
): Promise<{ walletApplied: number; gatewayAmount: number; coveredByWallet: boolean }> {
  const cleanTotal = databaseService.roundCurrency(totalUsd)
  if (!useWallet || !req.user?.id) {
    return { walletApplied: 0, gatewayAmount: cleanTotal, coveredByWallet: false }
  }
  const wallet = await databaseService.getOrCreateWallet(req.user.id)
  const walletApplied = Math.min(databaseService.roundCurrency(wallet.balance), cleanTotal)
  const gatewayAmount = databaseService.roundCurrency(Math.max(0, cleanTotal - walletApplied))
  return {
    walletApplied,
    gatewayAmount,
    coveredByWallet: gatewayAmount <= 0
  }
}

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

async function ensureGatewayAvailable(gateway: 'paypal' | 'stripe', res: Response): Promise<boolean> {
  const availability = await databaseService.getPaymentOptionsConfig()
  const entry = availability[gateway]
  if (!entry.available) {
    res.status(503).json({
      success: false,
      code: 'PAYMENT_OPTION_UNAVAILABLE',
      error: entry.notice
    })
    return false
  }
  return true
}

// ==========================================
// 0. PAYMENT GATEWAY RUNTIME CONFIGURATION
// ==========================================

// Returns public client keys, PayPal Client Token, and admin-toggled gateway availability
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
  const paymentAvailability = await databaseService.getPaymentOptionsConfig()

  let paypalClientToken: string | null = null
  if (paypalClientId && paymentAvailability.paypal.available) {
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
      paypalClientToken,
      supportEmail: getAdminContactEmail(),
      paymentAvailability,
      manualPaymentConfig: {
        bankDeposit: {
          bankName: (process.env.BANK_NAME || 'JPMorgan Chase Bank, N.A.').trim(),
          accountName: (process.env.BANK_ACCOUNT_NAME || 'Eurotop Aerospace Inc. (DriveFlyElectric)').trim(),
          accountNumber: (process.env.BANK_ACCOUNT_NUMBER || '9872451928').trim(),
          routingNumber: (process.env.BANK_ROUTING_NUMBER || '111000614').trim(),
          swiftBic: (process.env.BANK_SWIFT_BIC || 'CHASUS33').trim(),
          bankAddress: (process.env.BANK_ADDRESS || '1000 DriveFly Electric Way, Suite 400, Austin, TX 78701').trim()
        },
        crypto: {
          btcWallet: (process.env.CRYPTO_BTC_WALLET || '').trim(),
          ethWallet: (process.env.CRYPTO_ETH_WALLET || '').trim(),
          usdtTrc20Wallet: (process.env.CRYPTO_USDT_TRC20_WALLET || '').trim(),
          usdtErc20Wallet: (process.env.CRYPTO_USDT_ERC20_WALLET || '').trim(),
          solWallet: (process.env.CRYPTO_SOL_WALLET || '').trim()
        },
        cheque: {
          payee: (process.env.BANK_ACCOUNT_NAME || 'Eurotop Aerospace Inc. (DriveFlyElectric)').trim(),
          mailingAddress: (process.env.BANK_ADDRESS || '1000 DriveFly Electric Way, Suite 400, Austin, TX 78701').trim(),
          memoInstruction: 'Include your Order Number (e.g. DFE-...) on the Cheque memo line.'
        },
        invoice: {
          instruction: 'Request an official invoice to receive a dedicated payment link and pay at your convenience.'
        },
        custom: {
          supportPrompt: 'Chat with support for guidance on custom payment options we accommodate (escrow, split wires, financing, local methods).'
        }
      }
    }
  })
})

// ==========================================
// 1. STRIPE PAYMENT INTEGRATION (USD)
// ==========================================

// Create Payment Intent with authoritative server-computed USD total
router.post('/stripe/create-intent', paymentInitRateLimit, optionalAuth, async (req, res) => {
  try {
    if (!(await ensureGatewayAvailable('stripe', res))) return
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
    const walletSplit = await resolveGatewayAmountsWithWallet(req, pricing.total, parsed.data.useWallet)
    if (walletSplit.coveredByWallet) {
      return res.status(200).json({
        success: true,
        data: {
          coveredByWallet: true,
          walletApplied: walletSplit.walletApplied,
          orderTotal: pricing.total,
          amount: 0
        }
      })
    }

    const amountInCents = Math.round(walletSplit.gatewayAmount * 100)
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
        wallet_applied_usd: walletSplit.walletApplied.toFixed(2),
        gateway_due_usd: walletSplit.gatewayAmount.toFixed(2),
        total_usd: pricing.total.toFixed(2)
      }
    })

    emailService.recordActivity({
      type: 'PAYMENT_AUTHORIZED',
      title: `Stripe Card Intent Initialized • $${walletSplit.gatewayAmount.toFixed(2)} USD`,
      message: `Stripe PaymentIntent (${paymentIntent.id}) created for $${walletSplit.gatewayAmount.toFixed(2)} USD${walletSplit.walletApplied > 0 ? ` (after $${walletSplit.walletApplied.toFixed(2)} wallet balance)` : ''}.`,
      userEmail: customerEmail,
      amount: walletSplit.gatewayAmount,
      emailDispatched: false,
      systemMailDispatched: false
    })

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: walletSplit.gatewayAmount,
        walletApplied: walletSplit.walletApplied,
        orderTotal: pricing.total
      }
    })
  } catch (error: any) {
    console.error('Stripe create-intent error:', error)
    const isInventoryOrCartError =
      error?.message?.includes('Coming Soon') ||
      error?.message?.includes('Inventory') ||
      error?.message?.includes('Insufficient inventory') ||
      error?.message?.includes('available')
    const message = isInventoryOrCartError
      ? error.message
      : 'Unable to initialize Stripe card payment. Please verify your cart and try again.'

    if (!isInventoryOrCartError) {
      emailService
        .recordPaymentFailure({
          gateway: 'STRIPE',
          stage: 'Intent Initialization',
          userEmail: req.body?.customerEmail || req.user?.email || undefined,
          reason: error?.message || message,
          notifySystem: false
        })
        .catch(() => {})
    }

    res.status(400).json({
      success: false,
      error: message
    })
  }
})

// Confirm / Check status of Stripe payment
router.post('/stripe/confirm', paymentInitRateLimit, optionalAuth, async (req, res) => {
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
    const payerEmail = paymentIntent.receipt_email || req.user?.email || undefined

    if (paymentIntent.status === 'succeeded') {
      emailService.recordActivity({
        type: 'PAYMENT_CAPTURED',
        title: `Stripe Card Payment Settled • $${usdAmount.toFixed(2)} USD`,
        message: `Stripe PaymentIntent (${paymentIntent.id}) verified as SUCCEEDED for $${usdAmount.toFixed(2)} USD.`,
        userEmail: payerEmail,
        amount: usdAmount,
        emailDispatched: false,
        systemMailDispatched: false
      })
    } else if (paymentIntent.status !== 'processing') {
      emailService
        .recordPaymentFailure({
          gateway: 'STRIPE',
          stage: 'Card Confirmation',
          amount: usdAmount,
          userEmail: payerEmail,
          referenceId: paymentIntent.id,
          reason:
            paymentIntent.last_payment_error?.message ||
            `Stripe PaymentIntent status: ${paymentIntent.status}.`,
          notifySystem: paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'canceled'
        })
        .catch(() => {})
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
    emailService
      .recordPaymentFailure({
        gateway: 'STRIPE',
        stage: 'Card Confirmation',
        userEmail: req.user?.email || undefined,
        referenceId: req.body?.paymentIntentId,
        reason: error?.message || 'Unable to confirm Stripe payment status.',
        notifySystem: true
      })
      .catch(() => {})

    res.status(500).json({
      success: false,
      error: 'Unable to confirm Stripe payment status.'
    })
  }
})

const processedStripeEventIds = new Set<string>()
function markStripeEventProcessed(eventId: string) {
  processedStripeEventIds.add(eventId)
  if (processedStripeEventIds.size > 500) {
    const oldest = processedStripeEventIds.values().next().value
    if (oldest) processedStripeEventIds.delete(oldest)
  }
}

function extractStripeObjectId(ref?: string | { id?: string } | null): string | undefined {
  if (!ref) return undefined
  return typeof ref === 'string' ? ref : ref.id
}

// Verified Stripe Webhook endpoint (expects raw JSON Buffer mounted in server/src/index.ts)
router.post('/stripe/webhook', async (req, res) => {
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim()
  if (!webhookSecret) {
    return res.status(503).json({
      success: false,
      error: 'Stripe webhook secret is not configured on the server.'
    })
  }

  const signature = req.headers['stripe-signature']
  if (!signature || typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      error: 'Missing Stripe signature header or raw webhook payload.'
    })
  }

  let event: Stripe.Event
  try {
    const stripe = getStripeClient()
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret)
  } catch (err: any) {
    console.warn('Stripe webhook signature verification failed:', err?.message)
    return res.status(400).json({
      success: false,
      error: `Webhook signature verification failed: ${err?.message || 'Invalid signature'}`
    })
  }

  if (processedStripeEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        const amountUsd = (pi.amount_received || pi.amount || 0) / 100
        const payerEmail = pi.receipt_email || undefined
        const existingOrder = await databaseService.findOrderByPaymentId(pi.id)

        if (existingOrder) {
          if (existingOrder.paymentStatus !== 'COMPLETED' || existingOrder.status === 'PENDING') {
            const nextStatus = existingOrder.status === 'PENDING' ? 'PROCESSING' : existingOrder.status
            const updated = await databaseService.updateOrderPaymentAndStatus(existingOrder.id, {
              paymentStatus: 'COMPLETED',
              paymentVerified: true,
              status: nextStatus
            })
            if (existingOrder.status === 'PENDING') {
              emailService.sendOrderStatusUpdate(updated, payerEmail).catch(() => {})
            }
          }
        } else {
          emailService.recordActivity({
            type: 'PAYMENT_CAPTURED',
            title: `Stripe Webhook Payment Settled • $${amountUsd.toFixed(2)} USD`,
            message: `Stripe PaymentIntent (${pi.id}) confirmed via signed webhook for $${amountUsd.toFixed(2)} USD.`,
            userEmail: payerEmail,
            amount: amountUsd,
            metadata: {
              gateway: 'STRIPE',
              webhookEventId: event.id,
              paymentIntentId: pi.id
            },
            emailDispatched: false,
            systemMailDispatched: false
          })
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const amountUsd = (pi.amount || 0) / 100
        const payerEmail = pi.receipt_email || undefined
        const reason = pi.last_payment_error?.message || 'Card payment failed during Stripe authorization.'
        const existingOrder = await databaseService.findOrderByPaymentId(pi.id)

        if (existingOrder && existingOrder.paymentStatus !== 'COMPLETED') {
          await databaseService
            .updateOrderPaymentAndStatus(existingOrder.id, {
              paymentStatus: 'FAILED',
              status: 'CANCELLED'
            })
            .catch(() => {})
        }

        await emailService
          .recordPaymentFailure({
            gateway: 'STRIPE',
            stage: 'Webhook payment_intent.payment_failed',
            amount: amountUsd,
            userEmail: payerEmail,
            referenceId: pi.id,
            reason,
            notifySystem: true
          })
          .catch(() => {})
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const paymentIntentId = extractStripeObjectId(charge.payment_intent)
        const refundedUsd = (charge.amount_refunded || charge.amount || 0) / 100
        const payerEmail = charge.receipt_email || charge.billing_details?.email || undefined
        const isFullRefund = Boolean(charge.refunded) || charge.amount_refunded >= charge.amount
        const existingOrder = paymentIntentId
          ? await databaseService.findOrderByPaymentId(paymentIntentId)
          : null

        if (existingOrder) {
          if (isFullRefund && (existingOrder.status !== 'REFUNDED' || existingOrder.paymentStatus !== 'REFUNDED')) {
            const updated = await databaseService.updateOrderPaymentAndStatus(existingOrder.id, {
              status: 'REFUNDED',
              paymentStatus: 'REFUNDED'
            })
            emailService.sendOrderStatusUpdate(updated, payerEmail).catch(() => {})
          } else if (!isFullRefund) {
            emailService.recordActivity({
              type: 'ORDER_REFUNDED',
              title: `Stripe Partial Refund • #${existingOrder.orderNumber}`,
              message: `Partial refund of $${refundedUsd.toFixed(2)} USD issued on Stripe charge ${charge.id}.`,
              userEmail: payerEmail,
              orderNumber: existingOrder.orderNumber,
              amount: refundedUsd,
              metadata: {
                gateway: 'STRIPE',
                webhookEventId: event.id,
                chargeId: charge.id,
                paymentIntentId
              },
              emailDispatched: false,
              systemMailDispatched: false
            })
          }
        } else {
          emailService.recordActivity({
            type: 'ORDER_REFUNDED',
            title: `Stripe Refund Processed • $${refundedUsd.toFixed(2)} USD`,
            message: `Stripe signed webhook recorded refund on charge ${charge.id}${paymentIntentId ? ` (${paymentIntentId})` : ''}.`,
            userEmail: payerEmail,
            amount: refundedUsd,
            metadata: {
              gateway: 'STRIPE',
              webhookEventId: event.id,
              chargeId: charge.id,
              paymentIntentId
            },
            emailDispatched: false,
            systemMailDispatched: false
          })
        }
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const paymentIntentId = extractStripeObjectId(dispute.payment_intent)
        const disputeUsd = (dispute.amount || 0) / 100
        const existingOrder = paymentIntentId
          ? await databaseService.findOrderByPaymentId(paymentIntentId)
          : null

        await emailService
          .recordPaymentFailure({
            gateway: 'STRIPE',
            stage: 'Chargeback Dispute Opened',
            amount: disputeUsd,
            userEmail: existingOrder?.user?.email,
            referenceId: paymentIntentId || dispute.id,
            reason: `Stripe dispute ${dispute.id} opened (${dispute.reason || 'general'}) • Status: ${dispute.status}`,
            notifySystem: true
          })
          .catch(() => {})
        break
      }

      default:
        break
    }

    markStripeEventProcessed(event.id)
    return res.status(200).json({ received: true, eventType: event.type })
  } catch (err: any) {
    console.error(`Stripe webhook processing error (${event.type}):`, err)
    return res.status(500).json({
      success: false,
      error: 'Webhook handler encountered an internal error.'
    })
  }
})

// ==========================================
// 2. PAYPAL PAYMENT INTEGRATION (USD)
// ==========================================

// Create PayPal Order with authoritative server-computed USD total
router.post('/paypal/create-order', paymentInitRateLimit, optionalAuth, async (req, res) => {
  try {
    if (!(await ensureGatewayAvailable('paypal', res))) return
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
    const walletSplit = await resolveGatewayAmountsWithWallet(req, pricing.total, parsed.data.useWallet)
    if (walletSplit.coveredByWallet) {
      return res.status(200).json({
        success: true,
        data: {
          coveredByWallet: true,
          walletApplied: walletSplit.walletApplied,
          orderTotal: pricing.total,
          amount: 0
        }
      })
    }

    const { token, baseUrl } = await getPayPalAccessToken()
    const formattedTotal = walletSplit.gatewayAmount.toFixed(2)
    const cleanOrigin = resolveSafeRedirectOrigin(req)
    const customerEmail = parsed.data.customerEmail || req.user?.email || undefined
    const ship = parsed.data.shippingAddress
    const hasShippingAddress = Boolean(ship?.address1 && ship?.city && ship?.country)

    const orderPayload: any = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `DFE-${Date.now()}`,
          description:
            walletSplit.walletApplied > 0
              ? `DriveFlyElectric Order (Wallet -$${walletSplit.walletApplied.toFixed(2)})`
              : 'DriveFlyElectric Order',
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
              },
              ...(walletSplit.walletApplied > 0
                ? {
                    discount: {
                      currency_code: 'USD',
                      value: walletSplit.walletApplied.toFixed(2)
                    }
                  }
                : {})
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
      emailService
        .recordPaymentFailure({
          gateway: 'PAYPAL',
          stage: 'Order Initialization',
          amount: pricing.total,
          userEmail: customerEmail,
          reason: orderData?.message || orderData?.details?.[0]?.description || 'PayPal create-order rejected.',
          notifySystem: false
        })
        .catch(() => {})

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
        amount: walletSplit.gatewayAmount,
        walletApplied: walletSplit.walletApplied,
        orderTotal: pricing.total
      }
    })
  } catch (error: any) {
    console.error('PayPal create-order error:', error)
    const isInventoryError =
      error?.message?.includes('Coming Soon') ||
      error?.message?.includes('Insufficient inventory') ||
      error?.message?.includes('available')
    const message = isInventoryError
      ? error.message
      : 'Unable to initialize PayPal checkout. Please try again.'

    if (!isInventoryError) {
      emailService
        .recordPaymentFailure({
          gateway: 'PAYPAL',
          stage: 'Order Initialization',
          userEmail: req.body?.customerEmail || req.user?.email || undefined,
          reason: error?.message || message,
          notifySystem: false
        })
        .catch(() => {})
    }

    res.status(400).json({
      success: false,
      error: message
    })
  }
})

// Capture PayPal Order (Called by PayPal JS SDK onApprove / CardFields or Return Redirect)
router.post('/paypal/capture', paymentInitRateLimit, optionalAuth, async (req, res) => {
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
      const reason = captureData?.details?.[0]?.description || 'Payment authorization was declined or could not be captured.'
      emailService
        .recordPaymentFailure({
          gateway: 'PAYPAL',
          stage: 'Order Capture',
          userEmail: req.user?.email || undefined,
          referenceId: orderId,
          reason,
          notifySystem: true
        })
        .catch(() => {})

      return res.status(400).json({
        success: false,
        error: reason
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
  } catch (error: any) {
    console.error('PayPal capture error:', error)
    emailService
      .recordPaymentFailure({
        gateway: 'PAYPAL',
        stage: 'Order Capture',
        userEmail: req.user?.email || undefined,
        referenceId: req.body?.orderId,
        reason: error?.message || 'Unable to capture PayPal payment.',
        notifySystem: true
      })
      .catch(() => {})

    res.status(500).json({
      success: false,
      error: 'Unable to capture PayPal payment. Please contact support if charged.'
    })
  }
})

export default router