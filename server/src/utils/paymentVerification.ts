import Stripe from 'stripe'
import { databaseService } from '../services/databaseService.js'

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  'afghanistan': 'AF',
  'albania': 'AL',
  'algeria': 'DZ',
  'andorra': 'AD',
  'angola': 'AO',
  'antigua and barbuda': 'AG',
  'argentina': 'AR',
  'armenia': 'AM',
  'australia': 'AU',
  'austria': 'AT',
  'azerbaijan': 'AZ',
  'bahamas': 'BS',
  'bahrain': 'BH',
  'bangladesh': 'BD',
  'barbados': 'BB',
  'belarus': 'BY',
  'belgium': 'BE',
  'belize': 'BZ',
  'benin': 'BJ',
  'bhutan': 'BT',
  'bolivia': 'BO',
  'bosnia and herzegovina': 'BA',
  'botswana': 'BW',
  'brazil': 'BR',
  'brunei': 'BN',
  'bulgaria': 'BG',
  'burkina faso': 'BF',
  'burundi': 'BI',
  'cabo verde': 'CV',
  'cape verde': 'CV',
  'cambodia': 'KH',
  'cameroon': 'CM',
  'canada': 'CA',
  'central african republic': 'CF',
  'chad': 'TD',
  'chile': 'CL',
  'china': 'CN',
  'colombia': 'CO',
  'comoros': 'KM',
  'congo': 'CG',
  'congo (democratic republic)': 'CD',
  'democratic republic of the congo': 'CD',
  'costa rica': 'CR',
  "cote d'ivoire": 'CI',
  'ivory coast': 'CI',
  'croatia': 'HR',
  'cuba': 'CU',
  'cyprus': 'CY',
  'czechia': 'CZ',
  'czech republic': 'CZ',
  'denmark': 'DK',
  'djibouti': 'DJ',
  'dominica': 'DM',
  'dominican republic': 'DO',
  'ecuador': 'EC',
  'egypt': 'EG',
  'el salvador': 'SV',
  'equatorial guinea': 'GQ',
  'eritrea': 'ER',
  'estonia': 'EE',
  'eswatini': 'SZ',
  'ethiopia': 'ET',
  'fiji': 'FJ',
  'finland': 'FI',
  'france': 'FR',
  'gabon': 'GA',
  'gambia': 'GM',
  'georgia': 'GE',
  'germany': 'DE',
  'ghana': 'GH',
  'greece': 'GR',
  'grenada': 'GD',
  'guatemala': 'GT',
  'guinea': 'GN',
  'guinea-bissau': 'GW',
  'guyana': 'GY',
  'haiti': 'HT',
  'honduras': 'HN',
  'hong kong': 'HK',
  'hungary': 'HU',
  'iceland': 'IS',
  'india': 'IN',
  'indonesia': 'ID',
  'iran': 'IR',
  'iraq': 'IQ',
  'ireland': 'IE',
  'israel': 'IL',
  'italy': 'IT',
  'jamaica': 'JM',
  'japan': 'JP',
  'jordan': 'JO',
  'kazakhstan': 'KZ',
  'kenya': 'KE',
  'kiribati': 'KI',
  'korea (north)': 'KP',
  'korea (south)': 'KR',
  'south korea': 'KR',
  'kuwait': 'KW',
  'kyrgyzstan': 'KG',
  'laos': 'LA',
  'latvia': 'LV',
  'lebanon': 'LB',
  'lesotho': 'LS',
  'liberia': 'LR',
  'libya': 'LY',
  'liechtenstein': 'LI',
  'lithuania': 'LT',
  'luxembourg': 'LU',
  'macao': 'MO',
  'madagascar': 'MG',
  'malawi': 'MW',
  'malaysia': 'MY',
  'maldives': 'MV',
  'mali': 'ML',
  'malta': 'MT',
  'marshall islands': 'MH',
  'mauritania': 'MR',
  'mauritius': 'MU',
  'mexico': 'MX',
  'micronesia': 'FM',
  'moldova': 'MD',
  'monaco': 'MC',
  'mongolia': 'MN',
  'montenegro': 'ME',
  'morocco': 'MA',
  'mozambique': 'MZ',
  'myanmar': 'MM',
  'namibia': 'NA',
  'nauru': 'NR',
  'nepal': 'NP',
  'netherlands': 'NL',
  'new zealand': 'NZ',
  'nicaragua': 'NI',
  'niger': 'NE',
  'nigeria': 'NG',
  'north macedonia': 'MK',
  'norway': 'NO',
  'oman': 'OM',
  'pakistan': 'PK',
  'palau': 'PW',
  'palestine': 'PS',
  'panama': 'PA',
  'papua new guinea': 'PG',
  'paraguay': 'PY',
  'peru': 'PE',
  'philippines': 'PH',
  'poland': 'PL',
  'portugal': 'PT',
  'puerto rico': 'PR',
  'qatar': 'QA',
  'romania': 'RO',
  'russia': 'RU',
  'russian federation': 'RU',
  'rwanda': 'RW',
  'saint kitts and nevis': 'KN',
  'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC',
  'samoa': 'WS',
  'san marino': 'SM',
  'sao tome and principe': 'ST',
  'saudi arabia': 'SA',
  'senegal': 'SN',
  'serbia': 'RS',
  'seychelles': 'SC',
  'sierra leone': 'SL',
  'singapore': 'SG',
  'slovakia': 'SK',
  'slovenia': 'SI',
  'solomon islands': 'SB',
  'somalia': 'SO',
  'south africa': 'ZA',
  'south sudan': 'SS',
  'spain': 'ES',
  'sri lanka': 'LK',
  'sudan': 'SD',
  'suriname': 'SR',
  'sweden': 'SE',
  'switzerland': 'CH',
  'syria': 'SY',
  'taiwan': 'TW',
  'tajikistan': 'TJ',
  'tanzania': 'TZ',
  'thailand': 'TH',
  'timor-leste': 'TL',
  'togo': 'TG',
  'tonga': 'TO',
  'trinidad and tobago': 'TT',
  'tunisia': 'TN',
  'turkey': 'TR',
  'turkiye': 'TR',
  'turkmenistan': 'TM',
  'tuvalu': 'TV',
  'uganda': 'UG',
  'ukraine': 'UA',
  'united arab emirates': 'AE',
  'united kingdom': 'GB',
  'uk': 'GB',
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'uruguay': 'UY',
  'uzbekistan': 'UZ',
  'vanuatu': 'VU',
  'vatican city': 'VA',
  'venezuela': 'VE',
  'vietnam': 'VN',
  'viet nam': 'VN',
  'yemen': 'YE',
  'zambia': 'ZM',
  'zimbabwe': 'ZW'
}

