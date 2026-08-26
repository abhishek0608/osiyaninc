<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import {
  useMemos,
  isOpenMemo,
  memoDueLabel,
  memoExtendHint,
  memoStatusLabel,
  type Memo,
} from '../composables/useMemos'

const { isLoggedIn } = useAuth()
const { memos, allowance, openCount, loading, settled, error, load, extend, extendingId, extendError, extendMessage } =
  useMemos()

onMounted(() => void load())

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Open memos are the ones the customer still has to act on, so they carry the
// warning colours; closed ones stay quiet.
function statusPillClass(memo: Memo) {
  if (memo.isOverdue) return 'ect-bg-red-50 ect-text-red-700'
  if (memo.status === 'CONVERTED') return 'ect-bg-emerald-50 ect-text-emerald-700'
  if (memo.status === 'RETURNED' || memo.status === 'CANCELLED') return 'ect-bg-charcoal/5 ect-text-charcoal/60'
  return 'ect-bg-champagne ect-text-gold-800'
}

function itemLine(item: Memo['items'][number]) {
  const parts = [`${item.formattedPrice} · ${item.qty} issued`]
  if (item.returnedQty) parts.push(`${item.returnedQty} returned`)
  if (item.convertedQty) parts.push(`${item.convertedQty} purchased`)
  if (item.outQty) parts.push(`${item.outQty} still with you`)
  return parts.join(' · ')
}
</script>

