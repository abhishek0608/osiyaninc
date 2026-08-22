<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import type { StripeElements, StripePaymentElement } from '@stripe/stripe-js'
import { useCart, isCustomizedCartItem } from '../composables/useCart'
import { useOrders, type OrderPayment, type PaymentTerm } from '../composables/useOrders'
import { useQuotes } from '../composables/useQuotes'
import { useSavedAddresses, countryDisplayName } from '../composables/useSavedAddresses'
import { useAuth } from '../composables/useAuth'
import { API_BASE } from '../config-api'
import { notifyTransaction } from '../composables/notifyTransactionEmail'
import { useCheckout, getStripeJs } from '../composables/useCheckout'
import { US_STATES } from '../data/us-states'
import SavedAddressSelector from '../components/SavedAddressSelector.vue'
import SavedAddressSavePanel from '../components/SavedAddressSavePanel.vue'

const router = useRouter()
const {
  items,
  cartId,
  formattedTotal,
  totalPrice,
  volumeDiscountTier,
  discountPercent,
  discountedTotal,
  formattedDiscount,
  formattedDiscountedTotal,
  clearCart,
} = useCart()
const { addOrder } = useOrders()
const { addQuote } = useQuotes()
const { addresses: allSavedAddresses, getById, save: saveAddress } = useSavedAddresses()
const { user, canMemoUser, canPayTermsUser, paymentTermDays } = useAuth()
const isProcessing = ref(false)
const isMemoProcessing = ref(false)
const submitError = ref('')

// Checkout runs in two stages when a card is involved: 'details' collects the
// address, then 'paying' shows Stripe's Payment Element for the amount the
// server priced. Terms orders and quote-only carts skip the second stage.
const { createIntent, confirmPayment, waitForConfirmation, fetchOrderStatus } = useCheckout()
const stage = ref<'details' | 'paying'>('details')
// Stripe's webhook is the only thing that settles a card order, and it can land
// after the customer reaches the confirmation page — or the method can be a slow
// one that stays 'processing' for days. Defaults to 'pending' so a charge is
// only ever called settled once the server has actually said so.
const paymentSettlement = ref<'settled' | 'pending'>('pending')
const serverOrder = ref<{ id: string; orderNo: string; totalUsd: number } | null>(null)
const paymentElementHost = ref<HTMLElement | null>(null)
let stripeElements: StripeElements | null = null
let paymentElement: StripePaymentElement | null = null

const form = ref({
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  country: 'US',
  pincode: '',
})

const selectedSavedId = ref('')
const shouldSaveAddress = ref(true)
const saveAsLabel = ref('')
const makeDefaultAddress = ref(false)


const savedAddresses = computed(() =>
  allSavedAddresses.value.filter((address) => {
    const country = address.country.trim().toUpperCase()
    return country === 'US' || country === 'UNITED STATES'
  }),
)

watch(savedAddresses, (addresses) => {
  if (selectedSavedId.value) return
  const preferred = addresses.find((address) => address.isDefault)
  if (preferred) selectedSavedId.value = preferred.id
}, { immediate: true })

function normalizeUsState(value: string): string {
  const normalized = value.trim().toUpperCase()
  return US_STATES.find(
    (state) => state.value === normalized || state.label.toUpperCase() === normalized,
  )?.value ?? ''
}

watch(selectedSavedId, (id, prevId) => {
  if (!id) {
    if (prevId) {
      form.value.name = ''
      form.value.email = ''
      form.value.phone = ''
      form.value.address = ''
      form.value.city = ''
      form.value.state = ''
      form.value.country = 'US'
      form.value.pincode = ''
    }
    return
  }
  const a = getById(id)
  if (!a) return
  form.value.name = a.name
  form.value.email = a.email
  form.value.phone = a.phone
  form.value.address = a.address
  form.value.city = a.city
  form.value.state = normalizeUsState(a.state)
  form.value.country = 'US'
  form.value.pincode = a.pincode
}, { immediate: true })

function persistCurrentAddress() {
  if (!shouldSaveAddress.value || selectedSavedId.value) return
  const id = saveAddress({
    label: saveAsLabel.value.trim() || `${form.value.city.trim()} address`,
    isDefault: makeDefaultAddress.value,
    name: form.value.name.trim(),
    email: form.value.email.trim(),
    phone: form.value.phone.trim(),
    address: form.value.address.trim(),
    city: form.value.city.trim(),
    state: form.value.state.trim(),
    country: form.value.country,
    pincode: form.value.pincode.trim(),
  })
  selectedSavedId.value = id
}

