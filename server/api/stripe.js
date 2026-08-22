/**
 * Stripe client, shared by the checkout endpoint and the webhook.
 *
 * The secret key is server-only and must never reach the bundle — the browser
 * gets VITE_STRIPE_PUBLISHABLE_KEY instead, which is safe to publish.
 */
import Stripe from 'stripe'

let client = null

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe() {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.')
  }
  // Reused across warm invocations; Stripe's client is safe to share and
  // rebuilding it per request would drop its connection pool.
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pinned to the version this SDK release is generated against, so a
      // Stripe-side API upgrade cannot silently change the shape of what this
      // code reads. Bump it together with the stripe package, not on its own.
      apiVersion: '2026-07-29.dahlia',
      typescript: false,
    })
  }
  return client
}

export function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || ''
}
