<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'

interface MemoItem {
  id: string
  title: string
  qty: number
  outQty: number
  returnedQty: number
  convertedQty: number
  status: string
  formattedPrice: string
}

interface MemoDetail {
  id: string
  memoNo: string
  status: string
  isOverdue: boolean
  issuedAt: string
  dueDate: string
  closedAt: string | null
  formattedSubtotal: string
  formattedOutstanding: string
  notes: string
  customer: string
  customerEmail: string
  customerId: string | null
  customerFormattedOutstanding: string
  createdBy?: string
  shipTo: Record<string, string> | null
  order: { id: string; orderNo: string; status: string } | null
  items: MemoItem[]
}

const route = useRoute()
const router = useRouter()
const { user, isInternalUser } = useAuth()

const loading = ref(false)
const error = ref('')
const actionError = ref('')
const actionMessage = ref('')
const saving = ref(false)
const memo = ref<MemoDetail | null>(null)
// Per-line quantities the staff member is closing out; defaults to everything
// still out, which is the usual case.
const lineQty = ref<Record<string, number>>({})

const isOpen = computed(() => memo.value?.status === 'ISSUED' || memo.value?.status === 'PARTIAL')

const selectedLines = computed(() =>
  Object.entries(lineQty.value)
    .map(([memoItemId, qty]) => ({ memoItemId, qty: Number(qty) || 0 }))
    .filter((line) => line.qty > 0),
)

const selectedCount = computed(() => selectedLines.value.reduce((sum, line) => sum + line.qty, 0))

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function resetLineQty() {
  const next: Record<string, number> = {}
  for (const item of memo.value?.items || []) {
    if (item.outQty > 0) next[item.id] = item.outQty
  }
  lineQty.value = next
}

async function loadMemo() {
  if (!isInternalUser.value || !user.value?.id) return
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      resource: 'memo',
      userId: user.value.id,
      memoId: String(route.params.id || ''),
    })
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load this memo.')
    memo.value = data.memo
    resetLineQty()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load this memo.'
  } finally {
    loading.value = false
  }
}