// How this order gets settled. 'terms' (buy now, pay in termsDays) is only an
// option for accounts an admin has approved for it, so an unapproved customer
// never sees the choice and every order stays 'immediate'.
const paymentTerm = ref<PaymentTerm>('immediate')

watch(canPayTermsUser, (allowed) => {
  if (!allowed) paymentTerm.value = 'immediate'
})

const dueDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + paymentTermDays.value)
  return d
})

const formattedDueDate = computed(() =>
  dueDate.value.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
)

function buildPayment(): OrderPayment {
  if (paymentTerm.value !== 'terms') return { term: 'immediate', settlement: paymentSettlement.value }
  return {
    term: 'terms',
    termDays: paymentTermDays.value,
    dueDate: dueDate.value.toISOString(),
  }
}

const hasCustomizedItems = computed(() =>
  items.some((item) => isCustomizedCartItem(item)),
)

function buildCustomizationMap(customization: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!customization) return null
  const labelMap: Record<string, string> = {
    diamondQuality: 'Diamond Quality',
    metalColor: 'Metal Color',
    metalPurity: 'Metal Purity',
    centerShape: 'Center Shape',
    centerStoneSize: 'Center Stone Size',
    ringSize: 'Ring Size',
    bangleSize: 'Bangle Size',
    necklaceSize: 'Necklace Size',
    additionalRemarks: 'Remarks',
  }
  const map: Record<string, string> = {}
  for (const [key, value] of Object.entries(customization)) {
    const v = String(value || '').trim()
    if (v) map[labelMap[key] || key] = v
  }
  return Object.keys(map).length ? map : null
}

function finalizeStandardOrder(orderNo?: string, serverTotal?: number) {
  const snapshot = [...items]
  const payment = buildPayment()
  // The server re-prices the cart, so its total is the one that was charged —
  // recording the client's figure could show a number nobody was billed.
  const order = addOrder(snapshot, serverTotal ?? discountedTotal.value, payment, orderNo)
  void notifyTransaction({
    kind: 'order',
    orderId: order.id,
    paymentTerm: payment.term,
    paymentDueDate: payment.term === 'terms' ? formattedDueDate.value : undefined,
    paymentTermDays: payment.termDays,
    paymentSettlement: payment.settlement,
    customerName: form.value.name.trim(),
    customerEmail: form.value.email.trim(),
    customerPhone: form.value.phone.trim(),
    address: form.value.address.trim(),
    city: form.value.city.trim(),
    state: form.value.state.trim(),
    country: countryDisplayName(form.value.country),
    pincode: form.value.pincode.trim(),
    formattedTotal: order.formattedTotal,
    items: snapshot.map((i) => ({
      title: i.product.title,
      qty: i.qty,
      price: i.product.price,
    })),
  })
  return { query: { orderId: order.id, kind: 'order' as const } }
}

function finalizeQuote() {
  const customizedItems = items.filter((item) => isCustomizedCartItem(item))
  const quote = addQuote(customizedItems, totalPrice.value, {
    name: form.value.name.trim(),
    email: form.value.email.trim(),
    phone: form.value.phone.trim(),
    address: form.value.address.trim(),
    city: form.value.city.trim(),
    state: form.value.state.trim(),
    country: countryDisplayName(form.value.country),
    pincode: form.value.pincode.trim(),
  })
  void notifyTransaction({
    kind: 'quote',
    quoteId: quote.id,
    customerName: form.value.name.trim(),
    customerEmail: form.value.email.trim(),
    customerPhone: form.value.phone.trim(),
    address: form.value.address.trim(),
    city: form.value.city.trim(),
    state: form.value.state.trim(),
    country: countryDisplayName(form.value.country),
    pincode: form.value.pincode.trim(),
    formattedTotal: quote.formattedTotal,
    items: customizedItems.map((i) => ({
      title: i.product.title,
      qty: i.qty,
      price: i.product.price,
      customization: buildCustomizationMap(i.customization as Record<string, unknown> | null),
    })),
  })
  return { query: { quoteId: quote.id, kind: 'quote' as const } }
}

