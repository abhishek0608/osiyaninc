/**
 * Payments endpoint. Replaces the earlier create-order.js Razorpay stub, which
 * was never wired to the storefront and took a client-supplied amount on trust.
 *
 * Routes (all POST unless noted):
 *   webhook            — detected by the Stripe-Signature header, not a mode
 *   mode=intent        — price the cart server-side, open an order, return a
 *                        Stripe client secret (or place a terms order outright)
 *   mode=status (GET)  — poll an order while the webhook is in flight
 *
 * Endpoints are consolidated behind a mode dispatcher, matching account.js and
 * internal.js, because the deployment has a serverless function budget.
 */
import { applyCors, handlePreflight } from '../server/api/cors.js'
import { prisma } from '../server/api/db.js'
import { getStripe, isStripeConfigured, getWebhookSecret } from '../server/api/stripe.js'
import { usdToMinorUnits } from '../server/api/money.js'
import {
  CheckoutError,
  priceCart,
  getCheckoutCustomer,
  assertTermsAllowed,
  createPendingOrder,
  clearOrderedCartItems,
  normalizeShipTo,
} from '../server/api/checkout.js'

// Stripe signs the exact bytes it sent, so the platform must not parse the body
// out from under us. Non-webhook modes parse the raw buffer themselves below.
export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  // The local Vite middleware stashes the untouched string; on Vercel the
  // bodyParser is off, so the stream is still ours to drain.
  if (typeof req.rawBody === 'string') return req.rawBody
  if (typeof req.body === 'string') return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function parseJson(raw) {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/**
 * Identifies the exact cart being paid for. If anything about the cart or its
 * price moves, the signature changes and the in-flight intent is abandoned
 * rather than charged at a stale amount.
 */
function cartSignature(pricing) {
  const lines = pricing.lines
    .map((line) => `${line.variantId}:${line.qty}:${line.priceUsd}`)
    .sort()
    .join('|')
  return `${pricing.totalUsd}#${lines}`
}

function orderPayload(order) {
  const payment = order.payments?.[0] || null
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    totalUsd: order.totalPaise,
    subtotalUsd: order.subtotalPaise,
    discountUsd: order.discountPaise,
    currency: order.currency,
    termsDays: order.termsDays ?? null,
    termsDueDate: order.termsDueDate ? order.termsDueDate.toISOString() : null,
    paymentStatus: payment?.status || 'PENDING',
  }
}

function checkoutErrorResponse(res, err) {
  if (err instanceof CheckoutError) {
    return res.status(err.status).json({ message: err.message, code: err.code })
  }
  throw err
}

// ---------------------------------------------------------------------------
// mode=intent
// ---------------------------------------------------------------------------

/**
 * A previous attempt on this same cart. Reusing it keeps one order per checkout
 * session instead of stranding a PENDING order (and burning an order number) on
 * every reload of the payment step.
 *
 * Returns one of:
 *   { reuse: { payment, intent } } — still payable, hand the same secret back
 *   { settled: order }            — the money already arrived or is in flight
 *   null                          — nothing usable, open a fresh order
 */
