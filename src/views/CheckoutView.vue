<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCart, isCustomizedCartItem } from '../composables/useCart'
import { useOrders } from '../composables/useOrders'
import { useQuotes } from '../composables/useQuotes'
import { useSavedAddresses, COUNTRY_OPTIONS, countryDisplayName } from '../composables/useSavedAddresses'
import { notifyTransaction } from '../composables/notifyTransactionEmail'

const router = useRouter()
const {
  items,
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
const { addresses: savedAddresses, getById, save: saveAddress } = useSavedAddresses()
const isProcessing = ref(false)
const submitError = ref('')

const form = ref({
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  country: 'IN',
  pincode: '',
})

const selectedSavedId = ref('')
const saveAsLabel = ref('')
const saveAddressMessage = ref('')


const knownCountryCodes = new Set<string>(COUNTRY_OPTIONS.map((c) => c.code))

watch(selectedSavedId, (id, prevId) => {
  if (!id) {
    if (prevId) {
      form.value.name = ''
      form.value.email = ''
      form.value.phone = ''
      form.value.address = ''
      form.value.city = ''
      form.value.state = ''
      form.value.country = 'IN'
      form.value.pincode = ''
      saveAddressMessage.value = ''
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
  form.value.state = a.state
  let c = a.country.trim()
  if (c === 'India') c = 'IN'
  form.value.country = knownCountryCodes.has(c) ? c : 'OTHER'
  form.value.pincode = a.pincode
})

function saveCurrentAddress() {
  saveAddressMessage.value = ''
  const label = saveAsLabel.value.trim()
  if (!label) {
    saveAddressMessage.value = 'Enter a short name (e.g. Home, Office) to save this address.'
    return
  }
  if (
    !form.value.address.trim() ||
    !form.value.city.trim() ||
    !form.value.state.trim() ||
    !form.value.pincode.trim()
  ) {
    saveAddressMessage.value = 'Fill in street, city, state, postal code, and country first.'
    return
  }
  if (!form.value.name.trim() || !form.value.email.trim() || !form.value.phone.trim()) {
    saveAddressMessage.value = 'Fill in contact details before saving.'
    return
  }
  saveAddress({
    label,
    name: form.value.name.trim(),
    email: form.value.email.trim(),
    phone: form.value.phone.trim(),
    address: form.value.address.trim(),
    city: form.value.city.trim(),
    state: form.value.state.trim(),
    country: form.value.country,
    pincode: form.value.pincode.trim(),
  })
  saveAsLabel.value = ''
  saveAddressMessage.value = 'Saved. Choose it from Saved shipping address in Contact details anytime.'
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

function finalizeStandardOrder() {
  const snapshot = [...items]
  const order = addOrder(snapshot, discountedTotal.value)
  void notifyTransaction({
    kind: 'order',
    orderId: order.id,
    customerName: form.value.name.trim(),
    customerEmail: form.value.email.trim(),
    customerPhone: form.value.phone.trim(),
    address: form.value.address.trim(),
    city: form.value.city.trim(),
    state: form.value.state.trim(),
    country: countryDisplayName(form.value.country),
    pincode: form.value.pincode.trim(),
    formattedTotal: formattedDiscountedTotal.value,
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

function finalizeCheckout() {
  if (!hasCustomizedItems.value) return finalizeStandardOrder()

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
    const order = addOrder(snapshot, nonCustomTotal)
    void notifyTransaction({
      kind: 'order',
      orderId: order.id,
      customerName: form.value.name.trim(),
      customerEmail: form.value.email.trim(),
      customerPhone: form.value.phone.trim(),
      address: form.value.address.trim(),
      city: form.value.city.trim(),
      state: form.value.state.trim(),
      country: countryDisplayName(form.value.country),
      pincode: form.value.pincode.trim(),
      formattedTotal: '$' + nonCustomTotal.toLocaleString('en-US'),
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

function handleSubmit() {
  submitError.value = ''
  isProcessing.value = true
  try {
    setTimeout(() => {
      const destination = finalizeCheckout()
      clearCart()
      router.push({ path: '/order-confirmation', query: destination.query })
    }, 1200)
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
    isProcessing.value = false
  }
}

const inputClass = 'ect-w-full ect-px-4 ect-py-3 ect-bg-white ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 ect-transition-all'

const pinPlaceholder = computed(() => (form.value.country === 'IN' ? '400001' : 'Postal / ZIP code'))
const pinTitle = computed(() => (form.value.country === 'IN' ? '6-digit PIN code' : 'Postal code'))
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
              <div v-if="savedAddresses.length" role="radiogroup" aria-label="Saved shipping address" class="ect-block sm:ect-col-span-2">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Saved shipping address</span>
                <div class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-2.5">
                  <label
                    v-for="a in savedAddresses"
                    :key="a.id"
                    class="ect-flex ect-items-start ect-gap-3 ect-p-3.5 ect-rounded-xl ect-cursor-pointer ect-border ect-transition-all ect-duration-200"
                    :class="selectedSavedId === a.id
                      ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
                      : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
                  >
                    <input v-model="selectedSavedId" type="radio" :value="a.id" class="ect-accent-charcoal ect-w-4 ect-h-4 ect-shrink-0 ect-mt-0.5" />
                    <span class="ect-flex-1 ect-min-w-0">
                      <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-block ect-truncate">{{ a.label }}</span>
                      <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block ect-truncate">{{ a.address }}</span>
                      <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block ect-truncate">{{ a.city }}, {{ a.state }} {{ a.pincode }} · {{ countryDisplayName(a.country) }}</span>
                    </span>
                    <span v-if="selectedSavedId === a.id" class="ect-w-5 ect-h-5 ect-rounded-full ect-bg-champagne/500 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                      <svg class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </span>
                  </label>
                  <label
                    class="ect-flex ect-items-start ect-gap-3 ect-p-3.5 ect-rounded-xl ect-cursor-pointer ect-border ect-transition-all ect-duration-200"
                    :class="selectedSavedId === ''
                      ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
                      : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
                  >
                    <input v-model="selectedSavedId" type="radio" value="" class="ect-accent-charcoal ect-w-4 ect-h-4 ect-shrink-0 ect-mt-0.5" />
                    <span class="ect-flex-1 ect-min-w-0">
                      <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-block">Use a new address</span>
                      <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block">Enter details manually below</span>
                    </span>
                    <span v-if="selectedSavedId === ''" class="ect-w-5 ect-h-5 ect-rounded-full ect-bg-champagne/500 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                      <svg class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </span>
                  </label>
                </div>
                <span class="ect-mt-1.5 ect-block ect-font-body ect-text-[11px] ect-text-charcoal/40">Selecting a saved address fills your contact details and shipping address.</span>
              </div>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Full Name *</span>
                <input v-model="form.name" type="text" required placeholder="Priya Sharma" :class="inputClass" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Email Address *</span>
                <input v-model="form.email" type="email" required placeholder="priya@example.com" :class="inputClass" />
              </label>
              <label class="ect-block sm:ect-col-span-2">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Mobile Number *</span>
                <input v-model="form.phone" type="tel" required placeholder="+91 98765 43210" :class="inputClass" />
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
                <input v-model="form.address" type="text" required placeholder="Flat / House no., Street, Area" :class="inputClass" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">City *</span>
                <input v-model="form.city" type="text" required placeholder="Mumbai" :class="inputClass" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">State / Province *</span>
                <input v-model="form.state" type="text" required placeholder="Maharashtra" :class="inputClass" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Country *</span>
                <select v-model="form.country" required :class="inputClass">
                  <option v-for="c in COUNTRY_OPTIONS" :key="c.code" :value="c.code">{{ c.name }}</option>
                </select>
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Postal code *</span>
                <input
                  v-model="form.pincode"
                  type="text"
                  required
                  :pattern="form.country === 'IN' ? '[0-9]{6}' : undefined"
                  :placeholder="pinPlaceholder"
                  :title="pinTitle"
                  :class="inputClass"
                />
              </label>
              <div class="ect-block sm:ect-col-span-2 ect-flex ect-flex-col sm:ect-flex-row sm:ect-items-end ect-gap-3">
                <label class="ect-flex-1 ect-w-full ect-block">
                  <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">Save as <span class="ect-font-normal ect-text-charcoal/40">(optional)</span></span>
                  <input v-model="saveAsLabel" type="text" placeholder="e.g. Home, Office" :class="inputClass" />
                </label>
                <button type="button" class="ect-w-full sm:ect-w-auto ect-shrink-0 ect-px-5 ect-py-3 ect-rounded-xl ect-border ect-border-charcoal/30 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal hover:ect-bg-cream ect-transition-colors" @click="saveCurrentAddress">
                  Save address
                </button>
              </div>
              <p v-if="saveAddressMessage" class="ect-font-body ect-text-sm sm:ect-col-span-2" :class="saveAddressMessage.startsWith('Saved') ? 'ect-text-emerald-700' : 'ect-text-amber-800'">{{ saveAddressMessage }}</p>
            </section>
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
            <span>
              {{ isProcessing
                ? (hasCustomizedItems ? 'Creating your custom request…' : 'Placing your order…')
                : (hasCustomizedItems ? `Create Custom Request · ${formattedDiscountedTotal}` : `Place Order · ${formattedDiscountedTotal}`) }}
            </span>
          </button>

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
