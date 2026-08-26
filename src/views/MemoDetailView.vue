<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import {
  useMemos,
  isOpenMemo,
  memoDueLabel,
  memoExtendHint,
  memoStatusLabel,
  type Memo,
  type MemoItem,
} from '../composables/useMemos'

const route = useRoute()
const { isLoggedIn } = useAuth()
const { memos, allowance, settled, error, load, extend, extendingId, extendError, extendMessage } =
  useMemos()

onMounted(() => void load())

// Memos are always fetched as the account's full list, so the detail page just
// picks its memo out of that — no separate single-memo endpoint to secure.
const memo = computed<Memo | null>(
  () => memos.value.find((m) => m.id === String(route.params.id || '')) || null
)

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMoney(usd: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: memo.value?.currency || 'USD',
    maximumFractionDigits: 0,
  }).format(usd || 0)
}

function statusPillClass(m: Memo) {
  if (m.isOverdue) return 'ect-bg-red-50 ect-text-red-700'
  if (m.status === 'CONVERTED') return 'ect-bg-emerald-50 ect-text-emerald-700'
  if (m.status === 'RETURNED' || m.status === 'CANCELLED') return 'ect-bg-charcoal/5 ect-text-charcoal/60'
  return 'ect-bg-champagne ect-text-gold-800'
}

function itemPillClass(item: MemoItem) {
  if (item.status === 'OUT') return 'ect-bg-champagne ect-text-gold-800'
  if (item.status === 'CONVERTED') return 'ect-bg-emerald-50 ect-text-emerald-700'
  return 'ect-bg-charcoal/5 ect-text-charcoal/60'
}

function itemPillLabel(item: MemoItem) {
  if (item.status === 'OUT') return 'With you'
  if (item.status === 'CONVERTED') return 'Purchased'
  return 'Returned'
}

function itemQtyLine(item: MemoItem) {
  const parts = [`${item.formattedPrice} each`, `${item.qty} issued`]
  if (item.returnedQty) parts.push(`${item.returnedQty} returned`)
  if (item.convertedQty) parts.push(`${item.convertedQty} purchased`)
  if (item.outQty) parts.push(`${item.outQty} still with you`)
  return parts.join(' · ')
}

// The ship-to snapshot has no fixed shape beyond these keys, so it renders as
// address lines rather than labeled fields.
const shipToLines = computed(() => {
  const shipTo = memo.value?.shipTo
  if (!shipTo) return []
  const cityLine = [shipTo.city, shipTo.state, shipTo.pincode].filter(Boolean).join(', ')
  return [shipTo.name, shipTo.address, cityLine, shipTo.country, shipTo.phone, shipTo.email].filter(
    (line): line is string => Boolean(line)
  )
})

const pieceCount = computed(() =>
  (memo.value?.items || []).reduce((sum, item) => sum + item.qty, 0)
)
</script>

