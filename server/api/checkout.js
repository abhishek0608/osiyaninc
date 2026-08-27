/**
 * Storefront checkout.
 *
 * The rule here is that the browser never decides what anything costs. The
 * client sends a cart id and an address; this module re-reads the cart from the
 * database, re-prices it from the catalog, re-applies the site's volume
 * discount, and only then tells the gateway what to charge. A tampered client
 * total gets ignored rather than billed.
 *
 * Two settlement paths exist:
 *   - immediate — an Order plus a PENDING Payment, charged through Stripe. The
 *     order is only confirmed when the webhook says the money arrived.
 *   - terms     — a "buy now, pay in N days" sale for accounts an admin has
 *     approved. No card is taken, so nothing touches Stripe; the order carries
 *     a due date and its Payment stays PENDING until finance settles it.
 */
import { prisma } from './db.js'
import { toApiProduct } from './product-presenter.js'
import { getSiteConfig } from './site-config-source.js'
import { creditLimitToUsd, formatUsd } from './money.js'

export class CheckoutError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'CheckoutError'
    this.code = code
    this.status = status
  }
}

// An order bought on terms is money we are still owed until it is settled.
// Cancelled and refunded orders are not, so they fall out of the exposure sum.
const OPEN_TERMS_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'FULFILLED']

/** Mirrors the client's isCustomizedCartItem: a bespoke piece is quoted, not sold. */
function isCustomizedRow(customization) {
  return Boolean(customization && typeof customization === 'object' && customization.isCustomized === true)
}

const CART_ITEM_INCLUDE = {
  variant: {
    include: {
      product: {
        include: {
          variants: { where: { active: true }, orderBy: { listPricePaise: 'asc' } },
          priceBookMap: {
            where: { minQty: { lte: 1 }, priceBook: { active: true, channel: 'B2C' } },
            include: { priceBook: true },
            orderBy: [{ minQty: 'asc' }, { validFrom: 'desc' }],
          },
        },
      },
    },
  },
}

export async function resolveCustomerCart(customerId, cartId) {
  if (cartId) {
    const byId = await prisma.cart.findFirst({ where: { id: cartId, customerId, channel: 'B2C' } })
    if (byId) return byId
  }
  const existing = await prisma.cart.findFirst({
    where: { customerId, channel: 'B2C' },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing
  return prisma.cart.create({ data: { customerId, channel: 'B2C' } })
}

/**
 * Re-price the cart from the catalog. Amounts come back in whole US dollars,
 * the unit the order tables use (see money.js on the `*Paise` naming).
 *
 * The volume-discount arithmetic deliberately matches useCart: every unit in
 * the cart counts toward the quantity threshold, including customized pieces,
 * but the percentage only comes off the priced (non-customized) subtotal,
 * because customized pieces are quoted separately and are not in this order.
 */
export async function priceCart(customerId, cartId) {
  const cart = await resolveCustomerCart(customerId, cartId)
  const rows = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: CART_ITEM_INCLUDE,
    orderBy: { createdAt: 'asc' },
  })
  if (!rows.length) throw new CheckoutError('CART_EMPTY', 'Your cart is empty.')

  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0)
  const priced = rows.filter((row) => !isCustomizedRow(row.customization))
  const customizedCount = rows.length - priced.length

  const lines = priced.map((row) => {
    const presented = toApiProduct(row.variant.product, row.variant)
    const priceUsd = Number(presented.priceValue) || row.variant.listPricePaise || 0
    return {
      cartItemId: row.id,
      variantId: row.variantId,
      titleSnapshot: row.variant.product.title,
      priceUsd,
      qty: row.qty,
    }
  })

  const zeroPriced = lines.find((line) => line.priceUsd <= 0)
  if (zeroPriced) {
    throw new CheckoutError(
      'ITEM_NOT_PRICED',
      `"${zeroPriced.titleSnapshot}" is not priced for online purchase yet. Please remove it or contact us.`,
    )
  }

  const subtotalUsd = lines.reduce((sum, line) => sum + line.priceUsd * line.qty, 0)

  const config = await getSiteConfig()
  const tiers = config?.volumeDiscountEnabled ? config.volumeDiscountTiers || [] : []
  // Tiers arrive sorted highest threshold first, so the first match is the best.
  const tier = tiers.find((t) => totalQty >= t.minQty) || null
  const discountPercent = tier?.percent ?? 0
  const discountUsd = Math.round((subtotalUsd * discountPercent) / 100)
  const totalUsd = subtotalUsd - discountUsd

  return {
    cart,
    lines,
    customizedCount,
    subtotalUsd,
    discountPercent,
    discountUsd,
    totalUsd,
    currency: priced[0]?.variant?.currency || 'USD',
  }
}

