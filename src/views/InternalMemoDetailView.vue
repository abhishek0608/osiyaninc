<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import LineItemThumb from '../components/LineItemThumb.vue'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'

interface MemoItem {
  id: string
  image?: string
  title: string
  qty: number
  outQty: number
  returnedQty: number
  convertedQty: number
  /** Sent back by the customer, not arrived yet — still part of outQty. */
  returnRequestedQty: number
  returnRequestedAt: string | null
  status: string
  pricePaise: number
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
  extensionCount: number
  lastExtendedAt: string | null
  formattedSubtotal: string
  formattedOutstanding: string
  notes: string
  customer: string
  customerEmail: string
  customerId: string | null
  customerFormattedOutstanding: string
  createdBy?: string
  shipTo: Record<string, string> | null
  returnRequestedQty: number
  currency: string
  orders: { id: string; orderNo: string; status: string }[]
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
// Days to push the due date out by, from the current due date.
const extendDays = ref(15)
// Ticked pieces, the same as the customer's memo page. Every piece is a one-off,
// so a tick closes the whole line — there is no quantity to pick.
const selected = ref<Record<string, boolean>>({})

const isOpen = computed(() => memo.value?.status === 'ISSUED' || memo.value?.status === 'PARTIAL')

const selectedItems = computed(() =>
  (memo.value?.items || []).filter((item) => selected.value[item.id] && item.outQty > 0),
)

const selectedLines = computed(() =>
  selectedItems.value.map((item) => ({ memoItemId: item.id, qty: item.outQty })),
)

const selectedCount = computed(() => selectedLines.value.reduce((sum, line) => sum + line.qty, 0))

const selectionTotal = computed(() =>
  selectedItems.value.reduce((sum, item) => sum + item.pricePaise * item.outQty, 0),
)

function toggleLine(item: MemoItem) {
  selected.value = { ...selected.value, [item.id]: !selected.value[item.id] }
}

// Memo amounts are whole dollars despite the `Paise` name — see server/api/money.js.
function formatMoney(usd: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: memo.value?.currency || 'USD',
    maximumFractionDigits: 0,
  }).format(usd || 0)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

// When the customer has said pieces are on their way back, tick just those,
// ready for "Send back selected" once the package is opened.
function selectSentBack() {
  const next: Record<string, boolean> = {}
  for (const item of memo.value?.items || []) {
    if (item.returnRequestedQty > 0) next[item.id] = true
  }
  selected.value = next
}

const sentBackSince = computed(() => {
  const times = (memo.value?.items || [])
    .map((item) => item.returnRequestedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
  return times.length ? times[times.length - 1] : null
})

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
    selected.value = {}
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load this memo.'
  } finally {
    loading.value = false
  }
}

