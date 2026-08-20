<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useOrders } from '../composables/useOrders'

const route = useRoute()
const { orders } = useOrders()

const confirmationKind = computed(() => {
  const kind = String(route.query.kind || '').trim().toLowerCase()
  if (kind === 'service') return 'service'
  if (kind === 'memo') return 'memo'
  return 'order'
})

const referenceNumber = computed(() => {
  const memoNo = String(route.query.memoNo || '').trim()
  if (memoNo) return memoNo
  const fromQuery = String(route.query.orderId || '').trim()
  if (fromQuery) return fromQuery
  const fromReference = String(route.query.reference || '').trim()
  if (fromReference) return fromReference
  return orders.value[0]?.id || 'ORD-000000'
})
</script>

<template>
  <section class="ect-pt-6 sm:ect-pt-14 ect-pb-24 ect-px-6">
    <article class="ect-max-w-2xl ect-mx-auto ect-text-center">
      <svg class="ect-w-20 ect-h-20 ect-text-gold-600 ect-mx-auto ect-mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>

      <h1 class="ect-font-display ect-text-4xl sm:ect-text-5xl ect-font-light ect-text-charcoal ect-mb-4">
        {{ confirmationKind === 'service' ? 'Custom Request Received!' : confirmationKind === 'memo' ? 'Memo Raised!' : 'Order Placed!' }}
      </h1>
      <p class="ect-font-body ect-text-lg ect-text-charcoal/60 ect-mb-2">
        {{ confirmationKind === 'service'
          ? 'Thank you for sharing your custom jewellery requirements with Kiana Jewels.'
          : confirmationKind === 'memo'
            ? 'The pieces are going out to you on memo. Nothing has been charged.'
            : 'Thank you for shopping with Kiana Jewels.' }}
      </p>
      <p class="ect-font-body ect-text-base ect-text-charcoal/50 ect-mb-10">
        {{ confirmationKind === 'service' ? 'Your request reference is ' : confirmationKind === 'memo' ? 'Your memo number is ' : 'Your order number is ' }}
        <span class="ect-font-semibold ect-text-charcoal">{{ referenceNumber }}</span>
      </p>

      <section class="ect-bg-charcoal/[0.03] ect-rounded-sm ect-p-8 ect-mb-10 ect-text-left">
        <h2 class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-mb-4">What happens next?</h2>
        <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-4">
          <li class="ect-flex ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-bold ect-shrink-0">1</span>
            <span class="ect-font-body ect-text-base ect-text-charcoal/70">
              {{ confirmationKind === 'service'
                ? 'You’ll receive a confirmation email for your custom request shortly.'
                : confirmationKind === 'memo'
                  ? 'We’ll prepare the pieces and send them out to you on memo.'
                  : 'You’ll receive an order confirmation email shortly.' }}
            </span>
          </li>
          <li class="ect-flex ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-bold ect-shrink-0">2</span>
            <span class="ect-font-body ect-text-base ect-text-charcoal/70">
              {{ confirmationKind === 'service'
                ? 'Our team will review the customization details and contact you to confirm the next steps.'
                : confirmationKind === 'memo'
                  ? 'The pieces remain ours while they are with you — keep what sells, send back the rest.'
                  : 'Our artisans will prepare your piece with care.' }}
            </span>
          </li>
          <li class="ect-flex ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-bold ect-shrink-0">3</span>
            <span class="ect-font-body ect-text-base ect-text-charcoal/70">
              {{ confirmationKind === 'service'
                ? 'Once approved, we’ll guide you through production timelines, pricing, and delivery.'
                : confirmationKind === 'memo'
                  ? 'We’ll invoice you for whatever you keep, at the prices locked when the goods went out.'
                  : 'Free insured delivery within 5-7 business days.' }}
            </span>
          </li>
        </ul>
      </section>

      <RouterLink to="/" class="ect-inline-block ect-px-8 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-base ect-font-semibold ect-rounded-sm hover:ect-bg-noir ect-transition-colors">Back to Home</RouterLink>
    </article>
  </section>
</template>
