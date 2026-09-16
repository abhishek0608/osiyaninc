<script setup lang="ts">
import { computed, ref } from 'vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'
import InternalQrScanner, { type ScanFeedback } from './InternalQrScanner.vue'

// Staff-side memo issue: the same consignment the customer can raise from the
// checkout, but started from the internal Memos tab — for a showroom visit or a
// phone call where the customer never touches the storefront. The server
// enforces the memo permission, the value limit and the one-open-memo-per-piece
// rule; this form only shows the headroom so staff see a limit coming.

const emit = defineEmits<{ close: []; created: [memo: { id: string; memoNo: string }] }>()

const { user } = useAuth()

interface CustomerHit {
  id: string
  name: string
  email: string
  canMemo: boolean
}

interface MemoAllowance {
  canMemo: boolean
  memoDays: number
  formattedLimit: string | null
  formattedOutstanding: string
  availablePaise: number | null
  formattedAvailable: string | null
}

interface ProductHit {
  slug: string
  title: string
  price: string | null
  pricePaise: number | null
}

interface LineDraft extends ProductHit {
  qty: number
}

const customerQuery = ref('')
const customerResults = ref<CustomerHit[]>([])
const customerSearching = ref(false)
const selectedCustomer = ref<CustomerHit | null>(null)
const allowance = ref<MemoAllowance | null>(null)
const allowanceLoading = ref(false)
let customerDebounce: ReturnType<typeof setTimeout> | undefined

const productQuery = ref('')
const productResults = ref<ProductHit[]>([])
const productSearching = ref(false)
let productDebounce: ReturnType<typeof setTimeout> | undefined

const lines = ref<LineDraft[]>([])
const notes = ref('')

// Tag scanner: the same "add a piece" step as the search box, driven by the QR
// code on the tag instead of typing. It stays open between reads so a tray of
// pieces can be scanned one after another.
const scannerOpen = ref(false)
const scanBusy = ref(false)
const scanFeedback = ref<ScanFeedback | null>(null)
const saving = ref(false)
const errorMsg = ref('')

const subtotalPaise = computed(() =>
  lines.value.reduce((sum, line) => sum + (line.pricePaise || 0) * line.qty, 0),
)

// Courtesy check only — the server compares against everything already out and
// is the one that actually refuses.
const overLimit = computed(() => {
  const available = allowance.value?.availablePaise
  return available != null && subtotalPaise.value > available
})

const canSubmit = computed(
  () => Boolean(selectedCustomer.value) && allowance.value?.canMemo !== false && lines.value.length > 0 && !saving.value,
)

// ProductVariant.listPricePaise (surfaced here as pricePaise) holds WHOLE US
// DOLLARS despite the name, so there is nothing to divide.
function formatPaise(paise: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(paise)
}

function onCustomerInput() {
  if (customerDebounce) clearTimeout(customerDebounce)
  customerDebounce = setTimeout(() => void searchCustomers(), 300)
}

async function searchCustomers() {
  const query = customerQuery.value.trim()
  if (!query || !user.value?.id) {
    customerResults.value = []
    return
  }
  customerSearching.value = true
  try {
    const params = new URLSearchParams({
      resource: 'users-list',
      userId: user.value.id,
      search: query,
      canMemo: '1',
      skip: '0',
    })
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Customer search failed.')
    customerResults.value = (Array.isArray(data.users) ? data.users : [])
      .slice(0, 6)
      .map((row: { id: string; name: string; email: string; canMemo?: boolean }) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        canMemo: Boolean(row.canMemo),
      }))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Customer search failed.'
  } finally {
    customerSearching.value = false
  }
}

async function pickCustomer(hit: CustomerHit) {
  selectedCustomer.value = hit
  customerQuery.value = ''
  customerResults.value = []
  allowance.value = null
  await loadAllowance(hit.id)
}

function clearCustomer() {
  selectedCustomer.value = null
  allowance.value = null
}

