/**
 * Currency units, in one place.
 *
 * The schema's `*Paise` column names are a leftover from an INR-first draft.
 * They do NOT hold minor units. Every catalog and order amount —
 * ProductVariant.listPricePaise, OrderItem.pricePaise, Order.totalPaise,
 * MemoItem.pricePaise — holds a WHOLE NUMBER OF US DOLLARS. That is why
 * product-presenter renders `$${value.toLocaleString()}` straight from the
 * field, and why the seed script feeds it a whole-dollar price.
 *
 * The two exceptions are User.memoLimitPaise and User.termsLimitPaise, which
 * the internal admin screen writes in CENTS (it multiplies the dollars typed in
 * by 100). Anything comparing an order total to one of those limits has to
 * convert first — see creditLimitToUsd.
 *
 * Payment gateways bill in minor units, so the dollars→cents conversion happens
 * exactly once, at the gateway boundary, via usdToMinorUnits.
 */

/** Catalog/order dollars → the minor units (cents) a gateway charges in. */
export function usdToMinorUnits(usd) {
  const dollars = Number(usd)
  if (!Number.isFinite(dollars) || dollars < 0) return 0
  return Math.round(dollars * 100)
}

/** Gateway minor units → the whole dollars the order tables store. */
export function minorUnitsToUsd(minor) {
  const cents = Number(minor)
  if (!Number.isFinite(cents) || cents < 0) return 0
  return Math.round(cents / 100)
}

/**
 * A credit limit (stored in cents by the internal admin screen) expressed in
 * the whole dollars that order totals use, so the two can be compared.
 */
export function creditLimitToUsd(limitPaise) {
  if (limitPaise == null) return null
  const cents = Number(limitPaise)
  if (!Number.isFinite(cents) || cents < 0) return null
  return Math.round(cents / 100)
}

export function formatUsd(usd, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(usd) || 0)
}

/**
 * Resolve the discount a staff member keyed in against a sale's subtotal.
 *
 * The form lets them type either a flat dollar amount or a percent, but only
 * the resolved whole-dollar amount is stored (Order.discountPaise): an order
 * must never depend on a percentage that was true at the time of sale.
 *
 * Returns the dollar amount to take off, clamped to [0, subtotal]. A missing
 * or malformed discount resolves to 0 rather than throwing, so callers that
 * never send one keep working. An amount above the subtotal is rejected,
 * because silently clamping would hide a typo like 4000 for 400.
 */
export function resolveDiscountUsd(discount, subtotalUsd) {
  if (!discount || typeof discount !== 'object') return 0
  const value = Number(discount.value)
  if (!Number.isFinite(value) || value <= 0) return 0
  const subtotal = Math.max(Number(subtotalUsd) || 0, 0)
  const mode = String(discount.mode || 'amount').toLowerCase()
  if (mode === 'percent') {
    if (value > 100) throw new DiscountError('A percentage discount cannot exceed 100%.')
    return Math.round((subtotal * value) / 100)
  }
  const amount = Math.round(value)
  if (amount > subtotal) throw new DiscountError('The discount cannot exceed the subtotal.')
  return amount
}

export class DiscountError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DiscountError'
    this.status = 400
  }
}