<template>
  <section class="ect-pt-6 ect-pb-24 ect-px-4 sm:ect-px-6 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream ect-min-h-screen">
    <article class="ect-max-w-3xl ect-mx-auto">
      <header class="ect-mb-8">
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">Account</p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">My Memos</h1>
        <p class="ect-font-body ect-text-sm ect-text-charcoal/60 ect-mt-1">Pieces you have out on memo — nothing is charged until you keep them</p>
      </header>

      <!-- Signed out -->
      <section v-if="!isLoggedIn" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-p-8 sm:ect-p-10 ect-text-center">
        <h2 class="ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Sign in to see your memos</h2>
        <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-mb-8 ect-max-w-sm ect-mx-auto">Memos are tied to your account, so we need you signed in to show what is out with you.</p>
        <RouterLink to="/login" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors">
          Sign In
        </RouterLink>
      </section>

      <template v-else>
        <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>
        <p v-if="extendError" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ extendError }}</p>
        <p v-else-if="extendMessage" class="ect-font-body ect-text-sm ect-text-emerald-700 ect-mb-4">{{ extendMessage }}</p>

        <!-- Allowance summary: what is out against what this account may hold. -->
        <section
          v-if="!settled"
          class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-5 sm:ect-p-6 ect-mb-5 ect-grid ect-grid-cols-2 sm:ect-grid-cols-4 ect-gap-4 ect-animate-pulse"
        >
          <div v-for="n in 4" :key="n">
            <span class="ect-block ect-h-3 ect-w-20 ect-rounded ect-bg-champagne/70 ect-mb-2"></span>
            <span class="ect-block ect-h-5 ect-w-24 ect-rounded ect-bg-champagne/50"></span>
          </div>
        </section>
        <section
          v-else-if="allowance?.canMemo"
          class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-5 sm:ect-p-6 ect-mb-5 ect-grid ect-grid-cols-2 sm:ect-grid-cols-4 ect-gap-4"
        >
          <div>
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Out with you</p>
            <p class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">{{ allowance.formattedOutstanding }}</p>
          </div>
          <div>
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Open memos</p>
            <p class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">{{ openCount }}</p>
          </div>
          <div>
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Your limit</p>
            <p class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">{{ allowance.formattedLimit || 'No cap' }}</p>
          </div>
          <div>
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/40 ect-mb-1">Still available</p>
            <p class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">{{ allowance.formattedAvailable || '—' }}</p>
          </div>
          <p class="ect-col-span-2 sm:ect-col-span-4 ect-font-body ect-text-xs ect-text-charcoal/45">
            Pieces are due back {{ allowance.memoDays }} days after they go out. Keep what you like and we will bill only those.
          </p>
        </section>

        <!-- Loading: held until the account's memos are known, so the empty
             state never flashes before the request has even gone out. -->
        <section v-if="!settled || (loading && !memos.length)" class="ect-flex ect-flex-col ect-gap-4">
          <span v-for="n in 2" :key="n" class="ect-h-28 ect-rounded-2xl ect-bg-white/70 ect-border ect-border-sand ect-animate-pulse"></span>
        </section>

        <!-- Empty state -->
        <section v-else-if="!memos.length" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-p-8 sm:ect-p-10 ect-text-center">
          <span class="ect-w-16 ect-h-16 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-mx-auto ect-mb-6">
            <svg class="ect-w-8 ect-h-8 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </span>
          <h2 class="ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">
            {{ allowance && !allowance.canMemo ? 'Memo isn’t enabled yet' : 'Nothing out on memo' }}
          </h2>
          <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-mb-8 ect-max-w-sm ect-mx-auto">
            {{ allowance && !allowance.canMemo
              ? 'Taking pieces out on memo is enabled per account. Talk to us and we will set it up for you.'
              : 'When pieces go out to you on memo, they will appear here with what is still with you and when it is due back.' }}
          </p>
          <RouterLink
            :to="allowance && !allowance.canMemo ? '/about' : '/#collections'"
            class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors"
          >
            {{ allowance && !allowance.canMemo ? 'Get in Touch' : 'Browse Collections' }}
          </RouterLink>
        </section>

        <!-- Memo list -->
        <ul v-else class="ect-list-none ect-m-0 ect-p-0 ect-flex ect-flex-col ect-gap-4">
          <li v-for="memo in memos" :key="memo.id" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-overflow-hidden">
            <RouterLink
              :to="`/memos/${memo.id}`"
              class="ect-flex ect-flex-wrap ect-gap-4 ect-p-5 sm:ect-p-6 ect-items-start hover:ect-bg-champagne/30 ect-transition-colors"
            >
              <span class="ect-flex-1 ect-min-w-0">
                <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-0.5">{{ memo.memoNo }}</p>
                <p class="ect-font-body ect-text-sm ect-text-charcoal/60">
                  Issued {{ formatDate(memo.issuedAt) }} · {{ memo.items.length }} {{ memo.items.length === 1 ? 'piece' : 'pieces' }}
                </p>
                <p
                  v-if="isOpenMemo(memo)"
                  class="ect-font-body ect-text-xs ect-mt-1"
                  :class="memo.isOverdue ? 'ect-text-red-600 ect-font-semibold' : 'ect-text-charcoal/50'"
                >
                  Due back {{ formatDate(memo.dueDate) }} · {{ memoDueLabel(memo) }}
                </p>
                <p v-else-if="memo.closedAt" class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">
                  Closed {{ formatDate(memo.closedAt) }}
                </p>
              </span>
              <span class="ect-text-right ect-shrink-0">
                <span class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-block">{{ memo.formattedOutstanding }}</span>
                <span class="ect-font-body ect-text-xs ect-text-charcoal/45">of {{ memo.formattedSubtotal }} issued</span>
              </span>
              <svg class="ect-w-4 ect-h-4 ect-text-charcoal/30 ect-shrink-0 ect-self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </RouterLink>

            <ul class="ect-list-none ect-m-0 ect-px-5 sm:ect-px-6 ect-pb-1 ect-flex ect-flex-col ect-gap-2">
              <li v-for="item in memo.items" :key="item.id" class="ect-flex ect-flex-wrap ect-gap-x-2 ect-items-baseline">
                <span class="ect-font-body ect-text-sm ect-text-charcoal ect-truncate ect-max-w-full">{{ item.title }}</span>
                <span class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ itemLine(item) }}</span>
              </li>
            </ul>

            <section class="ect-px-5 sm:ect-px-6 ect-pb-5 sm:ect-pb-6 ect-pt-4 ect-flex ect-flex-wrap ect-items-center ect-gap-3">
              <span
                class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-2.5 ect-py-1 ect-rounded-full ect-font-body ect-text-xs ect-font-medium"
                :class="statusPillClass(memo)"
              >{{ memoStatusLabel(memo) }}</span>
              <span v-if="memo.notes" class="ect-font-body ect-text-xs ect-text-charcoal/50">{{ memo.notes }}</span>

              <!-- Extending only opens up as the period runs out; before that the
                   button is visible but inert so the option is discoverable. -->
              <span v-if="isOpenMemo(memo)" class="ect-ml-auto ect-flex ect-flex-wrap ect-items-center ect-gap-2 ect-justify-end">
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
              </span>
            </section>

            <p
              v-if="memo.extensionCount"
              class="ect-px-5 sm:ect-px-6 ect--mt-3 ect-pb-4 ect-font-body ect-text-xs ect-text-charcoal/45"
            >
              Extended once · now due {{ formatDate(memo.dueDate) }}
            </p>
          </li>
        </ul>

        <p v-if="memos.length" class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-6">
          To keep or send back any piece, reply to your memo email or contact us — we will close the memo and bill only what you keep.
        </p>
      </template>
    </article>
  </section>
</template>