export function resolveCountryIso2(countryInput?: string, fallbackCode?: string): string {
  const rawFallback = (fallbackCode || '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(rawFallback)) return rawFallback

  const trimmed = (countryInput || '').trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase()

  const mapped = COUNTRY_NAME_TO_ISO2[trimmed.toLowerCase()]
  return mapped || 'US'
}

let cachedStripe: Stripe | null = null

export function getStripeClient(): Stripe {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!key) {
    throw new Error('Stripe secret key is not configured on the server.')
  }
  if (!cachedStripe) {
    cachedStripe = new Stripe(key, { apiVersion: '2023-10-16' as any })
  }
  return cachedStripe
}

export function getPayPalMode(): 'live' | 'sandbox' {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').trim().toLowerCase()
  return mode === 'live' || mode === 'production' ? 'live' : 'sandbox'
}

export async function getPayPalAccessToken(): Promise<{ token: string; baseUrl: string }> {
  const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim()
  const secret = (process.env.PAYPAL_CLIENT_SECRET || '').trim()

  if (!clientId || !secret) {
    throw new Error('PayPal server credentials are not configured.')
  }

  const preferredMode = getPayPalMode()
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
    const data: any = await res.json()
    if (res.ok && data.access_token) {
      return { token: data.access_token, baseUrl: primaryBase }
    }
  } catch {
    // Try fallback endpoint below
  }

  const resFallback = await fetch(`${fallbackBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })
  const dataFallback: any = await resFallback.json()
  if (resFallback.ok && dataFallback.access_token) {
    return { token: dataFallback.access_token, baseUrl: fallbackBase }
  }

  throw new Error('Failed to authenticate with PayPal gateway.')
}

export interface ComputedOrderPricing {
  orderItems: Array<{ productId: string; quantity: number; price: number; name: string }>
  subtotal: number
  tax: number
  shipping: number
  total: number
}

export async function computeAuthoritativeOrderPricing(
  rawItems: Array<{ productId: string; quantity: number }>
): Promise<ComputedOrderPricing> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Order items are required')
  }

  const aggregated = new Map<string, number>()
  for (const entry of rawItems) {
    const productId = String(entry.productId || '').trim()
    const qty = Number(entry.quantity)
    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw new Error('Invalid product ID or quantity in order items')
    }
    aggregated.set(productId, (aggregated.get(productId) || 0) + qty)
  }

  let subtotal = 0
  const orderItems: Array<{ productId: string; quantity: number; price: number; name: string }> = []

  for (const [productId, quantity] of aggregated.entries()) {
    const product = await databaseService.findProductById(productId)
    if (!product || !product.isActive) {
      throw new Error('One or more selected items are no longer available')
    }
    if (product.isComingSoon) {
      throw new Error(`${product.name} is marked Coming Soon — please reserve it using Book Now instead of immediate checkout.`)
    }
    if (product.stock < quantity) {
      throw new Error(`Insufficient inventory for ${product.name}`)
    }
    const unitPrice = Number(product.price)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error(`Invalid pricing configuration for ${product.name}`)
    }
    subtotal += unitPrice * quantity
    orderItems.push({
      productId,
      quantity,
      price: unitPrice,
      name: product.name
    })
  }

  const roundedSubtotal = Math.round(subtotal * 100) / 100
  const shipping = 0
  const tax = Math.round(roundedSubtotal * 0.05 * 100) / 100
  const total = Math.round((roundedSubtotal + tax + shipping) * 100) / 100

  return {
    orderItems,
    subtotal: roundedSubtotal,
    tax,
    shipping,
    total
  }
}

export async function verifyStripePaymentIntent(
  paymentIntentId: string,
  expectedTotalUsd: number
): Promise<{ verified: boolean; paymentId: string; amountUsd: number; reason?: string }> {
  if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
    return { verified: false, paymentId: paymentIntentId, amountUsd: 0, reason: 'Invalid Stripe payment reference.' }
  }

  const stripe = getStripeClient()
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (pi.status !== 'succeeded') {
    return {
      verified: false,
      paymentId: pi.id,
      amountUsd: (pi.amount_received || pi.amount || 0) / 100,
      reason: `Stripe payment status is "${pi.status}" and has not succeeded.`
    }
  }

  if ((pi.currency || '').toLowerCase() !== 'usd') {
    return { verified: false, paymentId: pi.id, amountUsd: 0, reason: 'Invalid payment currency.' }
  }

  const receivedCents = pi.amount_received || pi.amount || 0
  const expectedCents = Math.round(expectedTotalUsd * 100)
  if (receivedCents < expectedCents - 2) {
    return {
      verified: false,
      paymentId: pi.id,
      amountUsd: receivedCents / 100,
      reason: 'Captured Stripe amount does not match the order total.'
    }
  }

  return {
    verified: true,
    paymentId: pi.id,
    amountUsd: receivedCents / 100
  }
}

export async function verifyPayPalPayment(
  paymentId: string,
  expectedTotalUsd: number,
  paypalOrderId?: string
): Promise<{ verified: boolean; paymentId: string; amountUsd: number; reason?: string }> {
  if (!paymentId && !paypalOrderId) {
    return { verified: false, paymentId: '', amountUsd: 0, reason: 'PayPal payment reference is missing.' }
  }

  const { token, baseUrl } = await getPayPalAccessToken()

  // 1. Check via PayPal Order ID if available (or if paymentId is an Order ID)
  const candidateOrderIds = Array.from(new Set([paypalOrderId, paymentId].filter(Boolean) as string[]))
  for (const orderId of candidateOrderIds) {
    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (orderRes.ok) {
      const orderData: any = await orderRes.json()
      const captureUnit = orderData.purchase_units?.[0]?.payments?.captures?.[0]
      const captureStatus = captureUnit?.status || orderData.status
      const valueUsd = Number(captureUnit?.amount?.value || orderData.purchase_units?.[0]?.amount?.value || 0)
      const currency = (captureUnit?.amount?.currency_code || orderData.purchase_units?.[0]?.amount?.currency_code || 'USD').toUpperCase()

      if (orderData.status === 'COMPLETED' && captureStatus === 'COMPLETED' && currency === 'USD') {
        if (valueUsd >= expectedTotalUsd - 0.02) {
          return {
            verified: true,
            paymentId: captureUnit?.id || paymentId || orderData.id,
            amountUsd: valueUsd
          }
        }
        return {
          verified: false,
          paymentId: captureUnit?.id || orderData.id,
          amountUsd: valueUsd,
          reason: 'Captured PayPal amount does not match order total.'
        }
      }
    }
  }

  // 2. Fallback: Check directly via Captures v2 endpoint if paymentId is a capture ID
  if (paymentId) {
    const capRes = await fetch(`${baseUrl}/v2/payments/captures/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (capRes.ok) {
      const capData: any = await capRes.json()
      const valueUsd = Number(capData.amount?.value || 0)
      const currency = (capData.amount?.currency_code || 'USD').toUpperCase()
      if (capData.status === 'COMPLETED' && currency === 'USD' && valueUsd >= expectedTotalUsd - 0.02) {
        return {
          verified: true,
          paymentId: capData.id || paymentId,
          amountUsd: valueUsd
        }
      }
    }
  }

  return {
    verified: false,
    paymentId: paymentId || paypalOrderId || '',
    amountUsd: 0,
    reason: 'PayPal transaction could not be verified as completed.'
  }
}

