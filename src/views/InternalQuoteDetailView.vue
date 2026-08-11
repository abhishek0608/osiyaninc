<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import { useAuth } from '../composables/useAuth'
import { useQuotes } from '../composables/useQuotes'

const route = useRoute()
const router = useRouter()
const { isInternalUser } = useAuth()
const { quotes } = useQuotes()

const quote = computed(() => quotes.value.find((q) => q.id === String(route.params.id || '')) || null)

const showNotFound = computed(() => !quote.value)

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const statusClass: Record<string, string> = {
  pending: 'ect-bg-amber-100 ect-text-amber-700',
  reviewing: 'ect-bg-blue-100 ect-text-blue-700',
  quoted: 'ect-bg-purple-100 ect-text-purple-700',
  accepted: 'ect-bg-emerald-100 ect-text-emerald-700',
}

onMounted(() => {
  if (!isInternalUser.value) {
    router.replace('/')
  }
})
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-32 ect-pb-16">
    <div class="ect-max-w-6xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <header class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5 ect-mb-6">
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'quotes' } }"
          class="ect-inline-flex ect-items-center ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline ect-mb-4"
        >
          ← Back to quotes
        </RouterLink>
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-rose-600 ect-mb-2">Quote record</p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">
          {{ quote?.id || 'Quote detail' }}
        </h1>
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">{{ quote?.customerEmail || '' }}</p>
      </header>

      <section v-if="quote" class="ect-grid lg:ect-grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Quote</p>
          <dl class="ect-space-y-4">
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Quote No</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ quote.id }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Status</dt>
              <dd>
                <span
                  class="ect-rounded-full ect-px-2.5 ect-py-1 ect-font-body ect-text-xs ect-font-semibold ect-capitalize"
                  :class="statusClass[quote.status] || 'ect-bg-rose-100 ect-text-rose-700'"
                >{{ quote.status }}</span>
              </dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Total</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ quote.formattedTotal }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Items</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ quote.itemCount }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Created</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ formatDate(quote.createdAt) }}</dd>
            </div>
          </dl>

          <div class="ect-mt-6 ect-pt-5 ect-border-t ect-border-rose-100">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Shipping address</p>
            <address class="ect-not-italic ect-font-body ect-text-sm ect-text-charcoal/70 ect-space-y-0.5">
              <p>{{ quote.address }}</p>
              <p>{{ [quote.city, quote.state, quote.pincode].filter(Boolean).join(', ') }}</p>
              <p>{{ quote.country }}</p>
            </address>
          </div>
        </article>

        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-overflow-hidden">
          <header class="ect-p-5 ect-border-b ect-border-rose-200/30">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-rose-600 ect-mb-1">Customer</p>
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ quote.customerName }}</h2>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-0.5">{{ quote.customerEmail || 'No email' }}</p>
            <p v-if="quote.customerPhone" class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ quote.customerPhone }}</p>
          </header>

          <div class="ect-p-5">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Line items</p>
            <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
              <li
                v-for="item in quote.items"
                :key="item.slug"
                class="ect-rounded-lg ect-border ect-border-rose-100 ect-p-3"
              >
                <div class="ect-flex ect-items-start ect-justify-between ect-gap-3">
                  <div>
                    <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ item.title }}</p>
                    <p class="ect-font-body ect-text-xs ect-text-charcoal/45">Qty {{ item.qty }}</p>
                  </div>
                  <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-shrink-0">{{ item.price }}</p>
                </div>
                <dl
                  v-if="item.customization && Object.keys(item.customization).length"
                  class="ect-mt-2 ect-pt-2 ect-border-t ect-border-rose-100 ect-grid ect-grid-cols-2 ect-gap-x-4 ect-gap-y-1"
                >
                  <template v-for="(value, key) in item.customization" :key="key">
                    <dt v-if="value" class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.1em] ect-text-charcoal/40">{{ key }}</dt>
                    <dd v-if="value" class="ect-font-body ect-text-xs ect-text-charcoal/70">{{ value }}</dd>
                  </template>
                </dl>
              </li>
            </ul>
          </div>
        </article>
      </section>

      <section
        v-else-if="showNotFound"
        class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5"
      >
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55">This quote could not be found.</p>
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'quotes' } }"
          class="ect-inline-block ect-mt-4 ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800"
        >
          Back to quotes list
        </RouterLink>
      </section>
    </div>
  </section>
</template>
