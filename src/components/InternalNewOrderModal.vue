<script setup lang="ts">
import { computed, ref } from 'vue'
import UiSelect from './UiSelect.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'

const emit = defineEmits<{ close: []; created: [] }>()

const { user } = useAuth()

interface CustomerHit {
  id: string
  name: string
  email: string
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
let customerDebounce: ReturnType<typeof setTimeout> | undefined

const productQuery = ref('')
const productResults = ref<ProductHit[]>([])
const productSearching = ref(false)
let productDebounce: ReturnType<typeof setTimeout> | undefined

const lines = ref<LineDraft[]>([])
const status = ref('PENDING')
const notes = ref('')
const saving = ref(false)
const errorMsg = ref('')

const statusOptions = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'FULFILLED', label: 'Fulfilled' },
]

const subtotalPaise = computed(() =>
  lines.value.reduce((sum, line) => sum + (line.pricePaise || 0) * line.qty, 0),
)

function formatPaise(paise: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(paise / 100)
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
      skip: '0',
    })
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Customer search failed.')
    customerResults.value = (Array.isArray(data.users) ? data.users : [])
      .slice(0, 6)
      .map((row: { id: string; name: string; email: string }) => ({
        id: row.id,
        name: row.name,
        email: row.email,
      }))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Customer search failed.'
  } finally {
    customerSearching.value = false
  }
}

function pickCustomer(hit: CustomerHit) {
  selectedCustomer.value = hit
  customerQuery.value = ''
  customerResults.value = []
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

async function submit() {
  errorMsg.value = ''
  const items = lines.value
    .map((line) => ({ slug: line.slug, qty: Math.max(Math.floor(Number(line.qty) || 0), 0) }))
    .filter((item) => item.qty > 0)
  if (!items.length) {
    errorMsg.value = 'Add at least one product.'
    return
  }
  saving.value = true
  try {
    const res = await fetch(`${API_BASE}/api/internal?resource=order-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value?.id,
        customerId: selectedCustomer.value?.id || undefined,
        status: status.value,
        notes: notes.value.trim(),
        items,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to create order.')
    emit('created')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Unable to create order.'
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
    aria-label="New order"
    @click.self="emit('close')"
  >
    <div class="ect-w-full ect-max-w-lg ect-max-h-[85vh] ect-overflow-y-auto ect-rounded-2xl ect-bg-white ect-p-6 ect-shadow-2xl">
      <h3 class="ect-font-display ect-text-xl ect-text-charcoal">New order</h3>
      <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55">
        Record a manual order (phone, showroom, exhibition). Prices come from the product catalog; payment is settled outside the site.
      </p>

      <!-- Customer -->
      <div class="ect-mt-5">
        <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Customer</p>
        <div v-if="selectedCustomer" class="ect-mt-1 ect-flex ect-items-center ect-justify-between ect-rounded-lg ect-border ect-border-sand ect-bg-cream ect-px-3 ect-py-2">
          <div>
            <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ selectedCustomer.name }}</p>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ selectedCustomer.email }}</p>
          </div>
          <button type="button" class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/55 hover:ect-text-gold-700" @click="selectedCustomer = null">Change</button>
        </div>
        <div v-else class="ect-relative ect-mt-1">
          <input
            v-model="customerQuery"
            type="search"
            placeholder="Search by name or email — leave empty for a guest order"
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
        </div>
      </div>

      <!-- Products -->
      <div class="ect-mt-5">
        <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Products *</p>
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
              aria-label="Remove product"
              @click="removeLine(index)"
            >
              ✕
            </button>
          </div>
          <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Subtotal: {{ formatPaise(subtotalPaise) }}</p>
        </div>
        <p v-else class="ect-mt-2 ect-font-body ect-text-xs ect-text-charcoal/45">No products added yet.</p>
      </div>

      <div class="ect-mt-5 ect-grid ect-grid-cols-2 ect-gap-3">
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Status</span>
          <UiSelect v-model="status" :options="statusOptions" class="ect-mt-1" />
        </label>
        <label class="ect-col-span-2 ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Notes</span>
          <textarea v-model="notes" rows="2" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"></textarea>
        </label>
      </div>

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
          :disabled="saving"
          class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
          @click="submit"
        >
          {{ saving ? 'Creating…' : 'Create order' }}
        </button>
      </div>
    </div>
  </div>
</template>