// Staff extension is not bound by the customer's last-three-days window: this
// is how an overdue or already-extended memo gets more time.
async function extendMemo() {
  if (!user.value?.id || !memo.value || saving.value) return
  const days = Math.floor(Number(extendDays.value) || 0)
  if (days <= 0 || days > 365) {
    actionError.value = 'Extend by between 1 and 365 days.'
    return
  }
  saving.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    const res = await fetch(`${API_BASE}/api/internal?resource=memo&action=extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.value.id, memoId: memo.value.id, days }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to extend this memo.')
    actionMessage.value = `Due date moved out by ${days} ${days === 1 ? 'day' : 'days'}.`
    await loadMemo()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Unable to extend this memo.'
  } finally {
    saving.value = false
  }
}

async function runAction(action: 'return' | 'convert' | 'cancel') {
  if (!user.value?.id || !memo.value || saving.value) return
  if (action !== 'cancel' && !selectedLines.value.length) {
    actionError.value = 'Tick the pieces first.'
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
      actionMessage.value = `${selectedCount.value} ${selectedCount.value === 1 ? 'piece' : 'pieces'} marked returned.`
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
          <dl class="ect-grid ect-grid-cols-2 ect-gap-x-6 ect-gap-y-4">
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
              <dd class="ect-font-body ect-text-sm" :class="memo.isOverdue ? 'ect-text-red-600 ect-font-semibold' : 'ect-text-charcoal'">
                {{ formatDate(memo.dueDate) }}
                <span v-if="memo.extensionCount" class="ect-block ect-text-xs ect-text-charcoal/40">
                  extended {{ memo.extensionCount }}× · last on {{ formatDate(memo.lastExtendedAt) }}
                </span>
              </dd>
            </div>
            <div v-if="memo.closedAt">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Closed</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ formatDate(memo.closedAt) }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Customer total on memo</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ memo.customerFormattedOutstanding }}</dd>
            </div>
            <div v-if="memo.orders?.length">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Converted to</dt>
              <dd>
                <RouterLink
                  v-for="billed in memo.orders"
                  :key="billed.id"
                  :to="{ name: 'internal-order', params: { id: billed.id } }"
                  class="ect-block ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-underline"
                >
                  {{ billed.orderNo }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="memo.notes" class="ect-col-span-2">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Notes</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal/70">{{ memo.notes }}</dd>
            </div>
            <div v-if="memo.shipTo" class="ect-col-span-2">
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
              {{ isOpen ? 'Tick the pieces the customer is sending back or buying' : 'This memo is closed' }}
            </h2>
          </header>

          <div
            v-if="isOpen && memo.returnRequestedQty"
            class="ect-px-5 ect-py-3 ect-border-b ect-border-sky-200 ect-bg-sky-50 ect-flex ect-flex-wrap ect-items-center ect-gap-3"
          >
            <p class="ect-flex-1 ect-min-w-[220px] ect-font-body ect-text-sm ect-text-sky-800">
              The customer is sending back {{ memo.returnRequestedQty }} {{ memo.returnRequestedQty === 1 ? 'piece' : 'pieces' }}<span v-if="sentBackSince"> (since {{ formatDate(sentBackSince) }})</span>.
              Use “Send back selected” once {{ memo.returnRequestedQty === 1 ? 'it arrives' : 'they arrive' }}.
            </p>
            <button
              type="button"
              :disabled="saving"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-sky-300 ect-bg-white ect-px-4 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-sky-800 hover:ect-border-sky-500 ect-transition-colors disabled:ect-opacity-50"
              @click="selectSentBack"
            >
              Select just those
            </button>
          </div>

          <ul class="ect-divide-y ect-divide-rose-200/30">
            <li v-for="item in memo.items" :key="item.id" class="ect-p-5 ect-flex ect-flex-wrap ect-items-center ect-gap-3">
              <input
                v-if="isOpen && item.outQty > 0"
                type="checkbox"
                :checked="Boolean(selected[item.id])"
                :disabled="saving"
                :aria-label="`Select ${item.title}`"
                class="ect-w-4 ect-h-4 ect-shrink-0 ect-accent-charcoal ect-cursor-pointer disabled:ect-cursor-wait"
                @change="toggleLine(item)"
              />
              <LineItemThumb :image="item.image" :alt="item.title" />
              <div class="ect-min-w-0 ect-flex-1">
                <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ item.title }}</p>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-1">{{ item.formattedPrice }}</p>
              </div>
              <span
                v-if="isOpen && item.outQty > 0"
                class="ect-inline-flex ect-items-center ect-rounded-full ect-px-2.5 ect-py-0.5 ect-font-body ect-text-[11px] ect-font-semibold"
                :class="item.returnRequestedQty ? 'ect-bg-sky-50 ect-text-sky-700' : 'ect-bg-amber-50 ect-text-amber-700'"
              >{{ item.returnRequestedQty ? 'On its way back' : 'With customer' }}</span>
              <span v-else class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.1em] ect-text-charcoal/40">{{ item.status === 'CONVERTED' ? 'purchased' : item.status.toLowerCase() }}</span>
            </li>
          </ul>

          <div v-if="isOpen" class="ect-p-5 ect-border-t ect-border-rose-200/30 ect-bg-cream/40">
            <p v-if="actionError" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-3">{{ actionError }}</p>
            <p v-if="actionMessage" class="ect-font-body ect-text-sm ect-text-emerald-700 ect-mb-3">{{ actionMessage }}</p>
            <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-3">
              <span class="ect-flex-1 ect-min-w-[220px] ect-font-body ect-text-sm ect-text-charcoal/60">
                <template v-if="selectedLines.length">
                  {{ selectedCount }} {{ selectedCount === 1 ? 'piece' : 'pieces' }} selected ·
                  <span class="ect-text-charcoal ect-font-semibold">{{ formatMoney(selectionTotal) }}</span>
                  at memo prices
                </template>
                <template v-else>
                  Tick pieces to mark them returned or bill them — anything left unticked stays on memo.
                </template>
              </span>
              <!-- The two actions stay together, right-aligned; on a narrow screen
                   they drop below the summary and fill the width. -->
              <div class="ect-flex ect-flex-wrap ect-justify-end ect-gap-2 ect-ml-auto ect-w-full sm:ect-w-auto">
                <button
                  type="button"
                  :disabled="saving || !selectedLines.length"
                  class="ect-inline-flex ect-items-center ect-justify-center ect-whitespace-nowrap ect-flex-1 sm:ect-flex-none ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-40 disabled:ect-cursor-not-allowed"
                  @click="runAction('return')"
                >
                  Send back selected
                </button>
                <button
                  type="button"
                  :disabled="saving || !selectedLines.length"
                  class="ect-inline-flex ect-items-center ect-justify-center ect-whitespace-nowrap ect-flex-1 sm:ect-flex-none ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-40 disabled:ect-cursor-not-allowed"
                  @click="runAction('convert')"
                >
                  {{ selectedLines.length ? `Purchase selected · ${formatMoney(selectionTotal)}` : 'Purchase selected' }}
                </button>
              </div>
            </div>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-3">
              Send back closes the pieces as returned — use it once they are back in hand. Purchase creates a confirmed order and an invoice at the prices locked when the goods went out.
            </p>

            <div class="ect-mt-4 ect-pt-4 ect-border-t ect-border-rose-200/30 ect-flex ect-flex-wrap ect-items-center ect-gap-2">
              <span class="ect-font-body ect-text-xs ect-text-charcoal/45">Give more time</span>
              <input
                v-model.number="extendDays"
                type="number"
                min="1"
                max="365"
                class="ect-w-20 ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-1.5 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"
              />
              <button
                type="button"
                :disabled="saving"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50"
                @click="extendMemo"
              >
                Extend due date
              </button>
              <span class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-flex-1 ect-min-w-[200px]">
                Counted from the current due date. Customers can self-extend only in the last 3 days.
              </span>
              <button
                type="button"
                :disabled="saving"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/45 hover:ect-text-red-600 ect-transition-colors disabled:ect-opacity-50"
                @click="runAction('cancel')"
              >
                Cancel memo
              </button>
            </div>
          </div>
          <div v-else class="ect-p-5 ect-border-t ect-border-rose-200/30">
            <p v-if="actionMessage" class="ect-font-body ect-text-sm ect-text-emerald-700">{{ actionMessage }}</p>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>