export async function getCheckoutCustomer(customerId) {
  if (!customerId) throw new CheckoutError('NO_CUSTOMER', 'Please sign in to place an order.', 401)
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      channel: true,
      canPayTerms: true,
      termsLimitPaise: true,
      termsDays: true,
    },
  })
  if (!customer) throw new CheckoutError('NO_CUSTOMER', 'User not found.', 404)
  return customer
}

/** Value this customer already owes on unsettled terms orders, in whole dollars. */
export async function getTermsOutstandingUsd(customerId) {
  const orders = await prisma.order.findMany({
    where: {
      customerId,
      termsDueDate: { not: null },
      status: { in: OPEN_TERMS_ORDER_STATUSES },
      payments: { none: { status: 'SUCCESS' } },
    },
    select: { totalPaise: true },
  })
  return orders.reduce((sum, order) => sum + order.totalPaise, 0)
}

/**
 * Terms is a per-account permission with a value cap. The checkout UI hides the
 * option from accounts that lack it, but that is a courtesy — this is the rule.
 */
export async function assertTermsAllowed(customer, totalUsd, currency = 'USD') {
  if (!customer.canPayTerms) {
    throw new CheckoutError('TERMS_NOT_ALLOWED', 'This account is not approved for payment terms.', 403)
  }
  // termsLimitPaise is stored in cents by the internal admin screen while order
  // totals are whole dollars, so the limit is converted before comparing.
  const limitUsd = creditLimitToUsd(customer.termsLimitPaise)
  if (limitUsd == null) return

  const outstandingUsd = await getTermsOutstandingUsd(customer.id)
  if (outstandingUsd + totalUsd > limitUsd) {
    const availableUsd = Math.max(limitUsd - outstandingUsd, 0)
    throw new CheckoutError(
      'TERMS_LIMIT_EXCEEDED',
      `Payment-terms limit reached. ${formatUsd(outstandingUsd, currency)} is already outstanding against a ` +
        `${formatUsd(limitUsd, currency)} limit, leaving ${formatUsd(availableUsd, currency)} available.`,
    )
  }
}

export function termsDueDate(termsDays, from = new Date()) {
  const days = Number(termsDays) > 0 ? Number(termsDays) : 30
  const due = new Date(from)
  due.setDate(due.getDate() + days)
  return due
}

export function normalizeShipTo(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const allowed = ['name', 'email', 'phone', 'address', 'city', 'state', 'country', 'pincode']
  const out = {}
  for (const key of allowed) {
    const value = typeof input[key] === 'string' ? input[key].trim() : ''
    if (value) out[key] = value
  }
  return Object.keys(out).length ? out : null
}

/** Sequential ORD-000123; orderNo is unique, so retry when a concurrent create takes it. */
async function createWithOrderNo(data) {
  let seq = (await prisma.order.count()) + 1
  for (let attempt = 0; attempt < 5; attempt += 1, seq += 1) {
    try {
      return await prisma.order.create({
        data: { ...data, orderNo: `ORD-${String(seq).padStart(6, '0')}` },
        include: { items: true, payments: true },
      })
    } catch (err) {
      if (err?.code !== 'P2002') throw err
    }
  }
  throw new CheckoutError('ORDER_NO_CONFLICT', 'Could not allocate an order number. Please try again.', 500)
}