async function runAction(action: 'return' | 'convert' | 'cancel') {
  if (!user.value?.id || !memo.value || saving.value) return
  if (action !== 'cancel' && !selectedLines.value.length) {
    actionError.value = 'Choose how many pieces to close out first.'
    return
  }
  if (action === 'cancel' && !window.confirm('Cancel this memo? Use this only for a memo raised in error.')) return

  saving.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    const res = await fetch(`${API_BASE}/api/internal?resource=memo&action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value.id,
        memoId: memo.value.id,
        ...(action === 'cancel' ? {} : { lines: selectedLines.value }),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to update this memo.')
    if (action === 'convert' && data.order) {
      actionMessage.value = `Converted to order ${data.order.orderNo}${data.invoice ? ` and invoice ${data.invoice.invoiceNo}` : ''}.`
    } else if (action === 'return') {
      actionMessage.value = 'Return recorded.'
    } else {
      actionMessage.value = 'Memo cancelled.'
    }
    await loadMemo()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Unable to update this memo.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (!isInternalUser.value) {
    router.replace('/')
    return
  }
  void loadMemo()
})
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-6 sm:ect-pt-14 ect-pb-16">
    <div class="ect-max-w-6xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <header class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5 ect-mb-6">
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'memos' } }"
          class="ect-inline-flex ect-items-center ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline ect-mb-4"
        >
          Back to memos
        </RouterLink>
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-rose-600 ect-mb-2">Memo — goods on consignment</p>
        <template v-if="loading && !memo">
          <div class="ect-h-10 ect-w-56 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
        </template>
        <template v-else>
          <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">{{ memo?.memoNo || 'Memo detail' }}</h1>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">{{ memo?.customer }} · {{ memo?.customerEmail || 'No email' }}</p>
        </template>
      </header>

      <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>

      <section v-if="memo" class="ect-grid lg:ect-grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Memo</p>
          <dl class="ect-space-y-4">
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Status</dt>
              <dd>
                <span
                  class="ect-inline-flex ect-items-center ect-rounded-full ect-px-2.5 ect-py-1 ect-font-body ect-text-xs ect-font-semibold"
                  :class="memo.isOverdue
                    ? 'ect-bg-red-50 ect-text-red-700'
                    : memo.status === 'CONVERTED'
                      ? 'ect-bg-emerald-50 ect-text-emerald-700'
                      : memo.status === 'RETURNED' || memo.status === 'CANCELLED'
                        ? 'ect-bg-charcoal/5 ect-text-charcoal/60'
                        : 'ect-bg-amber-50 ect-text-amber-700'"
                >
                  {{ memo.isOverdue ? 'Overdue' : memo.status.toLowerCase() }}
                </span>
              </dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Value still out</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ memo.formattedOutstanding }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Issued value</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ memo.formattedSubtotal }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Issued</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ formatDate(memo.issuedAt) }}<span class="ect-block ect-text-xs ect-text-charcoal/40">by {{ memo.createdBy || '—' }}</span></dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Due back</dt>
              <dd class="ect-font-body ect-text-sm" :class="memo.isOverdue ? 'ect-text-red-600 ect-font-semibold' : 'ect-text-charcoal'">{{ formatDate(memo.dueDate) }}</dd>
            </div>
            <div v-if="memo.closedAt">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Closed</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ formatDate(memo.closedAt) }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Customer total on memo</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ memo.customerFormattedOutstanding }}</dd>
            </div>
            <div v-if="memo.order">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Converted to</dt>
              <dd>
                <RouterLink :to="{ name: 'internal-order', params: { id: memo.order.id } }" class="ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-underline">
                  {{ memo.order.orderNo }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="memo.notes">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Notes</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal/70">{{ memo.notes }}</dd>
            </div>
            <div v-if="memo.shipTo">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Sent to</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal/70">
                <span v-for="(value, key) in memo.shipTo" :key="key" class="ect-block">{{ value }}</span>
              </dd>
            </div>
          </dl>
        </article>

        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-overflow-hidden">
          <header class="ect-p-5 ect-border-b ect-border-rose-200/30">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-rose-600 ect-mb-1">Pieces</p>
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">
              {{ isOpen ? 'Set how many of each piece the customer is keeping or sending back' : 'This memo is closed' }}
            </h2>
          </header>

          <ul class="ect-divide-y ect-divide-rose-200/30">
            <li v-for="item in memo.items" :key="item.id" class="ect-p-5 ect-flex ect-flex-wrap ect-items-center ect-gap-3">
              <div class="ect-min-w-0 ect-flex-1">
                <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ item.title }}</p>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-1">
                  {{ item.formattedPrice }} · {{ item.qty }} issued
                  <span v-if="item.returnedQty"> · {{ item.returnedQty }} returned</span>
                  <span v-if="item.convertedQty"> · {{ item.convertedQty }} bought</span>
                  <span v-if="item.outQty" class="ect-text-amber-700"> · {{ item.outQty }} still out</span>
                </p>
              </div>
              <label v-if="isOpen && item.outQty > 0" class="ect-flex ect-items-center ect-gap-2">
                <span class="ect-font-body ect-text-xs ect-text-charcoal/45">Qty</span>
                <input
                  v-model.number="lineQty[item.id]"
                  type="number"
                  min="0"
                  :max="item.outQty"
                  class="ect-w-20 ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-1.5 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"
                />
              </label>
              <span v-else class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.1em] ect-text-charcoal/40">{{ item.status.toLowerCase() }}</span>
            </li>
          </ul>

          <div v-if="isOpen" class="ect-p-5 ect-border-t ect-border-rose-200/30 ect-bg-cream/40">
            <p v-if="actionError" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-3">{{ actionError }}</p>
            <p v-if="actionMessage" class="ect-font-body ect-text-sm ect-text-emerald-700 ect-mb-3">{{ actionMessage }}</p>
            <div class="ect-flex ect-flex-wrap ect-gap-2">
              <button
                type="button"
                :disabled="saving"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-50"
                @click="runAction('convert')"
              >
                Customer keeps {{ selectedCount }} — bill it
              </button>
              <button
                type="button"
                :disabled="saving"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50"
                @click="runAction('return')"
              >
                Returned to us
              </button>
              <button
                type="button"
                :disabled="saving"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/45 hover:ect-text-red-600 ect-transition-colors disabled:ect-opacity-50"
                @click="runAction('cancel')"
              >
                Cancel memo
              </button>
            </div>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-3">
              Billing a memo creates a confirmed order and an invoice at the prices locked when the goods went out.
            </p>
          </div>
          <div v-else class="ect-p-5 ect-border-t ect-border-rose-200/30">
            <p v-if="actionMessage" class="ect-font-body ect-text-sm ect-text-emerald-700">{{ actionMessage }}</p>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>