function finalizeCheckout(orderNo?: string, serverTotal?: number) {
  if (!hasCustomizedItems.value) return finalizeStandardOrder(orderNo, serverTotal)

  const nonCustomized = items.filter(
    (item) => !isCustomizedCartItem(item),
  )
  let orderResult: ReturnType<typeof finalizeStandardOrder> | null = null
  if (nonCustomized.length) {
    const snapshot = [...nonCustomized]
    const nonCustomGross = snapshot.reduce((sum, i) => {
      const num = Number(String(i.product.price).replace(/[^\d]/g, ''))
      return sum + num * i.qty
    }, 0)
    // Same volume-discount percentage the cart advertised, applied to the
    // priced (non-customized) portion of a mixed order.
    const nonCustomTotal = nonCustomGross - Math.round((nonCustomGross * discountPercent.value) / 100)
    const payment = buildPayment()
    const order = addOrder(snapshot, serverTotal ?? nonCustomTotal, payment, orderNo)
    void notifyTransaction({
      kind: 'order',
      orderId: order.id,
      paymentTerm: payment.term,
      paymentDueDate: payment.term === 'terms' ? formattedDueDate.value : undefined,
      paymentTermDays: payment.termDays,
      paymentSettlement: payment.settlement,
      customerName: form.value.name.trim(),
      customerEmail: form.value.email.trim(),
      customerPhone: form.value.phone.trim(),
      address: form.value.address.trim(),
      city: form.value.city.trim(),
      state: form.value.state.trim(),
      country: countryDisplayName(form.value.country),
      pincode: form.value.pincode.trim(),
      formattedTotal: order.formattedTotal,
      items: snapshot.map((i) => ({
        title: i.product.title,
        qty: i.qty,
        price: i.product.price,
      })),
    })
    orderResult = { query: { orderId: order.id, kind: 'order' as const } }
  }

  const quoteResult = finalizeQuote()
  return orderResult
    ? { query: { quoteId: quoteResult.query.quoteId, orderId: orderResult.query.orderId, kind: 'quote' as const } }
    : quoteResult
}

// A cart of nothing but customized pieces has no sellable total, so it goes
// through the quote flow and never touches the payment gateway.
const hasPricedItems = computed(() => items.some((item) => !isCustomizedCartItem(item)))

function completeCheckout(orderNo?: string, serverTotal?: number) {
  persistCurrentAddress()
  const destination = finalizeCheckout(orderNo, serverTotal)
  clearCart()
  router.push({ path: '/order-confirmation', query: destination.query })
}

/**
 * Stage one: ask the server to price the cart and open an order. The amount
 * charged is whatever the server says it is — the totals rendered on this page
 * are for display and are never sent as the price.
 */
async function beginPayment() {
  if (!user.value?.id) {
    submitError.value = 'Please sign in to place an order.'
    return
  }

  const intent = await createIntent({
    userId: user.value.id,
    cartId: cartId.value || '',
    shipTo: {
      name: form.value.name.trim(),
      email: form.value.email.trim(),
      phone: form.value.phone.trim(),
      address: form.value.address.trim(),
      city: form.value.city.trim(),
      state: form.value.state.trim(),
      country: countryDisplayName(form.value.country),
      pincode: form.value.pincode.trim(),
    },
    paymentTerm: paymentTerm.value,
  })

  serverOrder.value = { id: intent.order.id, orderNo: intent.order.orderNo, totalUsd: intent.order.totalUsd }

  // A terms order is already placed — nothing is charged, so there is no
  // second stage to run.
  if (intent.term === 'terms') {
    completeCheckout(intent.order.orderNo, intent.order.totalUsd)
    return
  }

  const stripe = intent.clientSecret ? await getStripeJs() : null
  if (!intent.clientSecret || !stripe) {
    throw new Error('Card payments are unavailable right now. Please contact us to complete your order.')
  }

  // The host is rendered with v-show, so it is in the DOM in both stages;
  // nextTick only guards against the very first render not having flushed.
  await nextTick()
  if (!paymentElementHost.value) throw new Error('Could not open the payment form. Please try again.')

  // Re-entering this step (after "Edit details") must replace the previous
  // element rather than mount a second one into the same host.
  paymentElement?.destroy()
  stripeElements = stripe.elements({
    clientSecret: intent.clientSecret,
    appearance: {
      theme: 'flat',
      variables: {
        colorPrimary: '#1c1c1c',
        colorBackground: '#ffffff',
        colorText: '#1c1c1c',
        borderRadius: '12px',
      },
    },
  })
  paymentElement = stripeElements.create('payment', { layout: 'tabs' })
  paymentElement.mount(paymentElementHost.value)
  // Only switch stages once the card form is actually up, so a failure above
  // leaves the customer on the details step instead of an empty payment step.
  stage.value = 'paying'
}