async function loadAllowance(customerId: string) {
  if (!user.value?.id) return
  allowanceLoading.value = true
  try {
    const params = new URLSearchParams({ resource: 'memo-create', userId: user.value.id, customerId })
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load memo allowance.')
    allowance.value = data.allowance || null
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Unable to load memo allowance.'
  } finally {
    allowanceLoading.value = false
  }
}

function onProductInput() {
  if (productDebounce) clearTimeout(productDebounce)
  productDebounce = setTimeout(() => void searchProducts(), 300)
}

async function searchProducts() {
  const query = productQuery.value.trim()
  if (!query || !user.value?.id) {
    productResults.value = []
    return
  }
  productSearching.value = true
  try {
    const params = new URLSearchParams({
      resource: 'products-list',
      userId: user.value.id,
      search: query,
      status: 'active',
      skip: '0',
    })
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Product search failed.')
    productResults.value = (Array.isArray(data.products) ? data.products : [])
      .slice(0, 6)
      .map((row: { slug: string; title: string; price?: string | null; pricePaise?: number | null }) => ({
        slug: row.slug,
        title: row.title,
        price: row.price ?? null,
        pricePaise: row.pricePaise ?? null,
      }))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Product search failed.'
  } finally {
    productSearching.value = false
  }
}

// Pieces are one-offs, so a repeat pick is almost always a slip — but qty stays
// editable for the odd multi-unit line.
function addLine(hit: ProductHit) {
  const existing = lines.value.find((line) => line.slug === hit.slug)
  if (existing) existing.qty += 1
  else lines.value.push({ ...hit, qty: 1 })
  productQuery.value = ''
  productResults.value = []
}

function removeLine(index: number) {
  lines.value.splice(index, 1)
}

function toggleScanner() {
  scannerOpen.value = !scannerOpen.value
  scanFeedback.value = null
}

interface LookupHit extends ProductHit {
  active: boolean
  bagNo: string
  purchasable: boolean
  outOnMemo: { id: string; memoNo: string } | null
}

// Resolve whatever the tag encodes (URL, slug, SKU, bag or style number) to a
// piece and add it. Pieces are one-offs, so a second read of the same tag is
// reported rather than bumping the quantity the way a repeat search pick does.
async function onScanned(code: string) {
  if (!user.value?.id || scanBusy.value) return
  scanBusy.value = true
  scanFeedback.value = { tone: 'info', text: `Looking up ${code}…` }
  try {
    const params = new URLSearchParams({ resource: 'product-lookup', userId: user.value.id, code })
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to look up that code.')
    const hit = data.product as LookupHit
    if (!hit.purchasable) {
      scanFeedback.value = { tone: 'error', text: `"${hit.title}" has no active variant, so it cannot go out on memo.` }
      return
    }
    if (hit.outOnMemo) {
      scanFeedback.value = {
        tone: 'error',
        text: `"${hit.title}" is already out on memo ${hit.outOnMemo.memoNo}. It has to come back before it can go out again.`,
      }
      return
    }
    if (lines.value.some((line) => line.slug === hit.slug)) {
      scanFeedback.value = { tone: 'info', text: `"${hit.title}" is already on this memo.` }
      return
    }
    lines.value.push({ slug: hit.slug, title: hit.title, price: hit.price, pricePaise: hit.pricePaise, qty: 1 })
    scanFeedback.value = {
      tone: 'ok',
      text: `Added ${hit.title}${hit.price ? ` · ${hit.price}` : ''}${hit.active ? '' : ' (hidden from the storefront)'}.`,
    }
  } catch (e) {
    scanFeedback.value = { tone: 'error', text: e instanceof Error ? e.message : 'Unable to look up that code.' }
  } finally {
    scanBusy.value = false
  }
}