<template>
  <section class="ect-pt-6 ect-pb-24 ect-px-4 sm:ect-px-6 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream ect-min-h-screen">
    <article class="ect-max-w-3xl ect-mx-auto">
      <RouterLink
        to="/memos"
        class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors ect-mb-6"
      >
        <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        My Memos
      </RouterLink>

      <!-- Signed out -->
      <section v-if="!isLoggedIn" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-p-8 sm:ect-p-10 ect-text-center">
        <h1 class="ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Sign in to see this memo</h1>
        <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-mb-8 ect-max-w-sm ect-mx-auto">Memos are tied to your account, so we need you signed in to show what is out with you.</p>
        <RouterLink to="/login" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors">
          Sign In
        </RouterLink>
      </section>

      <!-- Loading -->
      <section v-else-if="!settled" class="ect-flex ect-flex-col ect-gap-4">
        <span class="ect-h-20 ect-rounded-2xl ect-bg-white/70 ect-border ect-border-sand ect-animate-pulse"></span>
        <span class="ect-h-24 ect-rounded-2xl ect-bg-white/70 ect-border ect-border-sand ect-animate-pulse"></span>
        <span class="ect-h-40 ect-rounded-2xl ect-bg-white/70 ect-border ect-border-sand ect-animate-pulse"></span>
      </section>

      <template v-else-if="memo">
        <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>
        <p v-if="extendError" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ extendError }}</p>
        <p v-else-if="extendMessage" class="ect-font-body ect-text-sm ect-text-emerald-700 ect-mb-4">{{ extendMessage }}</p>

        <!-- Header -->
        <header class="ect-mb-6 ect-flex ect-flex-wrap ect-items-start ect-gap-4">
          <span class="ect-flex-1 ect-min-w-0">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">Account · Memo</p>
            <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">{{ memo.memoNo }}</h1>
            <p class="ect-font-body ect-text-sm ect-text-charcoal/60 ect-mt-1">
              Issued {{ formatDate(memo.issuedAt) }} · {{ pieceCount }} {{ pieceCount === 1 ? 'piece' : 'pieces' }}
            </p>
            <p v-if="!isOpenMemo(memo) && memo.closedAt" class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">
              Closed {{ formatDate(memo.closedAt) }}
            </p>
          </span>
          <span
            class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-3 ect-py-1.5 ect-rounded-full ect-font-body ect-text-xs ect-font-medium ect-shrink-0"
            :class="statusPillClass(memo)"
          >{{ memoStatusLabel(memo) }}</span>
        </header>

        <!-- Summary tiles -->
        <section class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-3 ect-gap-3 ect-mb-5">
          <div class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-4 sm:ect-p-5">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Still with you</p>
            <p class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">{{ memo.formattedOutstanding }}</p>
          </div>
          <div class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-4 sm:ect-p-5">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Issued value</p>
            <p class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">{{ memo.formattedSubtotal }}</p>
          </div>
          <div class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-4 sm:ect-p-5">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">
              {{ isOpenMemo(memo) ? 'Due back' : 'Closed' }}
            </p>
            <p
              class="ect-font-display ect-text-lg ect-font-medium"
              :class="memo.isOverdue ? 'ect-text-red-600' : 'ect-text-charcoal'"
            >{{ formatDate(isOpenMemo(memo) ? memo.dueDate : memo.closedAt || memo.dueDate) }}</p>
            <p
              v-if="isOpenMemo(memo)"
              class="ect-font-body ect-text-xs ect-mt-0.5"
              :class="memo.isOverdue ? 'ect-text-red-600 ect-font-semibold' : 'ect-text-charcoal/50'"
            >{{ memoDueLabel(memo) }}</p>
          </div>
        </section>

        <!-- Pieces -->
        <section class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-px-5 sm:ect-px-6 ect-mb-5">
          <ul class="ect-list-none ect-m-0 ect-p-0 ect-divide-y ect-divide-sand">
            <li
              v-for="item in memo.items"
              :key="item.id"
              class="ect-flex ect-flex-wrap ect-items-baseline ect-gap-x-3 ect-gap-y-1 ect-py-4"
            >
              <span class="ect-flex-1 ect-min-w-[200px]">
                <span
                  class="ect-block ect-font-body ect-text-sm ect-font-medium"
                  :class="item.outQty ? 'ect-text-charcoal' : 'ect-text-charcoal/55'"
                >{{ item.title }}</span>
                <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-0.5">{{ itemQtyLine(item) }}</span>
              </span>
              <span
                class="ect-inline-flex ect-items-center ect-px-2.5 ect-py-0.5 ect-rounded-full ect-font-body ect-text-[11px] ect-font-medium"
                :class="itemPillClass(item)"
              >{{ itemPillLabel(item) }}</span>
              <span
                class="ect-font-display ect-text-base ect-min-w-[64px] ect-text-right"
                :class="item.outQty ? 'ect-text-charcoal' : 'ect-text-charcoal/45'"
              >{{ formatMoney(item.pricePaise * item.qty) }}</span>
            </li>
          </ul>
        </section>

        <!-- Ship-to & notes -->
        <section v-if="shipToLines.length || memo.notes || memo.extensionCount" class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-3 ect-mb-5">
          <div v-if="shipToLines.length" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-4 sm:ect-p-5">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-2">Shipped to</p>
            <p class="ect-font-body ect-text-sm ect-text-charcoal/75 ect-leading-body-relaxed">
              <span v-for="(line, index) in shipToLines" :key="index" class="ect-block">{{ line }}</span>
            </p>
          </div>
          <div v-if="memo.notes || memo.extensionCount" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-4 sm:ect-p-5">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-2">Notes</p>
            <p v-if="memo.notes" class="ect-font-body ect-text-sm ect-text-charcoal/75 ect-leading-body-relaxed">{{ memo.notes }}</p>
            <p v-if="memo.extensionCount" class="ect-font-body ect-text-xs ect-text-charcoal/45" :class="memo.notes ? 'ect-mt-2' : ''">
              Extended once · now due {{ formatDate(memo.dueDate) }}
            </p>
          </div>
        </section>

        <!-- Extend / help -->
        <section class="ect-flex ect-flex-wrap ect-items-center ect-gap-3">
          <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-flex-1 ect-min-w-[220px] ect-m-0">
            To keep or send back any piece, reply to your memo email or contact us — we will close the memo and bill only what you keep.
          </p>
          <template v-if="isOpenMemo(memo)">
            <span v-if="memoExtendHint(memo)" class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-text-right">
              {{ memoExtendHint(memo) }}
            </span>
            <button
              type="button"
              :disabled="!memo.canExtend || extendingId === memo.id"
              :title="memoExtendHint(memo) || `Extend this memo by another ${allowance?.memoDays || 30} days`"
              class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-3.5 ect-py-2 ect-rounded-xl ect-border ect-border-charcoal/20 ect-bg-white ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-40 disabled:ect-cursor-not-allowed disabled:hover:ect-border-charcoal/20 disabled:hover:ect-text-charcoal"
              @click="extend(memo.id)"
            >
              <svg v-if="extendingId === memo.id" class="ect-w-3.5 ect-h-3.5 ect-animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="ect-opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="ect-opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <svg v-else class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{{ extendingId === memo.id ? 'Extending…' : 'Extend period' }}</span>
            </button>
          </template>
        </section>
      </template>

      <!-- Settled but no such memo on this account -->
      <section v-else class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-p-8 sm:ect-p-10 ect-text-center">
        <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>
        <h1 class="ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Memo not found</h1>
        <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-mb-8 ect-max-w-sm ect-mx-auto">This memo doesn't exist on your account. It may belong to a different sign-in.</p>
        <RouterLink to="/memos" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors">
          Back to My Memos
        </RouterLink>
      </section>
    </article>
  </section>
</template>