/**
 * Create the order in PENDING with a PENDING Payment beside it. Nothing here is
 * a completed sale: an immediate order waits on the Stripe webhook, and a terms
 * order waits on finance.
 */
export async function createPendingOrder({ customer, pricing, shipTo, term, notes = '' }) {
  const onTerms = term === 'terms'
  return createWithOrderNo({
    channel: customer.channel || 'B2C',
    status: 'PENDING',
    customerId: customer.id,
    subtotalPaise: pricing.subtotalUsd,
    discountPaise: pricing.discountUsd,
    totalPaise: pricing.totalUsd,
    currency: pricing.currency,
    shipTo: shipTo || undefined,
    termsDays: onTerms ? customer.termsDays : undefined,
    termsDueDate: onTerms ? termsDueDate(customer.termsDays) : undefined,
    notes: notes || undefined,
    createdById: customer.id,
    updatedById: customer.id,
    items: {
      create: pricing.lines.map(({ variantId, titleSnapshot, priceUsd, qty }) => ({
        variantId,
        titleSnapshot,
        pricePaise: priceUsd,
        qty,
      })),
    },
    payments: {
      create: {
        provider: onTerms ? 'terms' : 'stripe',
        method: onTerms ? 'BANK_TRANSFER' : 'CARD',
        status: 'PENDING',
        amountPaise: pricing.totalUsd,
        currency: pricing.currency,
      },
    },
  })
}

/**
 * Take the ordered pieces out of the cart. Only the lines that made it into the
 * order are removed — a customized piece stays put, because it never left the
 * quote flow and is still waiting on a price.
 */
export async function clearOrderedCartItems(cartId, lines) {
  const ids = lines.map((line) => line.cartItemId).filter(Boolean)
  if (!ids.length) return
  await prisma.cartItem.deleteMany({ where: { cartId, id: { in: ids } } })
}

/**
 * A customer's own order, shaped for the storefront's account pages. Amounts are
 * whole US dollars, matching the order tables (see money.js). The settlement
 * flags mirror what the confirmation page needs: a card order is only "paid"
 * once a payment row reaches SUCCESS, which the Stripe webhook decides.
 */
export function toMyOrderPayload(order) {
  const settled = (order.payments || []).some((payment) => payment.status === 'SUCCESS')
  const onTerms = Boolean(order.termsDueDate)
  const items = (order.items || []).map((item) => {
    const product = item.variant?.product
    return {
      id: item.id,
      title: item.titleSnapshot,
      slug: product?.slug || '',
      image: product?.images?.[0]?.url || '',
      qty: item.qty,
      priceUsd: item.pricePaise,
      formattedPrice: formatUsd(item.pricePaise, order.currency),
    }
  })
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    createdAt: order.createdAt,
    itemCount: items.reduce((sum, item) => sum + item.qty, 0),
    subtotalUsd: order.subtotalPaise,
    discountUsd: order.discountPaise,
    totalUsd: order.totalPaise,
    currency: order.currency,
    formattedTotal: formatUsd(order.totalPaise, order.currency),
    paymentTerm: onTerms ? 'terms' : 'immediate',
    // Only meaningful for immediate orders; a terms order was never charged.
    paymentSettlement: settled ? 'settled' : 'pending',
    termsDays: order.termsDays ?? null,
    termsDueDate: order.termsDueDate || null,
    notes: order.notes || '',
    shipTo: order.shipTo || null,
    items,
  }
}

/** Every order belonging to one customer, newest first. */
export async function getMyOrders(customerId) {
  const orders = await prisma.order.findMany({
    where: { customerId },
    include: {
      payments: { select: { status: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          variant: {
            include: {
              product: {
                select: {
                  slug: true,
                  images: { where: { active: true }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return orders.map((order) => toMyOrderPayload(order))
}