async function submit() {
  errorMsg.value = ''
  if (!selectedCustomer.value) {
    errorMsg.value = 'Choose the customer taking the pieces.'
    return
  }
  const items = lines.value
    .map((line) => ({ slug: line.slug, qty: Math.max(Math.floor(Number(line.qty) || 0), 0) }))
    .filter((item) => item.qty > 0)
  if (!items.length) {
    errorMsg.value = 'Add at least one piece.'
    return
  }
  saving.value = true
  try {
    const res = await fetch(`${API_BASE}/api/internal?resource=memo-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value?.id,
        customerId: selectedCustomer.value.id,
        notes: notes.value.trim(),
        items,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to create memo.')
    emit('created', { id: data.memo?.id || '', memoNo: data.memo?.memoNo || '' })
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Unable to create memo.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    class="ect-fixed ect-inset-0 ect-z-[60] ect-flex ect-items-center ect-justify-center ect-bg-charcoal/40 ect-backdrop-blur-sm ect-p-4"
    role="dialog"
    aria-modal="true"
    aria-label="New memo"
    @click.self="emit('close')"
  >
    <div class="ect-w-full ect-max-w-lg ect-max-h-[85vh] ect-overflow-y-auto ect-rounded-2xl ect-bg-white ect-p-6 ect-shadow-2xl">
      <h3 class="ect-font-display ect-text-xl ect-text-charcoal">New memo</h3>
      <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55">
        Send pieces out on consignment. Nothing is charged; prices lock at today's catalog price and the customer buys or returns each piece later.
      </p>

      <!-- Customer -->
      <div class="ect-mt-5">
        <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Customer *</p>
        <div v-if="selectedCustomer" class="ect-mt-1 ect-rounded-lg ect-border ect-border-sand ect-bg-cream ect-px-3 ect-py-2">
          <div class="ect-flex ect-items-center ect-justify-between">
            <div>
              <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ selectedCustomer.name }}</p>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ selectedCustomer.email }}</p>
            </div>
            <button type="button" class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/55 hover:ect-text-gold-700" @click="clearCustomer">Change</button>
          </div>
          <p v-if="allowanceLoading" class="ect-mt-2 ect-font-body ect-text-xs ect-text-charcoal/45">Checking memo allowance…</p>
          <template v-else-if="allowance">
            <p v-if="!allowance.canMemo" class="ect-mt-2 ect-font-body ect-text-xs ect-text-red-600">
              This account is not approved for memo. Grant it from the user's page first.
            </p>
            <p v-else class="ect-mt-2 ect-font-body ect-text-xs ect-text-charcoal/55">
              {{ allowance.memoDays }}-day memo period ·
              <span class="ect-font-semibold ect-text-charcoal">{{ allowance.formattedOutstanding }}</span> already out
              <template v-if="allowance.formattedLimit">
                of a {{ allowance.formattedLimit }} limit ·
                <span class="ect-font-semibold" :class="overLimit ? 'ect-text-red-600' : 'ect-text-charcoal'">{{ allowance.formattedAvailable }}</span> available
              </template>
              <template v-else>· no limit</template>
            </p>
          </template>
        </div>
        <div v-else class="ect-relative ect-mt-1">
          <input
            v-model="customerQuery"
            type="search"
            placeholder="Search memo-approved customers by name or email"
            class="ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
            @input="onCustomerInput"
          />
          <div v-if="customerResults.length" class="ect-absolute ect-z-10 ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-sand ect-bg-white ect-shadow-lg">
            <button
              v-for="hit in customerResults"
              :key="hit.id"
              type="button"
              class="ect-block ect-w-full ect-px-3 ect-py-2 ect-text-left hover:ect-bg-cream"
              @click="pickCustomer(hit)"
            >
              <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ hit.name }}</span>
              <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/45">{{ hit.email }}</span>
            </button>
          </div>
          <p v-if="customerSearching" class="ect-mt-1 ect-font-body ect-text-xs ect-text-charcoal/45">Searching…</p>
          <p v-else-if="customerQuery.trim() && !customerResults.length" class="ect-mt-1 ect-font-body ect-text-xs ect-text-charcoal/45">
            No memo-approved customer matches. Approve the account from the Users tab first.
          </p>
        </div>
      </div>

      <!-- Pieces -->
      <div class="ect-mt-5">
        <div class="ect-flex ect-items-center ect-justify-between ect-gap-3">
          <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Pieces *</p>
          <button
            type="button"
            class="ect-inline-flex ect-items-center ect-gap-1.5 ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-1 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors"
            :aria-pressed="scannerOpen"
            @click="toggleScanner"
          >
            <svg class="ect-h-3.5 ect-w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="4" height="4" /><rect x="13" y="7" width="4" height="4" /><rect x="7" y="13" width="4" height="4" /><path d="M13 13h4v4" />
            </svg>
            {{ scannerOpen ? 'Hide scanner' : 'Scan tag' }}
          </button>
        </div>
        <InternalQrScanner
          v-if="scannerOpen"
          class="ect-mt-2"
          :feedback="scanFeedback"
          :busy="scanBusy"
          @scan="onScanned"
          @close="toggleScanner"
        />
        <div class="ect-relative ect-mt-1">
          <input
            v-model="productQuery"
            type="search"
            placeholder="Search the catalog…"
            class="ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
            @input="onProductInput"
          />
          <div v-if="productResults.length" class="ect-absolute ect-z-10 ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-sand ect-bg-white ect-shadow-lg">
            <button
              v-for="hit in productResults"
              :key="hit.slug"
              type="button"
              class="ect-flex ect-w-full ect-items-center ect-justify-between ect-gap-3 ect-px-3 ect-py-2 ect-text-left hover:ect-bg-cream"
              @click="addLine(hit)"
            >
              <span class="ect-font-body ect-text-sm ect-text-charcoal">{{ hit.title }}</span>
              <span class="ect-shrink-0 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ hit.price || '—' }}</span>
            </button>
          </div>
          <p v-if="productSearching" class="ect-mt-1 ect-font-body ect-text-xs ect-text-charcoal/45">Searching…</p>
        </div>

        <div v-if="lines.length" class="ect-mt-3 ect-space-y-2">
          <div v-for="(line, index) in lines" :key="line.slug" class="ect-flex ect-items-center ect-gap-2 ect-rounded-lg ect-border ect-border-sand ect-px-3 ect-py-2">
            <div class="ect-min-w-0 ect-flex-1">
              <p class="ect-truncate ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ line.title }}</p>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ line.price || 'Price from catalog' }}</p>
            </div>
            <input v-model.number="line.qty" type="number" min="1" class="ect-w-16 ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-2 ect-py-1.5 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" aria-label="Quantity" />
            <button
              type="button"
              class="ect-shrink-0 ect-rounded-full ect-border ect-border-red-200 ect-px-2.5 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-red-600 hover:ect-bg-red-50"
              aria-label="Remove piece"
              @click="removeLine(index)"
            >
              ✕
            </button>
          </div>
          <p class="ect-font-body ect-text-sm ect-font-semibold" :class="overLimit ? 'ect-text-red-600' : 'ect-text-charcoal'">
            Value out: {{ formatPaise(subtotalPaise) }}
            <span v-if="overLimit" class="ect-font-normal"> · over this customer's remaining memo limit</span>
          </p>
        </div>
        <p v-else class="ect-mt-2 ect-font-body ect-text-xs ect-text-charcoal/45">No pieces added yet.</p>
      </div>

      <label class="ect-mt-5 ect-block">
        <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Notes</span>
        <textarea v-model="notes" rows="2" placeholder="Where the pieces went, who they went with, anything agreed verbally" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"></textarea>
      </label>

      <p v-if="errorMsg" class="ect-mt-3 ect-font-body ect-text-sm ect-text-red-600">{{ errorMsg }}</p>

      <div class="ect-mt-6 ect-flex ect-justify-end ect-gap-2">
        <button
          type="button"
          class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!canSubmit"
          class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
          @click="submit"
        >
          {{ saving ? 'Issuing…' : 'Issue memo' }}
        </button>
      </div>
    </div>
  </div>
</template>
