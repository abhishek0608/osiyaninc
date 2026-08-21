<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useMemos, memoDueLabel } from '../composables/useMemos'

// A memo is not an order: nothing was charged, the pieces stay ours, and the
// date that matters is when they are due back. That is a different page from
// the order confirmation, not a variant of it — so this view stands on its own
// and reads the real memo (due date, pieces) rather than echoing the query.
const route = useRoute()
const { memos, allowance, load, loading } = useMemos()

onMounted(() => void load(true))

const memoNo = computed(() => String(route.query.memoNo || '').trim())
const memoId = computed(() => String(route.query.memoId || '').trim())

const memo = computed(() => {
  if (memoId.value) {
    const byId = memos.value.find((m) => m.id === memoId.value)
    if (byId) return byId
  }
  return memos.value.find((m) => m.memoNo === memoNo.value) || null
})

const reference = computed(() => memo.value?.memoNo || memoNo.value || '—')

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <section class="ect-pt-6 sm:ect-pt-14 ect-pb-24 ect-px-4 sm:ect-px-6 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream ect-min-h-screen">
    <article class="ect-max-w-2xl ect-mx-auto">
      <header class="ect-text-center ect-mb-10">
        <svg class="ect-w-20 ect-h-20 ect-text-gold-600 ect-mx-auto ect-mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h1 class="ect-font-display ect-text-4xl sm:ect-text-5xl ect-font-light ect-text-charcoal ect-mb-4">Memo Raised</h1>
        <p class="ect-font-body ect-text-lg ect-text-charcoal/60 ect-mb-2">
          The pieces are going out to you on memo. Nothing has been charged.
        </p>
        <p class="ect-font-body ect-text-base ect-text-charcoal/50">
          Your memo number is <span class="ect-font-semibold ect-text-charcoal">{{ reference }}</span>
        </p>
      </header>

      <!-- The memo's own facts: dates and pieces, never a total to pay. -->
      <section class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-6 sm:ect-p-8 ect-mb-6">
        <div v-if="loading && !memo" class="ect-flex ect-flex-col ect-gap-3">
          <span v-for="n in 3" :key="n" class="ect-h-5 ect-rounded ect-bg-champagne/50 ect-animate-pulse"></span>
        </div>

        <template v-else-if="memo">
          <div class="ect-grid ect-grid-cols-2 sm:ect-grid-cols-3 ect-gap-4 ect-mb-6">
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Issued</p>
              <p class="ect-font-display ect-text-base ect-font-medium ect-text-charcoal">{{ formatDate(memo.issuedAt) }}</p>
            </div>
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Due back</p>
              <p class="ect-font-display ect-text-base ect-font-medium ect-text-charcoal">{{ formatDate(memo.dueDate) }}</p>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ memoDueLabel(memo) }}</p>
            </div>
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Value out</p>
              <p class="ect-font-display ect-text-base ect-font-medium ect-text-charcoal">{{ memo.formattedSubtotal }}</p>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/45">not charged</p>
            </div>
          </div>

          <ul class="ect-list-none ect-m-0 ect-p-0 ect-flex ect-flex-col ect-gap-2 ect-border-t ect-border-sand ect-pt-4">
            <li v-for="item in memo.items" :key="item.id" class="ect-flex ect-flex-wrap ect-gap-x-2 ect-items-baseline">
              <span class="ect-font-body ect-text-sm ect-text-charcoal">{{ item.title }}</span>
              <span class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ item.formattedPrice }} · {{ item.qty }} out</span>
            </li>
          </ul>
        </template>

        <p v-else class="ect-font-body ect-text-sm ect-text-charcoal/60">
          Your memo is raised. Open My Memos for the pieces, the due date and the option to extend it.
        </p>
      </section>

      <section class="ect-bg-charcoal/[0.03] ect-rounded-2xl ect-p-6 sm:ect-p-8 ect-mb-8">
        <h2 class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-mb-4">What happens next?</h2>
        <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-4">
          <li class="ect-flex ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-bold ect-shrink-0">1</span>
            <span class="ect-font-body ect-text-base ect-text-charcoal/70">We’ll prepare the pieces and send them out to you on memo.</span>
          </li>
          <li class="ect-flex ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-bold ect-shrink-0">2</span>
            <span class="ect-font-body ect-text-base ect-text-charcoal/70"
              >They stay ours while they are with you — keep what sells, send back the rest{{
                allowance ? `, within ${allowance.memoDays} days` : ''
              }}.</span
            >
          </li>
          <li class="ect-flex ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-bold ect-shrink-0">3</span>
            <span class="ect-font-body ect-text-base ect-text-charcoal/70">
              Need longer? In the memo’s last {{ memo?.extendWindowDays || 3 }} days you can extend it yourself from My Memos.
            </span>
          </li>
          <li class="ect-flex ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-bold ect-shrink-0">4</span>
            <span class="ect-font-body ect-text-base ect-text-charcoal/70">
              We’ll invoice you for whatever you keep, at the prices locked when the goods went out.
            </span>
          </li>
        </ul>
      </section>

      <div class="ect-flex ect-flex-wrap ect-justify-center ect-gap-3">
        <RouterLink to="/memos" class="ect-inline-block ect-px-8 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-base ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors">View My Memos</RouterLink>
        <RouterLink to="/" class="ect-inline-block ect-px-8 ect-py-3 ect-border ect-border-charcoal/20 ect-text-charcoal ect-font-body ect-text-base ect-font-semibold ect-rounded-xl hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors">Back to Home</RouterLink>
      </div>
    </article>
  </section>
</template>