/** Stage two: confirm the card, then wait for the webhook to settle the order. */
async function completePayment() {
  if (!stripeElements || !serverOrder.value || !user.value?.id) {
    throw new Error('Your payment session expired. Please start again.')
  }

  const returnUrl = `${window.location.origin}/order-confirmation`
  const paymentIntent = await confirmPayment(stripeElements, returnUrl)

  // No error and no intent means the browser has no evidence either way, so ask
  // the server, which is the only authority on whether money moved. Showing a
  // confirmation on this path would invent an order out of nothing.
  if (!paymentIntent) {
    const order = await fetchOrderStatus(serverOrder.value.id, user.value.id)
    if (order?.paymentStatus !== 'SUCCESS') {
      throw new Error(
        'We could not confirm your payment. Your cart has been left as it is — please contact us before trying again so you are not charged twice.',
      )
    }
    paymentSettlement.value = 'settled'
    completeCheckout(serverOrder.value.orderNo, serverOrder.value.totalUsd)
    return
  }

  if (!['succeeded', 'processing'].includes(paymentIntent.status)) {
    throw new Error('Your payment was not completed. Please try another card.')
  }

  if (paymentIntent.status === 'processing') {
    // A slower method (bank debit, some wallets) that settles hours or days
    // later. The order is placed, but nothing may call it paid yet — polling
    // here would only burn four seconds to learn what we already know.
    paymentSettlement.value = 'pending'
  } else {
    // 'succeeded' means the money is taken, so the order stands regardless of
    // what the webhook does next — never block the customer here. If the
    // webhook has not landed in time the order is simply not yet reconciled.
    const settled = await waitForConfirmation(serverOrder.value.id, user.value.id)
    paymentSettlement.value = settled ? 'settled' : 'pending'
  }

  completeCheckout(serverOrder.value.orderNo, serverOrder.value.totalUsd)
}

async function handleSubmit() {
  if (isProcessing.value) return
  submitError.value = ''
  isProcessing.value = true
  try {
    if (!hasPricedItems.value) {
      // Quote-only cart: no order and nothing to charge.
      completeCheckout()
      return
    }
    if (stage.value === 'details') {
      await beginPayment()
    } else {
      await completePayment()
    }
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
  } finally {
    isProcessing.value = false
  }
}

// Going back to fix the address re-prices the cart on the next attempt, and the
// server reuses or retires the in-flight payment intent accordingly.
function backToDetails() {
  stage.value = 'details'
  paymentElement?.destroy()
  paymentElement = null
  stripeElements = null
  submitError.value = ''
}

onBeforeUnmount(() => {
  paymentElement?.destroy()
  paymentElement = null
  stripeElements = null
})

const submitLabel = computed(() => {
  if (isProcessing.value) {
    if (hasCustomizedItems.value && !hasPricedItems.value) return 'Creating your custom request…'
    if (stage.value === 'paying') return 'Confirming your payment…'
    return 'Placing your order…'
  }
  if (hasCustomizedItems.value && !hasPricedItems.value) {
    return `Create Custom Request · ${formattedDiscountedTotal.value}`
  }
  if (stage.value === 'paying') return `Pay ${formattedDiscountedTotal.value}`
  if (paymentTerm.value === 'terms') return `Place Order on Terms · ${formattedDiscountedTotal.value}`
  return `Continue to Payment · ${formattedDiscountedTotal.value}`
})