async function findReusablePayment(customerId, signature) {
  const payment = await prisma.payment.findFirst({
    where: {
      provider: 'stripe',
      status: 'PENDING',
      providerRef: { not: null },
      order: { customerId, status: 'PENDING' },
    },
    orderBy: { createdAt: 'desc' },
    include: { order: { include: { items: true, payments: true } } },
  })
  if (!payment) return null

  const stripe = getStripe()
  let intent
  try {
    intent = await stripe.paymentIntents.retrieve(payment.providerRef)
  } catch {
    return null
  }

  // The money is already in, or on its way. Retiring this order would record a
  // paid charge as a failure; opening a second order for the same cart would
  // bill the customer twice for goods they have already bought. Neither is
  // acceptable, so settle what can be settled and hand the existing order back.
  //
  // This is also what makes a missed webhook self-healing: if the endpoint was
  // misconfigured when the charge landed, the next checkout reconciles it.
  if (intent.status === 'succeeded' || intent.status === 'processing') {
    // 'processing' settles on its own later; only 'succeeded' is ours to record.
    if (intent.status === 'succeeded') await markPaid(intent)
    const order = await prisma.order.findUnique({
      where: { id: payment.orderId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    })
    return { settled: order }
  }

  const stillPayable = ['requires_payment_method', 'requires_confirmation', 'requires_action']
  if (!stillPayable.includes(intent.status) || intent.metadata?.cartSignature !== signature) {
    // Genuinely stale: either still payable but priced for a cart that has since
    // moved on, or in a terminal state that never took money. Retire both so a
    // stale amount can never be confirmed later.
    if (stillPayable.includes(intent.status)) {
      await stripe.paymentIntents.cancel(intent.id).catch(() => {})
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELLED' } })
    return null
  }

  return { reuse: { payment, intent } }
}

async function handleIntent(res, body) {
  const customerId = String(body?.userId || '').trim()
  const customer = await getCheckoutCustomer(customerId)
  const pricing = await priceCart(customer.id, String(body?.cartId || '').trim())

  if (!pricing.lines.length) {
    throw new CheckoutError(
      'ONLY_CUSTOMIZED',
      'Every piece in your cart is customized, so it goes through a quote rather than checkout.',
    )
  }

  const shipTo = normalizeShipTo(body?.shipTo)
  const term = body?.paymentTerm === 'terms' ? 'terms' : 'immediate'

  // Terms: the sale is final but no card is taken, so Stripe is never involved.
  if (term === 'terms') {
    await assertTermsAllowed(customer, pricing.totalUsd, pricing.currency)
    const order = await createPendingOrder({ customer, pricing, shipTo, term })
    await clearOrderedCartItems(pricing.cart.id, pricing.lines)
    return res.status(201).json({
      term: 'terms',
      order: orderPayload(order),
      customizedCount: pricing.customizedCount,
    })
  }

  if (!isStripeConfigured()) {
    throw new CheckoutError('STRIPE_NOT_CONFIGURED', 'Card payments are not available right now.', 503)
  }

  const signature = cartSignature(pricing)
  const existing = await findReusablePayment(customer.id, signature)

  // Already paid for (or awaiting a slow method). There is nothing left to
  // charge, so send the order back rather than a client secret.
  if (existing?.settled) {
    return res.status(200).json({
      term: 'immediate',
      alreadyPaid: true,
      order: orderPayload(existing.settled),
      customizedCount: pricing.customizedCount,
    })
  }

  if (existing?.reuse) {
    return res.status(200).json({
      term: 'immediate',
      clientSecret: existing.reuse.intent.client_secret,
      order: orderPayload(existing.reuse.payment.order),
      customizedCount: pricing.customizedCount,
    })
  }

  const order = await createPendingOrder({ customer, pricing, shipTo, term })
  const stripe = getStripe()
  const intent = await stripe.paymentIntents.create(
    {
      // Order totals are whole dollars; Stripe bills in cents. This is the only
      // place that conversion happens.
      amount: usdToMinorUnits(pricing.totalUsd),
      currency: String(pricing.currency || 'USD').toLowerCase(),
      automatic_payment_methods: { enabled: true },
      description: `Osiyan order ${order.orderNo}`,
      receipt_email: shipTo?.email || customer.email || undefined,
      metadata: {
        orderId: order.id,
        orderNo: order.orderNo,
        customerId: customer.id,
        cartId: pricing.cart.id,
        cartSignature: signature,
      },
      shipping: shipTo?.name && shipTo?.address
        ? {
            name: shipTo.name,
            phone: shipTo.phone || undefined,
            address: {
              line1: shipTo.address,
              city: shipTo.city || undefined,
              state: shipTo.state || undefined,
              postal_code: shipTo.pincode || undefined,
              country: 'US',
            },
          }
        : undefined,
    },
    // Retrying this request must not open a second charge for the same order.
    { idempotencyKey: `order_${order.id}` },
  )

  await prisma.payment.updateMany({
    where: { orderId: order.id, provider: 'stripe' },
    data: { providerRef: intent.id },
  })

  return res.status(201).json({
    term: 'immediate',
    clientSecret: intent.client_secret,
    order: orderPayload(order),
    customizedCount: pricing.customizedCount,
  })
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Take the paid pieces out of the cart. Customized rows are left alone even
 * when they share a variant with an ordered line — they are still awaiting a
 * quote and were never part of this sale.
 */
async function clearPaidCart(cartId, order) {
  if (!cartId) return
  const variantIds = order.items.map((item) => item.variantId)
  if (!variantIds.length) return
  const rows = await prisma.cartItem.findMany({
    where: { cartId, variantId: { in: variantIds } },
    select: { id: true, customization: true },
  })
  const ids = rows
    .filter((row) => !(row.customization && row.customization.isCustomized === true))
    .map((row) => row.id)
  if (ids.length) await prisma.cartItem.deleteMany({ where: { id: { in: ids } } })
}

async function markPaid(intent) {
  const payment = await prisma.payment.findFirst({
    where: { provider: 'stripe', providerRef: intent.id },
    include: { order: { include: { items: true } } },
  })
  if (!payment) {
    console.warn(`Stripe webhook: no payment row for intent ${intent.id}`)
    return
  }
  // The same event can be delivered more than once; a settled payment is done.
  if (payment.status === 'SUCCESS') return

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS', paidAt: new Date() },
    }),
    prisma.order.update({
      where: { id: payment.orderId },
      data: { status: 'CONFIRMED' },
    }),
  ])
  await clearPaidCart(intent.metadata?.cartId, payment.order)
}

