import { ref } from 'vue'
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'
import { API_BASE } from '../config-api'
import type { PaymentTerm } from './useOrders'

export interface CheckoutShipTo {
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  country: string
  pincode: string
}

// Mirrors the server's orderPayload. Amounts are whole US dollars, the unit the
// order tables use — see server/api/money.js.
export interface CheckoutOrder {
  id: string
  orderNo: string
  status: string
  totalUsd: number
  subtotalUsd: number
  discountUsd: number
  currency: string
  termsDays: number | null
  termsDueDate: string | null
  paymentStatus: string
}

export interface CheckoutIntent {
  term: PaymentTerm
  clientSecret?: string
  order: CheckoutOrder
  customizedCount: number
}

const publishableKey = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim()

export function isStripeAvailable() {
  return Boolean(publishableKey)
}

let stripePromise: Promise<Stripe | null> | null = null

/** Stripe.js is ~100KB and only the checkout page needs it, so it loads on demand and once. */
export function getStripeJs(): Promise<Stripe | null> {
  if (!publishableKey) return Promise.resolve(null)
  if (!stripePromise) stripePromise = loadStripe(publishableKey)
  return stripePromise
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || 'Payment request failed.')
  return data
}

export function useCheckout() {
  const preparing = ref(false)
  const confirming = ref(false)
  const error = ref('')

  /**
   * Open an order server-side. The server re-prices the cart from the catalog,
   * so nothing about the amount is decided here — the total that comes back is
   * the authoritative one and is what gets charged.
   */
  async function createIntent(params: {
    userId: string
    cartId: string
    shipTo: CheckoutShipTo
    paymentTerm: PaymentTerm
  }): Promise<CheckoutIntent> {
    preparing.value = true
    error.value = ''
    try {
      return (await postJson(`${API_BASE}/api/payments?mode=intent`, {
        userId: params.userId,
        cartId: params.cartId,
        shipTo: params.shipTo,
        paymentTerm: params.paymentTerm,
      })) as CheckoutIntent
    } finally {
      preparing.value = false
    }
  }

  /**
   * Hand the card details to Stripe. `redirect: 'if_required'` keeps the
   * customer on the page for plain cards and still allows the redirect that
   * 3D Secure and wallet methods need.
   */
  async function confirmPayment(elements: StripeElements, returnUrl: string) {
    confirming.value = true
    error.value = ''
    try {
      const stripe = await getStripeJs()
      if (!stripe) throw new Error('Card payments are unavailable. Please contact us to complete your order.')

      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      })
      if (stripeError) throw new Error(stripeError.message || 'Your payment could not be completed.')
      return paymentIntent ?? null
    } finally {
      confirming.value = false
    }
  }

  /**
   * One authoritative read of an order's payment state. Only the server knows
   * whether the webhook has settled the charge; the browser's own view of the
   * PaymentIntent can be stale, or missing entirely.
   */
  async function fetchOrderStatus(orderId: string, userId: string): Promise<CheckoutOrder | null> {
    try {
      const res = await fetch(
        `${API_BASE}/api/payments?mode=status&orderId=${encodeURIComponent(orderId)}&userId=${encodeURIComponent(userId)}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return null
      return (data?.order as CheckoutOrder) ?? null
    } catch {
      return null
    }
  }

  /**
   * The webhook is what actually confirms an order, and it can land a moment
   * after the customer's browser gets its answer. Poll briefly so the
   * confirmation page shows a settled order rather than a pending one.
   *
   * A null return means “not settled yet”, never “the payment failed” — a
   * payment that actually failed surfaces as an error from confirmPayment.
   */
  async function waitForConfirmation(orderId: string, userId: string, attempts = 5) {
    for (let i = 0; i < attempts; i += 1) {
      const order = await fetchOrderStatus(orderId, userId)
      if (order?.paymentStatus === 'SUCCESS') return order
      // A failed poll is not a failed payment — keep trying.
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    return null
  }

  return {
    preparing,
    confirming,
    error,
    createIntent,
    confirmPayment,
    waitForConfirmation,
    fetchOrderStatus,
  }
}