// Memo checkout: the pieces go out on consignment instead of being sold. No
// payment is taken, so this creates a Memo server-side (which re-checks the
// permission and the customer's limit) rather than an order.
async function handleMemo() {
  if (isMemoProcessing.value || isProcessing.value) return
  submitError.value = ''
  if (!user.value?.id) {
    submitError.value = 'Please sign in to take pieces on memo.'
    return
  }
  isMemoProcessing.value = true
  try {
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'memo',
        userId: user.value.id,
        shipTo: {
          name: form.value.name.trim(),
          email: form.value.email.trim(),
          phone: form.value.phone.trim(),
          address: form.value.address.trim(),
          city: form.value.city.trim(),
          state: form.value.state.trim(),
          country: countryDisplayName(form.value.country),
          pincode: form.value.pincode.trim(),
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to raise this memo.')
    persistCurrentAddress()
    // The server already emptied the cart; resync so the header count follows.
    await clearCart().catch(() => {})
    // A memo lands on its own confirmation page — no payment, no order number.
    router.push({ path: '/memo-confirmation', query: { memoId: data.memo.id, memoNo: data.memo.memoNo } })
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Unable to raise this memo.'
  } finally {
    isMemoProcessing.value = false
  }
}

const inputClass = 'ect-w-full ect-px-4 ect-py-3 ect-bg-white ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 ect-transition-all'

</script>

<template>
  <section class="ect-min-h-screen ect-bg-cream ect-pt-6 sm:ect-pt-14 ect-pb-28 ect-px-4 sm:ect-px-6">

    <!-- Empty cart state -->
    <article v-if="!items.length" class="ect-max-w-lg ect-mx-auto ect-text-center ect-py-28">
      <span class="ect-w-20 ect-h-20 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-mx-auto ect-mb-5">
        <svg class="ect-w-9 ect-h-9 ect-text-gold-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
      </span>
      <h1 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Nothing to checkout</h1>
      <p class="ect-font-body ect-text-base ect-text-charcoal/50 ect-mb-8">Add some pieces to your cart first.</p>
      <RouterLink to="/#collections" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-7 ect-py-3.5 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-full hover:ect-bg-noir ect-transition-colors">
        Browse Collections
      </RouterLink>
    </article>

    <!-- Checkout layout -->
    <article v-else class="ect-max-w-6xl ect-mx-auto">

      <!-- Page header -->
      <header class="ect-mb-8 sm:ect-mb-10">
        <p class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-2">
          <span class="ect-w-5 ect-h-px ect-bg-gold-400" /> Secure Checkout
        </p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">Complete Your Order</h1>
      </header>

      <!-- Steps indicator -->
      <nav class="ect-flex ect-items-center ect-gap-2 ect-mb-10 ect-select-none">
        <span class="ect-flex ect-items-center ect-gap-1.5">
          <span class="ect-w-6 ect-h-6 ect-rounded-full ect-bg-charcoal ect-text-white ect-flex ect-items-center ect-justify-center ect-font-body ect-text-xs ect-font-bold">1</span>
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700">Details</span>
        </span>
        <span class="ect-flex-1 ect-h-px ect-bg-sand ect-max-w-12" />
        <span class="ect-flex ect-items-center ect-gap-1.5">
          <span class="ect-w-6 ect-h-6 ect-rounded-full ect-bg-sand ect-text-charcoal/40 ect-flex ect-items-center ect-justify-center ect-font-body ect-text-xs ect-font-bold">2</span>
          <span class="ect-font-body ect-text-xs ect-text-charcoal/40">Review</span>
        </span>
        <span class="ect-flex-1 ect-h-px ect-bg-sand ect-max-w-12" />
        <span class="ect-flex ect-items-center ect-gap-1.5">
          <span class="ect-w-6 ect-h-6 ect-rounded-full ect-bg-sand ect-text-charcoal/40 ect-flex ect-items-center ect-justify-center ect-font-body ect-text-xs ect-font-bold">3</span>
          <span class="ect-font-body ect-text-xs ect-text-charcoal/40">Confirm</span>
        </span>
      </nav>

      <section class="ect-grid ect-grid-cols-1 lg:ect-grid-cols-3 ect-gap-8 lg:ect-gap-10">

        <!-- ── Left: Form ── -->
        <form @submit.prevent="handleSubmit" class="lg:ect-col-span-2 ect-space-y-6">

          <!-- Contact card -->
          <section class="ect-bg-white ect-rounded-2xl ect-p-5 sm:ect-p-6 ect-border ect-border-sand ect-shadow-card">
            <header class="ect-flex ect-items-center ect-gap-2.5 ect-mb-5">
              <span class="ect-w-8 ect-h-8 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                <svg class="ect-w-4 ect-h-4 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </span>
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/70">Contact Details</h2>
            </header>
            <section class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-4">
              <SavedAddressSelector
                v-model="selectedSavedId"
                :addresses="savedAddresses"
                class="sm:ect-col-span-2"
              />
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Full Name *</span>
                <input v-model="form.name" type="text" required autocomplete="name" placeholder="Olivia Smith" :class="inputClass" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Email Address *</span>
                <input v-model="form.email" type="email" required autocomplete="email" placeholder="olivia@example.com" :class="inputClass" />
              </label>
              <label class="ect-block sm:ect-col-span-2">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Phone Number *</span>
                <input v-model="form.phone" type="tel" required autocomplete="tel" placeholder="(212) 555-0147" :class="inputClass" />
              </label>
            </section>
          </section>

          <!-- Shipping card -->
          <section class="ect-bg-white ect-rounded-2xl ect-p-5 sm:ect-p-6 ect-border ect-border-sand ect-shadow-card">
            <header class="ect-flex ect-items-center ect-gap-2.5 ect-mb-5">
              <span class="ect-w-8 ect-h-8 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                <svg class="ect-w-4 ect-h-4 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </span>
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/70">Shipping Address</h2>
            </header>
            <section class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-4">
              <label class="ect-block sm:ect-col-span-2">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Street Address *</span>
                <input v-model="form.address" type="text" required autocomplete="street-address" placeholder="123 Main St, Apt 4B" :class="inputClass" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">City *</span>
                <input v-model="form.city" type="text" required autocomplete="address-level2" placeholder="New York" :class="inputClass" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">State *</span>
                <select v-model="form.state" required autocomplete="address-level1" :class="inputClass">
                  <option value="" disabled>Select a state</option>
                  <option v-for="state in US_STATES" :key="state.value" :value="state.value">{{ state.label }}</option>
                </select>
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Country</span>
                <p class="ect-w-full ect-px-4 ect-py-3 ect-bg-cream/60 ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-sm ect-text-charcoal/60">United States</p>
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">ZIP Code *</span>
                <input
                  v-model="form.pincode"
                  type="text"
                  required
                  inputmode="numeric"
                  autocomplete="postal-code"
                  pattern="[0-9]{5}(-[0-9]{4})?"
                  placeholder="10001"
                  title="Use a 5-digit ZIP code or ZIP+4 (for example, 10001-1234)"
                  :class="inputClass"
                />
              </label>
              <SavedAddressSavePanel
                v-if="selectedSavedId === ''"
                v-model="shouldSaveAddress"
                v-model:label="saveAsLabel"
                v-model:make-default="makeDefaultAddress"
                class="sm:ect-col-span-2"
              />
            </section>
          </section>

          <!-- Payment card: how this order gets settled. Customers an admin has
               approved for terms get the choice; everyone else pays up front. -->
          <section v-if="canPayTermsUser && !hasCustomizedItems" class="ect-bg-white ect-rounded-2xl ect-p-5 sm:ect-p-6 ect-border ect-border-sand ect-shadow-card">
            <header class="ect-flex ect-items-center ect-gap-2.5 ect-mb-5">
              <span class="ect-w-8 ect-h-8 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                <svg class="ect-w-4 ect-h-4 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
              </span>
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/70">Payment</h2>
            </header>
            <div role="radiogroup" aria-label="Payment option" class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-2.5">
              <label
                class="ect-flex ect-items-start ect-gap-3 ect-p-3.5 ect-rounded-xl ect-cursor-pointer ect-border ect-transition-all ect-duration-200"
                :class="paymentTerm === 'immediate'
                  ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
                  : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
              >
                <input v-model="paymentTerm" type="radio" value="immediate" class="ect-accent-charcoal ect-w-4 ect-h-4 ect-shrink-0 ect-mt-0.5" />
                <span class="ect-flex-1 ect-min-w-0">
                  <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-block">Pay immediately</span>
                  <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block">Settle the full amount now</span>
                </span>
              </label>
              <label
                class="ect-flex ect-items-start ect-gap-3 ect-p-3.5 ect-rounded-xl ect-cursor-pointer ect-border ect-transition-all ect-duration-200"
                :class="paymentTerm === 'terms'
                  ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
                  : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
              >
                <input v-model="paymentTerm" type="radio" value="terms" class="ect-accent-charcoal ect-w-4 ect-h-4 ect-shrink-0 ect-mt-0.5" />
                <span class="ect-flex-1 ect-min-w-0">
                  <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-block">Payment terms · Net {{ paymentTermDays }}</span>
                  <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block">Pay by {{ formattedDueDate }}</span>
                </span>
              </label>
            </div>
            <p v-if="paymentTerm === 'terms'" class="ect-mt-3 ect-font-body ect-text-xs ect-text-charcoal/45">
              Your account is approved for payment terms. The pieces ship now and the full {{ volumeDiscountTier ? formattedDiscountedTotal : formattedTotal }} is due by {{ formattedDueDate }}.
            </p>
          </section>

          <!-- Stripe's Payment Element. It only appears once the server has
               priced the cart and opened an order, so the amount shown on the
               card form is the one the server will charge.

               Deliberately NOT inside the payment-terms card above: every card
               order needs this form, and that card is only rendered for accounts
               an admin approved for terms. Nesting it there left everyone else —
               and any mixed cart — with no way to enter a card at all.

               v-show rather than v-if because beginPayment mounts into this host
               before flipping the stage, so the element has to already exist. -->
          <section
            v-show="stage === 'paying'"
            class="ect-bg-white ect-rounded-2xl ect-p-5 sm:ect-p-6 ect-border ect-border-sand ect-shadow-card"
          >
            <div class="ect-flex ect-items-center ect-justify-between ect-mb-4">
              <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">
                Card details
                <span v-if="serverOrder" class="ect-font-normal ect-text-charcoal/45"> · {{ serverOrder.orderNo }}</span>
              </p>
              <button
                type="button"
                :disabled="isProcessing"
                class="ect-font-body ect-text-xs ect-text-gold-700 hover:ect-text-gold-800 ect-underline ect-underline-offset-2 disabled:ect-opacity-50"
                @click="backToDetails"
              >
                Edit details
              </button>
            </div>
            <div ref="paymentElementHost" />
          </section>

          <!-- Error alert -->
          <section v-if="submitError" class="ect-flex ect-items-start ect-gap-3 ect-p-4 ect-rounded-xl ect-bg-red-50 ect-border ect-border-red-200/60">
            <svg class="ect-w-5 ect-h-5 ect-text-red-500 ect-shrink-0 ect-mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p class="ect-font-body ect-text-sm ect-text-red-700">{{ submitError }}</p>
          </section>

          <section
            v-if="hasCustomizedItems"
            class="ect-flex ect-items-start ect-gap-3 ect-rounded-xl ect-border ect-border-amber-200/70 ect-bg-amber-50/80 ect-p-4"
          >
            <svg class="ect-mt-0.5 ect-h-5 ect-w-5 ect-shrink-0 ect-text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 9h1.5v1.5h-1.5zM12 6.75h.008v.008H12V6.75zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="ect-font-body ect-text-sm ect-leading-6 ect-text-amber-900">
              This cart contains customized jewellery. On checkout, we’ll create a custom request for our team to review instead of a standard order.
            </p>
          </section>

          <!-- Submit button -->
          <button
            type="submit"
            :disabled="isProcessing"
            class="ect-w-full ect-py-4 ect-font-body ect-text-base ect-font-semibold ect-rounded-xl ect-flex ect-items-center ect-justify-center ect-gap-2.5 ect-transition-all ect-duration-200 ect-shadow-sm disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
            :class="isProcessing ? 'ect-bg-charcoal/70 ect-text-white' : 'ect-bg-charcoal ect-text-white hover:ect-bg-noir ect-shadow-luxe-sm hover:ect-shadow-luxe'"
          >
            <svg v-if="isProcessing" class="ect-w-5 ect-h-5 ect-animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="ect-opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="ect-opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <svg v-else class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ submitLabel }}</span>
          </button>

          <!-- Memo checkout: only for accounts an admin has approved for it. -->
          <button
            v-if="canMemoUser && !hasCustomizedItems"
            type="button"
            :disabled="isProcessing || isMemoProcessing"
            class="ect-w-full ect-py-4 ect-font-body ect-text-base ect-font-semibold ect-rounded-xl ect-flex ect-items-center ect-justify-center ect-gap-2.5 ect-border ect-border-charcoal/20 ect-bg-white ect-text-charcoal hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-all ect-duration-200 disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
            @click="handleMemo"
          >
            <svg v-if="isMemoProcessing" class="ect-w-5 ect-h-5 ect-animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="ect-opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="ect-opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <svg v-else class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <span>{{ isMemoProcessing ? 'Raising your memo…' : `Take on Memo · ${formattedTotal}` }}</span>
          </button>
          <p v-if="canMemoUser && !hasCustomizedItems" class="ect-text-center ect-font-body ect-text-xs ect-text-charcoal/45 ect--mt-2">
            Nothing is charged now. The pieces stay ours until you buy or return them.
          </p>

          <!-- Security note -->
          <p class="ect-text-center ect-font-body ect-text-xs ect-text-charcoal/40 ect-flex ect-items-center ect-justify-center ect-gap-1.5 ect--mt-2">
            <svg class="ect-w-3.5 ect-h-3.5 ect-text-charcoal/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            256-bit SSL encrypted · Your data is safe with us
          </p>
        </form>

        <!-- ── Right: Order summary ── -->
        <aside class="lg:ect-sticky lg:ect-top-36 ect-h-fit ect-space-y-4">

          <!-- Summary card -->
          <section class="ect-bg-white ect-rounded-2xl ect-p-5 sm:ect-p-6 ect-border ect-border-sand ect-shadow-card">
            <h2 class="ect-font-display ect-text-xl ect-font-medium ect-text-charcoal ect-mb-5">Order Summary</h2>

            <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3 ect-mb-5">
              <li v-for="item in items" :key="item.id" class="ect-flex ect-items-center ect-gap-3">
                <span class="ect-w-12 ect-h-12 ect-rounded-xl ect-overflow-hidden ect-bg-champagne/50 ect-shrink-0 ect-relative">
                  <img v-if="item.product.images?.length" :src="item.product.images[0]" :alt="item.product.title" loading="lazy" decoding="async" class="ect-w-full ect-h-full ect-object-cover" />
                  <span v-else class="ect-w-full ect-h-full ect-flex ect-items-center ect-justify-center">
                    <svg class="ect-w-5 ect-h-5 ect-text-gold-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                  </span>
                  <span class="ect-absolute -ect-top-1.5 -ect-right-1.5 ect-w-5 ect-h-5 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-[10px] ect-font-bold ect-flex ect-items-center ect-justify-center">{{ item.qty }}</span>
                </span>
                <section class="ect-flex-1 ect-min-w-0">
                  <p class="ect-font-body ect-text-sm ect-font-medium ect-text-charcoal ect-truncate">{{ item.product.title }}</p>
                  <p class="ect-font-body ect-text-xs ect-text-charcoal/50">{{ item.product.category }}</p>
                </section>
                <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-whitespace-nowrap">{{ item.product.price }}</span>
              </li>
            </ul>

            <hr class="ect-border-sand ect-mb-4" />

            <section class="ect-space-y-2 ect-mb-4">
              <article class="ect-flex ect-justify-between">
                <span class="ect-font-body ect-text-sm ect-text-charcoal/60">Subtotal</span>
                <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ formattedTotal }}</span>
              </article>
              <article v-if="volumeDiscountTier" class="ect-flex ect-justify-between">
                <span class="ect-font-body ect-text-sm ect-text-gold-600">Volume discount ({{ discountPercent }}%)</span>
                <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-gold-600">− {{ formattedDiscount }}</span>
              </article>
              <article class="ect-flex ect-justify-between">
                <span class="ect-font-body ect-text-sm ect-text-charcoal/60">Shipping</span>
                <span class="ect-font-body ect-text-sm ect-font-medium ect-text-emerald-600">Free</span>
              </article>
              <article class="ect-flex ect-justify-between">
                <span class="ect-font-body ect-text-sm ect-text-charcoal/60">GST</span>
                <span class="ect-font-body ect-text-sm ect-text-charcoal/60">Included</span>
              </article>
            </section>

            <hr class="ect-border-sand ect-mb-4" />

            <article class="ect-flex ect-justify-between ect-items-baseline ect-mb-1">
              <span class="ect-font-display ect-text-lg ect-text-charcoal">Total</span>
              <span class="ect-font-display ect-text-2xl ect-text-charcoal">{{ volumeDiscountTier ? formattedDiscountedTotal : formattedTotal }}</span>
            </article>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-text-right">GST included in price</p>
            <p v-if="paymentTerm === 'terms'" class="ect-font-body ect-text-xs ect-text-gold-700 ect-text-right ect-mt-1">
              On payment terms · due {{ formattedDueDate }}
            </p>
          </section>

          <!-- Hallmark & assurance -->
          <section class="ect-bg-gradient-to-br ect-from-champagne/60 ect-to-cream ect-rounded-2xl ect-p-5 ect-border ect-border-sand">
            <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-wider ect-text-gold-700 ect-mb-3">Our Promise</p>
            <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-2.5">
              <li v-for="promise in [
                'BIS Hallmarked & certified purity',
                'Insured & secure delivery',
                'Luxury gift packaging included',
                '7-day hassle-free returns',
              ]" :key="promise" class="ect-flex ect-items-center ect-gap-2">
                <svg class="ect-w-3.5 ect-h-3.5 ect-text-gold-600 ect-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                </svg>
                <span class="ect-font-body ect-text-xs ect-text-charcoal/70">{{ promise }}</span>
              </li>
            </ul>
          </section>

        </aside>
      </section>
    </article>
  </section>
</template>