async function markFailed(intent, status = 'FAILED') {
  const payment = await prisma.payment.findFirst({
    where: { provider: 'stripe', providerRef: intent.id },
  })
  if (!payment || payment.status === 'SUCCESS') return
  await prisma.payment.update({ where: { id: payment.id }, data: { status } })
}

async function handleWebhook(req, res, raw) {
  const secret = getWebhookSecret()
  if (!secret) {
    console.error('Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set.')
    return res.status(500).json({ message: 'Webhook not configured.' })
  }

  let event
  try {
    // Verifying proves the event came from Stripe. Without this, anyone who
    // knows the URL could mark orders paid.
    event = getStripe().webhooks.constructEvent(raw, req.headers['stripe-signature'], secret)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message)
    return res.status(400).json({ message: 'Invalid signature.' })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await markPaid(event.data.object)
        break
      case 'payment_intent.payment_failed':
        await markFailed(event.data.object, 'FAILED')
        break
      case 'payment_intent.canceled':
        await markFailed(event.data.object, 'FAILED')
        break
      default:
        break
    }
  } catch (err) {
    console.error(`Stripe webhook handling failed for ${event.type}:`, err)
    // A non-2xx tells Stripe to retry, which is what we want for a transient
    // database failure — the handlers above are idempotent.
    return res.status(500).json({ message: 'Webhook handling failed.' })
  }

  return res.status(200).json({ received: true })
}

// ---------------------------------------------------------------------------

async function handleStatus(res, req) {
  const orderId = String(req?.query?.orderId || '').trim()
  const customerId = String(req?.query?.userId || '').trim()
  if (!orderId || !customerId) {
    return res.status(400).json({ message: 'orderId and userId are required.' })
  }
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  })
  if (!order) return res.status(404).json({ message: 'Order not found.' })
  return res.status(200).json({ order: orderPayload(order) })
}

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  try {
    if (req.method === 'GET') {
      const mode = String(req?.query?.mode || '').trim()
      if (mode === 'status') return await handleStatus(res, req)
      return res.status(400).json({ message: 'Invalid mode for GET.' })
    }

    if (req.method === 'POST') {
      const raw = await readRawBody(req)
      // A signed request is Stripe calling us, whatever the body says it is.
      if (req.headers['stripe-signature']) return await handleWebhook(req, res, raw)

      const body = parseJson(raw)
      const mode = String(req?.query?.mode || body?.mode || '').trim()
      if (mode === 'intent') {
        try {
          return await handleIntent(res, body)
        } catch (err) {
          return checkoutErrorResponse(res, err)
        }
      }
      return res.status(400).json({ message: 'Invalid mode for POST.' })
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  } catch (err) {
    console.error('Payments API failed:', err)
    return res.status(500).json({ message: 'Payment request failed.' })
  }
}
