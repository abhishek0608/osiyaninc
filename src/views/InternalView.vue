<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import InternalNewOrderModal from '../components/InternalNewOrderModal.vue'
import InternalNewUserModal from '../components/InternalNewUserModal.vue'
import UiSelect from '../components/UiSelect.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'
import { invalidateHomepageSlides } from '../composables/useHomepageSlides'
import { invalidateSiteConfig, DEFAULT_LOGO_SRC } from '../composables/useSiteConfig'
import { useInternalWorkspaceTab } from '../composables/useInternalWorkspaceTab'
import { useOrders } from '../composables/useOrders'
import {
  fetchSignupRequests,
  reviewSignupRequest,
  type SignupRequest,
  type SignupRequestStatus,
} from '../composables/useSignupRequests'
import { COLLECTION_LINKS } from '../data/collections'


interface AuditFields {
  createdBy?: string | null
  createdAt: string
  modifiedBy?: string | null
  modifiedAt?: string | null
}

interface InternalOrder extends AuditFields {
  id: string
  orderNo: string
  customerId?: string | null
  customer: string
  customerEmail: string
  status: string
  total: string
  itemCount: number
}

interface InternalUser extends AuditFields {
  id: string
  name: string
  email: string
  isInternal: boolean
  isAdmin: boolean
  channel: string
  orderCount: number
}

interface InternalProduct extends AuditFields {
  id: string
  slug: string
  title: string
  category: string
  material: string
  active: boolean
  imageVectors: number
  updatedAt: string
}

interface HomepageSlideRecord {
  id?: string
  imageUrl: string
  mobileImageUrl?: string
  headline?: string
  subheadline?: string
  ctaLabel?: string
  ctaHref?: string
  device?: 'all' | 'desktop' | 'mobile'
  sortOrder?: number
  active?: boolean
}

const router = useRouter()
const { user, isInternalUser, isAdminUser } = useAuth()
const { orders: localOrders } = useOrders()
const { activeTabId } = useInternalWorkspaceTab()
const error = ref('')
const homepageSlides = ref<HomepageSlideRecord[]>([])
const homepageGrid = ref<HTMLElement | null>(null)
const homepageLoading = ref(false)
const homepageSaving = ref(false)
const homepageUploading = ref(false)
const homepageMessage = ref('')
const logoUrl = ref('')
const logoLoading = ref(false)
const logoSaving = ref(false)
const logoMessage = ref('')

// --- Shop by Collection tile images ---
// The fixed collections rendered on the homepage grid. The admin can attach an
// image to each; slugs left blank keep the bundled gradient placeholder.
const collectionLinks = COLLECTION_LINKS
const collectionImages = ref<Record<string, string>>({})
const collectionImagesSaving = ref(false)
const collectionImagesUploading = ref(false)
const collectionImagesMessage = ref('')
const logoPreviewSrc = computed(() => logoUrl.value || DEFAULT_LOGO_SRC)

// --- About Us page content ---
// Hero copy, journey milestones (group/founder photos), and team portraits for
// the storefront About page. Empty fields / lists fall back to the storefront's
// bundled defaults.
interface AboutJourneyDraft {
  year: string
  place: string
  title: string
  desc: string
  imageUrl: string
  active: boolean
}
interface AboutTeamDraft {
  name: string
  role: string
  imageUrl: string
  active: boolean
}
const aboutHeroEyebrow = ref('')
const aboutHeroHeadline = ref('')
const aboutHeroSubheadline = ref('')
const aboutJourney = ref<AboutJourneyDraft[]>([])
const aboutTeam = ref<AboutTeamDraft[]>([])
const aboutSaving = ref(false)
const aboutUploading = ref(false)
const aboutMessage = ref('')

// --- Volume (quantity) discount config ---
interface DiscountTierDraft {
  minQty: number | null
  percent: number | null
}
const volumeDiscountEnabled = ref(false)
const volumeDiscountTiers = ref<DiscountTierDraft[]>([])
const discountSaving = ref(false)
const discountMessage = ref('')
// --- Orders tab: searchable + paginated list (replaces the capped dashboard
// payload so search covers every order, not just the newest 25) ---
const orders = ref<InternalOrder[]>([])
const orderSearch = ref('')
const orderTotal = ref(0)
const orderHasMore = ref(false)
const orderListLoading = ref(false)
const orderLoadingMore = ref(false)
// Whether the backend list answered at least once — distinguishes "no matches"
// from "backend unreachable" so the local-order fallback stays honest.
const ordersFetched = ref(false)
let orderSearchDebounce: ReturnType<typeof setTimeout> | undefined

async function loadOrders(reset = true) {
  if (!isInternalUser.value || !user.value?.id) return
  const skip = reset ? 0 : orders.value.length
  if (reset) orderListLoading.value = true
  else orderLoadingMore.value = true
  try {
    const params = new URLSearchParams({
      resource: 'orders-list',
      userId: user.value.id,
      skip: String(skip),
    })
    if (orderSearch.value.trim()) params.set('search', orderSearch.value.trim())
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load orders.')
    orders.value = reset ? data.orders : [...orders.value, ...data.orders]
    orderTotal.value = data.total ?? orders.value.length
    orderHasMore.value = Boolean(data.hasMore)
    ordersFetched.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load orders.'
  } finally {
    orderListLoading.value = false
    orderLoadingMore.value = false
  }
}

function onOrderSearchInput() {
  if (orderSearchDebounce) clearTimeout(orderSearchDebounce)
  orderSearchDebounce = setTimeout(() => void loadOrders(true), 300)
}

// --- Memos tab: goods out on consignment, searchable + paginated ---
interface InternalMemoItem {
  id: string
  title: string
  qty: number
  outQty: number
  returnedQty: number
  convertedQty: number
  status: string
  formattedPrice: string
}

interface InternalMemo {
  id: string
  memoNo: string
  status: string
  isOverdue: boolean
  customerId: string | null
  customer: string
  customerEmail: string
  itemCount: number
  issuedAt: string
  dueDate: string
  formattedSubtotal: string
  formattedOutstanding: string
  createdBy?: string
  modifiedBy?: string
  modifiedAt?: string
  items: InternalMemoItem[]
}

const memos = ref<InternalMemo[]>([])
const memoSearch = ref('')
const memoStatusFilter = ref('OPEN')
const memoTotal = ref(0)
const memoHasMore = ref(false)
const memoListLoading = ref(false)
const memoLoadingMore = ref(false)
const memoSummary = ref<{
  openCount: number
  formattedOutstanding: string
  overdueCount: number
  formattedOverdue: string
} | null>(null)
let memoSearchDebounce: ReturnType<typeof setTimeout> | undefined

const memoStatusOptions = [
  { value: 'OPEN', label: 'Open' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: '', label: 'All' },
]

async function loadMemos(reset = true) {
  if (!isInternalUser.value || !user.value?.id) return
  const skip = reset ? 0 : memos.value.length
  if (reset) memoListLoading.value = true
  else memoLoadingMore.value = true
  try {
    const params = new URLSearchParams({
      resource: 'memos-list',
      userId: user.value.id,
      skip: String(skip),
    })
    if (memoSearch.value.trim()) params.set('search', memoSearch.value.trim())
    if (memoStatusFilter.value) params.set('status', memoStatusFilter.value)
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load memos.')
    memos.value = reset ? data.memos : [...memos.value, ...data.memos]
    memoTotal.value = data.total ?? memos.value.length
    memoHasMore.value = Boolean(data.hasMore)
    memoSummary.value = data.summary || null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load memos.'
  } finally {
    memoListLoading.value = false
    memoLoadingMore.value = false
  }
}

function onMemoSearchInput() {
  if (memoSearchDebounce) clearTimeout(memoSearchDebounce)
  memoSearchDebounce = setTimeout(() => void loadMemos(true), 300)
}

function memoDaysLeft(memo: InternalMemo) {
  const ms = new Date(memo.dueDate).getTime() - Date.now()
  const days = Math.ceil(ms / 86400000)
  if (memo.status === 'CONVERTED' || memo.status === 'RETURNED' || memo.status === 'CANCELLED') return '—'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  return `${days}d left`
}

function openMemoDetail(memo: InternalMemo) {
  void router.push({ name: 'internal-memo', params: { id: memo.id } })
}

// --- Users tab: searchable + paginated list ---
const users = ref<InternalUser[]>([])
const userSearch = ref('')
const userTotal = ref(0)
const userHasMore = ref(false)
const userListLoading = ref(false)
const userLoadingMore = ref(false)
let userSearchDebounce: ReturnType<typeof setTimeout> | undefined

async function loadUsers(reset = true) {
  if (!isInternalUser.value || !user.value?.id) return
  const skip = reset ? 0 : users.value.length
  if (reset) userListLoading.value = true
  else userLoadingMore.value = true
  try {
    const params = new URLSearchParams({
      resource: 'users-list',
      userId: user.value.id,
      skip: String(skip),
    })
    if (userSearch.value.trim()) params.set('search', userSearch.value.trim())
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load users.')
    users.value = reset ? data.users : [...users.value, ...data.users]
    userTotal.value = data.total ?? users.value.length
    userHasMore.value = Boolean(data.hasMore)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load users.'
  } finally {
    userListLoading.value = false
    userLoadingMore.value = false
  }
}

function onUserSearchInput() {
  if (userSearchDebounce) clearTimeout(userSearchDebounce)
  userSearchDebounce = setTimeout(() => void loadUsers(true), 300)
}

// --- Approvals tab: the storefront sign-up queue ---
// Sign-ups create a SignupRequest instead of a User; approving one is what
// creates the account, so only Full Admins get the approve/reject buttons
// (api/internal.js enforces the same rule).
const signupRequests = ref<SignupRequest[]>([])
const signupSearch = ref('')
const signupStatusFilter = ref<SignupRequestStatus | 'all'>('pending')
const signupStatusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All requests' },
]
const signupTotal = ref(0)
const signupPendingCount = ref(0)
const signupHasMore = ref(false)
const signupListLoading = ref(false)
const signupLoadingMore = ref(false)
const signupError = ref('')
const signupActionReference = ref('')
const signupMessage = ref('')
const signupSkeletonWidths = ['ect-w-24', 'ect-w-40', 'ect-w-36', 'ect-w-28', 'ect-w-20', 'ect-w-24']
let signupSearchDebounce: ReturnType<typeof setTimeout> | undefined

async function loadSignupRequests(reset = true) {
  if (!isInternalUser.value || !user.value?.id) return
  const skip = reset ? 0 : signupRequests.value.length
  if (reset) signupListLoading.value = true
  else signupLoadingMore.value = true
  signupError.value = ''
  try {
    const page = await fetchSignupRequests(user.value.id, {
      status: signupStatusFilter.value,
      search: signupSearch.value,
      skip,
    })
    signupRequests.value = reset ? page.requests : [...signupRequests.value, ...page.requests]
    signupTotal.value = page.total
    signupPendingCount.value = page.pendingCount
    signupHasMore.value = page.hasMore
  } catch (e) {
    signupError.value = e instanceof Error ? e.message : 'Unable to load sign-up requests.'
  } finally {
    signupListLoading.value = false
    signupLoadingMore.value = false
  }
}

function onSignupSearchInput() {
  if (signupSearchDebounce) clearTimeout(signupSearchDebounce)
  signupSearchDebounce = setTimeout(() => void loadSignupRequests(true), 300)
}

function onSignupStatusChange(next: string) {
  signupStatusFilter.value = next as SignupRequestStatus | 'all'
  void loadSignupRequests(true)
}

// Rejecting asks for a reason first — it is emailed to the applicant.
async function decideSignupRequest(request: SignupRequest, action: 'approve' | 'reject') {
  if (!user.value?.id || signupActionReference.value) return
  let note = ''
  if (action === 'reject') {
    const reason = window.prompt(`Why is ${request.reference} being rejected? (optional)`, '')
    if (reason === null) return
    note = reason
  } else if (!window.confirm(`Approve ${request.reference} and create an account for ${request.email}?`)) {
    return
  }
  signupActionReference.value = request.reference
  signupMessage.value = ''
  signupError.value = ''
  try {
    await reviewSignupRequest(user.value.id, request.reference, action, { note })
    signupMessage.value =
      action === 'approve'
        ? `${request.reference} approved — the account for ${request.email} is live.`
        : `${request.reference} rejected.`
    await loadSignupRequests(true)
    // An approval adds a customer, so the users tab is stale until reloaded.
    if (action === 'approve') void loadUsers(true)
  } catch (e) {
    signupError.value = e instanceof Error ? e.message : 'Could not update this request.'
  } finally {
    signupActionReference.value = ''
  }
}

function signupStatusClass(status: SignupRequestStatus) {
  if (status === 'approved') return 'ect-bg-emerald-100 ect-text-emerald-800'
  if (status === 'rejected') return 'ect-bg-red-100 ect-text-red-700'
  return 'ect-bg-sand ect-text-gold-700'
}

// --- "New …" creation modals, one per tab ---
const newOrderOpen = ref(false)
const newUserOpen = ref(false)

function onOrderCreated() {
  newOrderOpen.value = false
  void loadOrders(true)
  void loadMemos(true)
}

function onUserCreated() {
  newUserOpen.value = false
  void loadUsers(true)
}

// --- Products tab: searchable + paginated list (independent of the dashboard
// payload so the table is no longer capped at the first 50 records) ---
const products = ref<InternalProduct[]>([])
const productSearch = ref('')
const productStatusFilter = ref<'all' | 'active' | 'hidden'>('all')
const productStatusOptions = [
  { value: 'all', label: 'All products' },
  { value: 'active', label: 'Active products' },
  { value: 'hidden', label: 'Hidden products' },
]
const productVectorFilter = ref<'all' | 'synced' | 'missing'>('all')
const productVectorOptions = [
  { value: 'all', label: 'All photo vectors' },
  { value: 'synced', label: 'Vectors synced' },
  { value: 'missing', label: 'Vectors not synced' },
]
const productTotal = ref(0)
const productHasMore = ref(false)
const productListLoading = ref(false)
const productLoadingMore = ref(false)
let productSearchDebounce: ReturnType<typeof setTimeout> | undefined

async function loadProducts(reset = true) {
  if (!isInternalUser.value || !user.value?.id) return
  const skip = reset ? 0 : products.value.length
  if (reset) productListLoading.value = true
  else productLoadingMore.value = true
  try {
    const params = new URLSearchParams({
      resource: 'products-list',
      userId: user.value.id,
      skip: String(skip),
    })
    if (productSearch.value.trim()) params.set('search', productSearch.value.trim())
    if (productStatusFilter.value !== 'all') params.set('status', productStatusFilter.value)
    if (productVectorFilter.value !== 'all') params.set('vectors', productVectorFilter.value)
    const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load products.')
    products.value = reset ? data.products : [...products.value, ...data.products]
    productTotal.value = data.total ?? products.value.length
    productHasMore.value = Boolean(data.hasMore)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load products.'
  } finally {
    productListLoading.value = false
    productLoadingMore.value = false
  }
}

function onProductSearchInput() {
  if (productSearchDebounce) clearTimeout(productSearchDebounce)
  productSearchDebounce = setTimeout(() => void loadProducts(true), 300)
}

function onProductStatusChange() {
  void loadProducts(true)
}

const skeletonRows = Array.from({ length: 5 }, (_, index) => index)
const orderSkeletonWidths = ['ect-w-32', 'ect-w-40', 'ect-w-10', 'ect-w-20', 'ect-w-20', 'ect-w-28']
const userSkeletonWidths = ['ect-w-32', 'ect-w-44', 'ect-w-20', 'ect-w-24', 'ect-w-10', 'ect-w-28']
const productSkeletonWidths = ['ect-w-44', 'ect-w-24', 'ect-w-24', 'ect-w-16', 'ect-w-20', 'ect-w-28']

const displayOrders = computed<InternalOrder[]>(() => {
  if (orders.value.length) return orders.value
  const q = orderSearch.value.trim().toLowerCase()
  // The backend answered (possibly with zero matches) — trust it over the
  // local fallback so a search never surfaces unrelated cached orders.
  if (ordersFetched.value && q) return []
  const fallbackCustomer = user.value?.name || 'Current customer'
  const fallback = localOrders.value.map((order) => ({
    id: order.id,
    orderNo: order.id,
    customerId: null,
    customer: fallbackCustomer,
    customerEmail: user.value?.email || '',
    status: order.status,
    total: order.formattedTotal,
    itemCount: order.itemCount,
    // Locally-cached orders were placed by the signed-in customer.
    createdBy: fallbackCustomer,
    createdAt: order.createdAt,
    modifiedBy: null,
    modifiedAt: null,
  }))
  if (!q) return fallback
  return fallback.filter((order) =>
    [order.orderNo, order.customer, order.customerEmail, order.status].some((v) =>
      String(v || '').toLowerCase().includes(q)
    )
  )
})

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

// --- Run all products through AI (regenerate description + image-search vector) ---
// Driven from the products tab toolbar. Processes products in small batches via
// cursor pagination so each request stays under serverless timeouts.
const AI_BATCH_SIZE = 3
const aiModalOpen = ref(false)
const aiScope = ref<'missing' | 'all'>('missing')
const aiRunning = ref(false)
const aiStopRequested = ref(false)
const aiError = ref('')
const aiProgress = ref({ done: 0, total: 0 })
const aiTotals = ref<Record<string, number>>({ generated: 0, empty: 0, skipped: 0, error: 0 })
const aiResults = ref<{ slug: string; status: string; message: string }[]>([])

// CSV column order must match the bulk-import schema so an exported file can be
// edited and re-uploaded without creating duplicates (import upserts by slug).
const EXPORT_COLUMNS = [
  'slug', 'title', 'category', 'subtype', 'material', 'color', 'price', 'description',
  'grossWeight', 'diamondCarats', 'diamondQuantity',
  'styleTags', 'stoneTags',
  'isNewArrival', 'isBestSeller', 'active', 'rating', 'reviewCount',
  'diamondQualities', 'metalPurities', 'centerShapes', 'centerStoneSizes',
  'stoneTypes', 'ringSizes', 'bangleSizes', 'necklaceSizes',
  'allowCustomCenterStoneSize', 'allowCustomStoneType',
]

const exporting = ref(false)
const exportError = ref('')

// "More" dropdown in the products toolbar (holds secondary actions)
const productMoreOpen = ref(false)
const productMoreRef = ref<HTMLElement | null>(null)

function closeProductMoreOnOutsideClick(e: MouseEvent) {
  if (productMoreRef.value && !productMoreRef.value.contains(e.target as Node)) {
    productMoreOpen.value = false
  }
}

async function exportProducts() {
  if (!user.value?.id || exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    const res = await fetch(
      `${API_BASE}/api/internal?resource=product&action=export&userId=${encodeURIComponent(user.value.id)}`,
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data?.message || 'Export request failed.')
    const records = (data.rows || []) as Record<string, string>[]
    if (!records.length) { exportError.value = 'No products to export.'; return }
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const csv =
      EXPORT_COLUMNS.join(',') + '\n' +
      records.map((r) => EXPORT_COLUMNS.map((c) => esc(r[c] ?? '')).join(',')).join('\n') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : 'Export failed.'
  } finally {
    exporting.value = false
  }
}

function aiStatusClass(status: string) {
  if (status === 'generated') return 'ect-bg-green-100 ect-text-green-700'
  if (status === 'skipped' || status === 'empty') return 'ect-bg-amber-100 ect-text-amber-700'
  return 'ect-bg-red-100 ect-text-red-700'
}

// --- Photo-vector sync (image embeddings only, no AI descriptions) ---------
// Picks up photos uploaded to a product's S3 folder after the product was
// created. Runs scope 'all' because already-embedded photos are skipped
// server-side by hash — only new/changed photos cost an embedding call.
// 1 product per request: a product can need up to 12 photo embeddings in one
// call, which already brushes the serverless timeout — batching 3 such
// products 504s the request (seen in production).
const SYNC_BATCH_SIZE = 1
const syncRunning = ref(false)
const syncStopRequested = ref(false)
const syncError = ref('')
const syncProgress = ref({ done: 0, total: 0 })
const syncTotals = ref<Record<string, number>>({})
const syncResults = ref<{ slug: string; status: string; message: string }[]>([])

function syncStatusClass(status: string) {
  if (status === 'synced') return 'ect-bg-green-100 ect-text-green-700'
  if (status === 'error') return 'ect-bg-red-100 ect-text-red-700'
  return 'ect-bg-amber-100 ect-text-amber-700'
}

async function runPhotoVectorSync() {
  if (!user.value?.id || syncRunning.value) return

  syncRunning.value = true
  syncStopRequested.value = false
  syncError.value = ''
  syncProgress.value = { done: 0, total: 0 }
  syncTotals.value = {}
  syncResults.value = []

  let cursor: string | null = null
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (syncStopRequested.value) break
      const res = await fetch(
        `${API_BASE}/api/internal?resource=product&action=resync-image-embeddings&userId=${encodeURIComponent(user.value.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.value.id,
            action: 'resync-image-embeddings',
            scope: 'all',
            limit: SYNC_BATCH_SIZE,
            cursor,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Photo vector sync request failed.')

      for (const r of data.results || []) {
        syncResults.value.push(r)
        syncTotals.value[r.status] = (syncTotals.value[r.status] || 0) + 1
      }
      syncProgress.value = {
        done: syncResults.value.length,
        total: typeof data.total === 'number' ? data.total : syncResults.value.length,
      }
      cursor = data.nextCursor || cursor
      if (data.done || !(data.results || []).length) break
    }
  } catch (e) {
    syncError.value = e instanceof Error ? e.message : 'Photo vector sync failed.'
  } finally {
    syncRunning.value = false
    // Refresh the table so the "Photo vectors" badges reflect the sync.
    void loadProducts(true)
  }
}

function stopPhotoVectorSync() {
  syncStopRequested.value = true
}

function openAiModal() {
  if (aiRunning.value) return
  aiModalOpen.value = true
}

async function runAllThroughAi() {
  if (!user.value?.id || aiRunning.value) return
  aiModalOpen.value = false

  aiRunning.value = true
  aiStopRequested.value = false
  aiError.value = ''
  aiProgress.value = { done: 0, total: 0 }
  aiTotals.value = { generated: 0, empty: 0, skipped: 0, error: 0 }
  aiResults.value = []

  let cursor: string | null = null
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (aiStopRequested.value) break
      const res = await fetch(
        `${API_BASE}/api/internal?resource=product&action=bulk-ai&userId=${encodeURIComponent(user.value.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.value.id,
            action: 'bulk-ai',
            scope: aiScope.value,
            limit: AI_BATCH_SIZE,
            cursor,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'AI run request failed.')

      for (const r of data.results || []) {
        aiResults.value.push(r)
        aiTotals.value[r.status] = (aiTotals.value[r.status] || 0) + 1
      }
      aiProgress.value = {
        done: aiResults.value.length,
        total: typeof data.total === 'number' ? data.total : aiResults.value.length,
      }
      cursor = data.nextCursor || cursor
      if (data.done || !(data.results || []).length) break
    }
  } catch (e) {
    aiError.value = e instanceof Error ? e.message : 'AI run failed.'
  } finally {
    aiRunning.value = false
  }
}

function stopAiRun() {
  aiStopRequested.value = true
}

function customerDetailPath(order: InternalOrder) {
  return order.customerId ? `/internal/users/${order.customerId}` : null
}

function openOrderDetail(order: InternalOrder) {
  void router.push({ name: 'internal-order', params: { id: order.id } })
}

function createHomepageSlide(): HomepageSlideRecord {
  return {
    imageUrl: '',
    mobileImageUrl: '',
    headline: '',
    subheadline: '',
    ctaLabel: '',
    ctaHref: '',
    device: 'all',
    sortOrder: homepageSlides.value.length,
    active: true,
  }
}

function normalizeHomepageSlidesForView(slides: any[]) {
  return Array.isArray(slides)
    ? slides.map((slide: any, index: number) => ({
        id: slide?.id ? String(slide.id) : undefined,
        imageUrl: String(slide?.imageUrl || ''),
        mobileImageUrl: String(slide?.mobileImageUrl || ''),
        headline: String(slide?.headline || ''),
        subheadline: String(slide?.subheadline || ''),
        ctaLabel: String(slide?.ctaLabel || ''),
        ctaHref: String(slide?.ctaHref || ''),
        device:
          slide?.device === 'desktop' || slide?.device === 'mobile' ? slide.device : 'all',
        sortOrder:
          Number.isFinite(Number(slide?.sortOrder)) && Number(slide.sortOrder) >= 0
            ? Number(slide.sortOrder)
            : index,
        active: slide?.active !== false,
      }))
    : []
}

function refreshHomepageSortOrder() {
  homepageSlides.value = homepageSlides.value.map((slide, index) => ({
    ...slide,
    sortOrder: index,
  }))
}

async function addHomepageSlide() {
  homepageSlides.value.push(createHomepageSlide())
  refreshHomepageSortOrder()
  homepageMessage.value = ''
  await nextTick()
  const cards = homepageGrid.value?.querySelectorAll(':scope > article')
  const newCard = cards?.[cards.length - 1]
  newCard?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeHomepageSlide(index: number) {
  homepageSlides.value.splice(index, 1)
  refreshHomepageSortOrder()
}

function moveHomepageSlide(index: number, direction: number) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= homepageSlides.value.length) return
  const nextSlides = [...homepageSlides.value]
  const [target] = nextSlides.splice(index, 1)
  if (!target) return
  nextSlides.splice(nextIndex, 0, target)
  homepageSlides.value = nextSlides
  refreshHomepageSortOrder()
}

const MAX_INLINE_IMAGE_LENGTH = 750_000
const MAX_UPLOAD_DIMENSION = 1600

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Unable to read selected image.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to read selected image.'))
    image.src = url
  })
}

// Downscale + re-encode an inline data URL to WebP so it stays small enough to
// fit inside the serverless request body limit (full-size photos overflow it).
// External http(s) URLs are passed through untouched.
async function compressDataUrl(url: string) {
  if (!url.startsWith('data:')) return url
  try {
    const image = await loadImage(url)
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return url
    context.drawImage(image, 0, 0, width, height)
    const compressed = canvas.toDataURL('image/webp', 0.82)
    return compressed.length < url.length ? compressed : url
  } catch {
    return url
  }
}

async function compressImageFile(file: File) {
  return compressDataUrl(await readFileAsDataUrl(file))
}

// Upload the original (full-resolution) file straight to S3 via a presigned
// URL and return its public URL. Returns null when uploads aren't configured
// (e.g. local dev without S3) so the caller can fall back to inline storage.
async function uploadHomepageImageToS3(
  file: File,
  target: 'desktop' | 'mobile' | 'collection' | 'about',
): Promise<string | null> {
  const userId = user.value?.id
  if (!userId) return null

  const presignRes = await fetch(
    `${API_BASE}/api/internal?resource=upload-image&userId=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, target }),
    },
  )

  // Uploads not configured (501) or endpoint not deployed yet (404) → signal
  // the caller to use the base64 fallback rather than failing.
  if (presignRes.status === 501 || presignRes.status === 404) return null
  const presign = await presignRes.json().catch(() => ({}))
  if (!presignRes.ok) throw new Error(presign?.message || 'Unable to start the upload.')

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!putRes.ok) throw new Error('Upload to storage failed. Please try again.')

  return String(presign.publicUrl || '')
}

async function onHomepageSlideFileChange(index: number, event: Event, target: 'desktop' | 'mobile') {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  homepageMessage.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    homepageMessage.value = 'Please choose a JPG, PNG, WEBP, or AVIF image.'
    if (input) input.value = ''
    return
  }
  // S3 stores the full-resolution file, so we allow large banners here. The
  // inline (base64) fallback still downscales aggressively to fit the DB.
  if (file.size > 15 * 1024 * 1024) {
    homepageMessage.value = 'Please choose an image smaller than 15 MB.'
    if (input) input.value = ''
    return
  }
  const field = target === 'desktop' ? 'imageUrl' : 'mobileImageUrl'
  const applyUrl = (url: string) => {
    const nextSlides = [...homepageSlides.value]
    if (!nextSlides[index]) return
    nextSlides[index] = { ...nextSlides[index], [field]: url }
    homepageSlides.value = nextSlides
  }
  homepageUploading.value = true
  try {
    // Preferred path: upload the original file to S3 and store its public URL.
    const publicUrl = await uploadHomepageImageToS3(file, target)
    if (publicUrl) {
      applyUrl(publicUrl)
      return
    }

    // Fallback (no S3 configured): downscale + inline as a base64 data URL.
    const dataUrl = await compressImageFile(file)
    if (dataUrl.length > MAX_INLINE_IMAGE_LENGTH) {
      homepageMessage.value =
        'This image is too large to save even after compression. Please use a smaller image or paste an image URL instead.'
      return
    }
    applyUrl(dataUrl)
  } catch (error) {
    homepageMessage.value = error instanceof Error ? error.message : 'Unable to read image.'
  } finally {
    homepageUploading.value = false
    if (input) input.value = ''
  }
}

async function loadHomepageSlides() {
  if (!isInternalUser.value || !user.value?.id) return
  homepageLoading.value = true
  homepageMessage.value = ''
  try {
    const res = await fetch(
      `${API_BASE}/api/internal?resource=homepage-slides&userId=${encodeURIComponent(user.value.id)}`
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load homepage slides.')
    homepageSlides.value = normalizeHomepageSlidesForView(data?.slides)
  } catch (e) {
    homepageMessage.value = e instanceof Error ? e.message : 'Unable to load homepage slides.'
  } finally {
    homepageLoading.value = false
  }
}

async function saveHomepageSlides() {
  if (!isInternalUser.value || !user.value?.id) return
  homepageSaving.value = true
  homepageMessage.value = ''
  try {
    // Re-compress any oversized inline images (including legacy slides saved
    // before compression existed) so the request body stays under the
    // serverless payload limit — otherwise the whole save fails with a 413.
    const slidesToSave = await Promise.all(
      homepageSlides.value.map(async (slide, index) => {
        const next = { ...slide, sortOrder: index }
        if (next.imageUrl && next.imageUrl.length > MAX_INLINE_IMAGE_LENGTH) {
          next.imageUrl = await compressDataUrl(next.imageUrl)
        }
        if (next.mobileImageUrl && next.mobileImageUrl.length > MAX_INLINE_IMAGE_LENGTH) {
          next.mobileImageUrl = await compressDataUrl(next.mobileImageUrl)
        }
        return next
      })
    )
    homepageSlides.value = slidesToSave.map((slide) => ({ ...slide }))

    const oversized = slidesToSave.find(
      (slide) =>
        (slide.imageUrl?.length || 0) > MAX_INLINE_IMAGE_LENGTH ||
        (slide.mobileImageUrl?.length || 0) > MAX_INLINE_IMAGE_LENGTH
    )
    if (oversized) {
      homepageMessage.value =
        'An image is too large to save even after compression. Please replace it with a smaller image or an image URL.'
      return
    }

    const res = await fetch(`${API_BASE}/api/internal?resource=homepage-slides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value.id,
        slides: slidesToSave,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to save homepage slides.')
    homepageSlides.value = normalizeHomepageSlidesForView(data?.slides)
    invalidateHomepageSlides()
    homepageMessage.value = 'Homepage slides saved.'
  } catch (e) {
    homepageMessage.value = e instanceof Error ? e.message : 'Unable to save homepage slides.'
  } finally {
    homepageSaving.value = false
  }
}

async function loadSiteConfig() {
  if (!isInternalUser.value || !user.value?.id) return
  logoLoading.value = true
  try {
    const res = await fetch(
      `${API_BASE}/api/internal?resource=site-config&userId=${encodeURIComponent(user.value.id)}`
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load branding settings.')
    logoUrl.value = String(data?.siteConfig?.logoUrl || '')
    volumeDiscountEnabled.value = Boolean(data?.siteConfig?.volumeDiscountEnabled)
    const rawTiers = Array.isArray(data?.siteConfig?.volumeDiscountTiers)
      ? data.siteConfig.volumeDiscountTiers
      : []
    volumeDiscountTiers.value = rawTiers
      .map((t: { minQty?: number; percent?: number }) => ({ minQty: Number(t?.minQty), percent: Number(t?.percent) }))
      .sort((a: DiscountTierDraft, b: DiscountTierDraft) => Number(a.minQty) - Number(b.minQty))
    collectionImages.value = normalizeCollectionImagesForView(data?.siteConfig?.collectionImages)
    applyAboutContentToView(data?.siteConfig?.aboutContent)
  } catch (e) {
    logoMessage.value = e instanceof Error ? e.message : 'Unable to load branding settings.'
  } finally {
    logoLoading.value = false
  }
}

function addDiscountTier() {
  volumeDiscountTiers.value.push({ minQty: null, percent: null })
  discountMessage.value = ''
}

function removeDiscountTier(index: number) {
  volumeDiscountTiers.value.splice(index, 1)
  discountMessage.value = ''
}

async function saveDiscountConfig() {
  if (!isInternalUser.value || !user.value?.id) return
  discountSaving.value = true
  discountMessage.value = ''
  try {
    // Drop blank/invalid rows so the admin can leave an empty draft row around.
    const tiers = volumeDiscountTiers.value
      .map((t) => ({ minQty: Math.floor(Number(t.minQty)), percent: Number(t.percent) }))
      .filter((t) => Number.isFinite(t.minQty) && t.minQty >= 1 && Number.isFinite(t.percent) && t.percent > 0 && t.percent <= 100)
    const res = await fetch(`${API_BASE}/api/internal?resource=site-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value.id,
        volumeDiscountEnabled: volumeDiscountEnabled.value,
        volumeDiscountTiers: tiers,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to save discount settings.')
    const savedTiers = Array.isArray(data?.siteConfig?.volumeDiscountTiers) ? data.siteConfig.volumeDiscountTiers : []
    volumeDiscountTiers.value = savedTiers
      .map((t: { minQty?: number; percent?: number }) => ({ minQty: Number(t?.minQty), percent: Number(t?.percent) }))
      .sort((a: DiscountTierDraft, b: DiscountTierDraft) => Number(a.minQty) - Number(b.minQty))
    volumeDiscountEnabled.value = Boolean(data?.siteConfig?.volumeDiscountEnabled)
    invalidateSiteConfig()
    discountMessage.value = 'Discount settings saved.'
  } catch (e) {
    discountMessage.value = e instanceof Error ? e.message : 'Unable to save discount settings.'
  } finally {
    discountSaving.value = false
  }
}

async function onLogoFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  logoMessage.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    logoMessage.value = 'Please choose a PNG, JPG, or WEBP image.'
    if (input) input.value = ''
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    logoMessage.value = 'Please choose an image smaller than 8 MB.'
    if (input) input.value = ''
    return
  }
  try {
    logoUrl.value = await compressImageFile(file)
  } catch (e) {
    logoMessage.value = e instanceof Error ? e.message : 'Unable to read image.'
  } finally {
    if (input) input.value = ''
  }
}

function clearLogo() {
  logoUrl.value = ''
  logoMessage.value = ''
}

async function saveSiteConfig() {
  if (!isInternalUser.value || !user.value?.id) return
  logoSaving.value = true
  logoMessage.value = ''
  try {
    if (logoUrl.value && logoUrl.value.length > MAX_INLINE_IMAGE_LENGTH) {
      logoUrl.value = await compressDataUrl(logoUrl.value)
    }
    if (logoUrl.value && logoUrl.value.length > MAX_INLINE_IMAGE_LENGTH) {
      logoMessage.value =
        'The logo is too large to save even after compression. Please use a smaller image or an image URL.'
      return
    }
    const res = await fetch(`${API_BASE}/api/internal?resource=site-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.value.id, logoUrl: logoUrl.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to save branding settings.')
    logoUrl.value = String(data?.siteConfig?.logoUrl || '')
    invalidateSiteConfig()
    logoMessage.value = 'Branding saved.'
  } catch (e) {
    logoMessage.value = e instanceof Error ? e.message : 'Unable to save branding settings.'
  } finally {
    logoSaving.value = false
  }
}

function normalizeCollectionImagesForView(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const images: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const slug = String(key || '').trim()
    const url = typeof value === 'string' ? value.trim() : ''
    if (slug && url) images[slug] = url
  }
  return images
}

async function onCollectionImageFileChange(slug: string, event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  collectionImagesMessage.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    collectionImagesMessage.value = 'Please choose a JPG, PNG, WEBP, or AVIF image.'
    if (input) input.value = ''
    return
  }
  if (file.size > 15 * 1024 * 1024) {
    collectionImagesMessage.value = 'Please choose an image smaller than 15 MB.'
    if (input) input.value = ''
    return
  }
  collectionImagesUploading.value = true
  try {
    // Preferred path: upload the original to S3 and store its public URL;
    // fall back to a downscaled inline data URL when S3 isn't configured.
    const publicUrl = await uploadHomepageImageToS3(file, 'collection')
    if (publicUrl) {
      collectionImages.value = { ...collectionImages.value, [slug]: publicUrl }
      return
    }
    const dataUrl = await compressImageFile(file)
    if (dataUrl.length > MAX_INLINE_IMAGE_LENGTH) {
      collectionImagesMessage.value =
        'This image is too large to save even after compression. Please use a smaller image or paste an image URL instead.'
      return
    }
    collectionImages.value = { ...collectionImages.value, [slug]: dataUrl }
  } catch (error) {
    collectionImagesMessage.value = error instanceof Error ? error.message : 'Unable to read image.'
  } finally {
    collectionImagesUploading.value = false
    if (input) input.value = ''
  }
}

function setCollectionImageUrl(slug: string, value: string) {
  const next = { ...collectionImages.value }
  if (value.trim()) next[slug] = value
  else delete next[slug]
  collectionImages.value = next
}

function clearCollectionImage(slug: string) {
  const next = { ...collectionImages.value }
  delete next[slug]
  collectionImages.value = next
  collectionImagesMessage.value = ''
}

async function saveCollectionImages() {
  if (!isInternalUser.value || !user.value?.id) return
  collectionImagesSaving.value = true
  collectionImagesMessage.value = ''
  try {
    // Re-compress any oversized inline images so the request body stays under
    // the serverless payload limit; trim and drop blanks before saving.
    const payload: Record<string, string> = {}
    for (const link of collectionLinks) {
      let url = (collectionImages.value[link.slug] || '').trim()
      if (!url) continue
      if (url.length > MAX_INLINE_IMAGE_LENGTH) url = await compressDataUrl(url)
      payload[link.slug] = url
    }
    const oversized = Object.values(payload).some((url) => url.length > MAX_INLINE_IMAGE_LENGTH)
    if (oversized) {
      collectionImagesMessage.value =
        'An image is too large to save even after compression. Please replace it with a smaller image or an image URL.'
      return
    }
    const res = await fetch(`${API_BASE}/api/internal?resource=site-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.value.id, collectionImages: payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to save collection images.')
    collectionImages.value = normalizeCollectionImagesForView(data?.siteConfig?.collectionImages)
    invalidateSiteConfig()
    collectionImagesMessage.value = 'Collection images saved.'
  } catch (e) {
    collectionImagesMessage.value = e instanceof Error ? e.message : 'Unable to save collection images.'
  } finally {
    collectionImagesSaving.value = false
  }
}

// --- About Us page editor ---

function applyAboutContentToView(raw: unknown) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  aboutHeroEyebrow.value = str(src.heroEyebrow)
  aboutHeroHeadline.value = str(src.heroHeadline)
  aboutHeroSubheadline.value = str(src.heroSubheadline)
  aboutJourney.value = Array.isArray(src.journey)
    ? (src.journey as Array<Record<string, unknown>>).map((entry) => ({
        year: str(entry?.year),
        place: str(entry?.place),
        title: str(entry?.title),
        desc: str(entry?.desc),
        imageUrl: str(entry?.imageUrl),
        active: entry?.active !== false,
      }))
    : []
  aboutTeam.value = Array.isArray(src.team)
    ? (src.team as Array<Record<string, unknown>>).map((entry) => ({
        name: str(entry?.name),
        role: str(entry?.role),
        imageUrl: str(entry?.imageUrl),
        active: entry?.active !== false,
      }))
    : []
}

function addAboutJourney() {
  aboutJourney.value.push({ year: '', place: '', title: '', desc: '', imageUrl: '', active: true })
  aboutMessage.value = ''
}

function removeAboutJourney(index: number) {
  aboutJourney.value.splice(index, 1)
}

function moveAboutJourney(index: number, direction: number) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= aboutJourney.value.length) return
  const next = [...aboutJourney.value]
  const [target] = next.splice(index, 1)
  if (!target) return
  next.splice(nextIndex, 0, target)
  aboutJourney.value = next
}

function addAboutTeam() {
  aboutTeam.value.push({ name: '', role: '', imageUrl: '', active: true })
  aboutMessage.value = ''
}

function removeAboutTeam(index: number) {
  aboutTeam.value.splice(index, 1)
}

function moveAboutTeam(index: number, direction: number) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= aboutTeam.value.length) return
  const next = [...aboutTeam.value]
  const [target] = next.splice(index, 1)
  if (!target) return
  next.splice(nextIndex, 0, target)
  aboutTeam.value = next
}

async function onAboutImageFileChange(kind: 'journey' | 'team', index: number, event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  aboutMessage.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    aboutMessage.value = 'Please choose a JPG, PNG, WEBP, or AVIF image.'
    if (input) input.value = ''
    return
  }
  if (file.size > 15 * 1024 * 1024) {
    aboutMessage.value = 'Please choose an image smaller than 15 MB.'
    if (input) input.value = ''
    return
  }
  const applyUrl = (url: string) => {
    if (kind === 'journey') {
      const next = [...aboutJourney.value]
      if (!next[index]) return
      next[index] = { ...next[index], imageUrl: url }
      aboutJourney.value = next
    } else {
      const next = [...aboutTeam.value]
      if (!next[index]) return
      next[index] = { ...next[index], imageUrl: url }
      aboutTeam.value = next
    }
  }
  aboutUploading.value = true
  try {
    // Preferred path: upload the original to S3 and store its public URL;
    // fall back to a downscaled inline data URL when S3 isn't configured.
    const publicUrl = await uploadHomepageImageToS3(file, 'about')
    if (publicUrl) {
      applyUrl(publicUrl)
      return
    }
    const dataUrl = await compressImageFile(file)
    if (dataUrl.length > MAX_INLINE_IMAGE_LENGTH) {
      aboutMessage.value =
        'This image is too large to save even after compression. Please use a smaller image or paste an image URL instead.'
      return
    }
    applyUrl(dataUrl)
  } catch (error) {
    aboutMessage.value = error instanceof Error ? error.message : 'Unable to read image.'
  } finally {
    aboutUploading.value = false
    if (input) input.value = ''
  }
}

async function saveAboutContent() {
  if (!isInternalUser.value || !user.value?.id) return
  aboutSaving.value = true
  aboutMessage.value = ''
  try {
    // Re-compress any oversized inline images so the request body stays under
    // the serverless payload limit; drop rows with no usable content.
    const journey = await Promise.all(
      aboutJourney.value
        .filter((step) => step.title.trim())
        .map(async (step) => ({
          ...step,
          imageUrl:
            step.imageUrl.length > MAX_INLINE_IMAGE_LENGTH
              ? await compressDataUrl(step.imageUrl)
              : step.imageUrl,
        })),
    )
    const team = await Promise.all(
      aboutTeam.value
        .filter((member) => member.name.trim() || member.imageUrl.trim())
        .map(async (member) => ({
          ...member,
          imageUrl:
            member.imageUrl.length > MAX_INLINE_IMAGE_LENGTH
              ? await compressDataUrl(member.imageUrl)
              : member.imageUrl,
        })),
    )
    const oversized = [...journey, ...team].some((entry) => entry.imageUrl.length > MAX_INLINE_IMAGE_LENGTH)
    if (oversized) {
      aboutMessage.value =
        'An image is too large to save even after compression. Please replace it with a smaller image or an image URL.'
      return
    }
    const res = await fetch(`${API_BASE}/api/internal?resource=site-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value.id,
        aboutContent: {
          heroEyebrow: aboutHeroEyebrow.value,
          heroHeadline: aboutHeroHeadline.value,
          heroSubheadline: aboutHeroSubheadline.value,
          journey,
          team,
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to save the About page.')
    applyAboutContentToView(data?.siteConfig?.aboutContent)
    invalidateSiteConfig()
    aboutMessage.value = 'About page saved.'
  } catch (e) {
    aboutMessage.value = e instanceof Error ? e.message : 'Unable to save the About page.'
  } finally {
    aboutSaving.value = false
  }
}

onMounted(() => {
  if (!isInternalUser.value) {
    router.replace('/')
    return
  }
  void loadOrders(true)
  void loadUsers(true)
  void loadSignupRequests(true)
  void loadProducts(true)
  void loadHomepageSlides()
  void loadSiteConfig()
  document.addEventListener('click', closeProductMoreOnOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeProductMoreOnOutsideClick)
})
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-6 sm:ect-pt-14 ect-pb-16">
    <div class="ect-max-w-7xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>

      <section class="ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-overflow-hidden">
        <div v-if="activeTabId === 'orders'" class="ect-overflow-x-auto">
          <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-2 ect-border-b ect-border-sand ect-bg-cream ect-px-4 ect-py-3">
            <div class="ect-relative ect-w-full sm:ect-w-72">
              <svg class="ect-absolute ect-left-3 ect-top-1/2 -ect-translate-y-1/2 ect-w-4 ect-h-4 ect-text-charcoal/35" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"/></svg>
              <input
                v-model="orderSearch"
                type="search"
                placeholder="Search orders…"
                class="ect-w-full ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-pl-9 ect-pr-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
                @input="onOrderSearchInput"
              />
            </div>
            <button
              type="button"
              class="sm:ect-ml-auto ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors"
              @click="newOrderOpen = true"
            >
              New order
            </button>
          </div>
          <InternalNewOrderModal v-if="newOrderOpen" @close="newOrderOpen = false" @created="onOrderCreated" />
          <table class="ect-w-full ect-min-w-[980px] ect-border-collapse">
            <thead class="ect-bg-cream"><tr><th v-for="h in ['Order', 'Customer', 'Items', 'Status', 'Total', 'Created', 'Modified']" :key="h" class="ect-px-4 ect-py-3 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">{{ h }}</th></tr></thead>
            <tbody>
              <template v-if="orderListLoading">
                <tr v-for="index in skeletonRows" :key="index" class="ect-border-t ect-border-sand">
                  <td v-for="width in orderSkeletonWidths" :key="width" class="ect-px-4 ect-py-3">
                    <div class="ect-h-4 ect-rounded ect-bg-sand ect-animate-pulse" :class="width"></div>
                  </td>
                </tr>
              </template>
              <tr
                v-for="order in displayOrders"
                v-else
                :key="order.id"
                class="ect-cursor-pointer ect-border-t ect-border-sand hover:ect-bg-cream"
                tabindex="0"
                @click="openOrderDetail(order)"
                @keydown.enter="openOrderDetail(order)"
              >
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-font-semibold">
                  <RouterLink :to="{ name: 'internal-order', params: { id: order.id } }" class="ect-text-charcoal hover:ect-text-gold-700 hover:ect-underline" @click.stop>
                    {{ order.orderNo }}
                  </RouterLink>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/70">
                  <RouterLink
                    v-if="customerDetailPath(order)"
                    :to="customerDetailPath(order)!"
                    class="ect-text-charcoal hover:ect-text-gold-700 hover:ect-underline"
                    @click.stop
                  >
                    {{ order.customer }}
                  </RouterLink>
                  <span v-else>{{ order.customer }}</span>
                  <span class="ect-block ect-text-xs ect-text-charcoal/40">{{ order.customerEmail }}</span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">{{ order.itemCount }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-capitalize">{{ order.status }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-font-semibold">{{ order.total }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ formatDate(order.createdAt) }}<span class="ect-block ect-text-xs ect-text-charcoal/40">by {{ order.createdBy || '—' }}</span></td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ order.modifiedAt ? formatDate(order.modifiedAt) : '—' }}<span v-if="order.modifiedBy" class="ect-block ect-text-xs ect-text-charcoal/40">by {{ order.modifiedBy }}</span></td>
              </tr>
              <tr v-if="!orderListLoading && !displayOrders.length" class="ect-border-t ect-border-sand">
                <td colspan="7" class="ect-px-4 ect-py-6 ect-font-body ect-text-sm ect-text-charcoal/45">No orders found.</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!orderListLoading && orders.length" class="ect-flex ect-flex-col ect-items-center ect-gap-3 ect-border-t ect-border-sand ect-px-4 ect-py-4">
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45">Showing {{ orders.length }} of {{ orderTotal }}</p>
            <button
              v-if="orderHasMore"
              type="button"
              :disabled="orderLoadingMore"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
              @click="loadOrders(false)"
            >
              {{ orderLoadingMore ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        </div>

        <div v-else-if="activeTabId === 'memos'" class="ect-overflow-x-auto">
          <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-2 ect-border-b ect-border-sand ect-bg-cream ect-px-4 ect-py-3">
            <div class="ect-relative ect-w-full sm:ect-w-72">
              <svg class="ect-absolute ect-left-3 ect-top-1/2 -ect-translate-y-1/2 ect-w-4 ect-h-4 ect-text-charcoal/35" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"/></svg>
              <input
                v-model="memoSearch"
                type="search"
                placeholder="Search memos…"
                class="ect-w-full ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-pl-9 ect-pr-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
                @input="onMemoSearchInput"
              />
            </div>
            <select
              v-model="memoStatusFilter"
              class="ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"
              @change="loadMemos(true)"
            >
              <option v-for="opt in memoStatusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <p v-if="memoSummary" class="sm:ect-ml-auto ect-font-body ect-text-xs ect-text-charcoal/55">
              <span class="ect-font-semibold ect-text-charcoal">{{ memoSummary.formattedOutstanding }}</span>
              out on {{ memoSummary.openCount }} memo{{ memoSummary.openCount === 1 ? '' : 's' }}
              <span v-if="memoSummary.overdueCount" class="ect-text-red-600">
                · {{ memoSummary.formattedOverdue }} overdue ({{ memoSummary.overdueCount }})
              </span>
            </p>
          </div>
          <table class="ect-w-full ect-min-w-[980px] ect-border-collapse">
            <thead class="ect-bg-cream"><tr><th v-for="h in ['Memo', 'Customer', 'Pieces', 'Status', 'Value out', 'Due', 'Issued']" :key="h" class="ect-px-4 ect-py-3 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">{{ h }}</th></tr></thead>
            <tbody>
              <template v-if="memoListLoading">
                <tr v-for="index in skeletonRows" :key="index" class="ect-border-t ect-border-sand">
                  <td v-for="width in orderSkeletonWidths" :key="width" class="ect-px-4 ect-py-3">
                    <div class="ect-h-4 ect-rounded ect-bg-sand ect-animate-pulse" :class="width"></div>
                  </td>
                </tr>
              </template>
              <tr
                v-for="memo in memos"
                v-else
                :key="memo.id"
                class="ect-cursor-pointer ect-border-t ect-border-sand hover:ect-bg-cream"
                tabindex="0"
                @click="openMemoDetail(memo)"
                @keydown.enter="openMemoDetail(memo)"
              >
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-font-semibold">
                  <RouterLink :to="{ name: 'internal-memo', params: { id: memo.id } }" class="ect-text-charcoal hover:ect-text-gold-700 hover:ect-underline" @click.stop>
                    {{ memo.memoNo }}
                  </RouterLink>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/70">
                  <RouterLink
                    v-if="memo.customerId"
                    :to="{ name: 'internal-user', params: { id: memo.customerId } }"
                    class="ect-text-charcoal hover:ect-text-gold-700 hover:ect-underline"
                    @click.stop
                  >
                    {{ memo.customer }}
                  </RouterLink>
                  <span v-else>{{ memo.customer }}</span>
                  <span class="ect-block ect-text-xs ect-text-charcoal/40">{{ memo.customerEmail }}</span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">{{ memo.itemCount }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">
                  <span
                    class="ect-inline-flex ect-items-center ect-rounded-full ect-px-2.5 ect-py-1 ect-text-xs ect-font-semibold"
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
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-font-semibold">{{ memo.formattedOutstanding }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">
                  {{ formatDate(memo.dueDate) }}
                  <span class="ect-block ect-text-xs" :class="memo.isOverdue ? 'ect-text-red-600' : 'ect-text-charcoal/40'">{{ memoDaysLeft(memo) }}</span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ formatDate(memo.issuedAt) }}<span class="ect-block ect-text-xs ect-text-charcoal/40">by {{ memo.createdBy || '—' }}</span></td>
              </tr>
              <tr v-if="!memoListLoading && !memos.length" class="ect-border-t ect-border-sand">
                <td colspan="7" class="ect-px-4 ect-py-6 ect-font-body ect-text-sm ect-text-charcoal/45">No memos found.</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!memoListLoading && memos.length" class="ect-flex ect-flex-col ect-items-center ect-gap-3 ect-border-t ect-border-sand ect-px-4 ect-py-4">
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45">Showing {{ memos.length }} of {{ memoTotal }}</p>
            <button
              v-if="memoHasMore"
              type="button"
              :disabled="memoLoadingMore"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
              @click="loadMemos(false)"
            >
              {{ memoLoadingMore ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        </div>

        <div v-else-if="activeTabId === 'users'" class="ect-overflow-x-auto">
          <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-2 ect-border-b ect-border-sand ect-bg-cream ect-px-4 ect-py-3">
            <div class="ect-relative ect-w-full sm:ect-w-72">
              <svg class="ect-absolute ect-left-3 ect-top-1/2 -ect-translate-y-1/2 ect-w-4 ect-h-4 ect-text-charcoal/35" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"/></svg>
              <input
                v-model="userSearch"
                type="search"
                placeholder="Search users…"
                class="ect-w-full ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-pl-9 ect-pr-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
                @input="onUserSearchInput"
              />
            </div>
            <button
              v-if="isAdminUser"
              type="button"
              class="sm:ect-ml-auto ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors"
              @click="newUserOpen = true"
            >
              New user
            </button>
          </div>
          <InternalNewUserModal v-if="newUserOpen" @close="newUserOpen = false" @created="onUserCreated" />
          <table class="ect-w-full ect-min-w-[940px] ect-border-collapse">
            <thead class="ect-bg-cream"><tr><th v-for="h in ['Name', 'Email', 'Type', 'Channel', 'Orders', 'Created', 'Modified']" :key="h" class="ect-px-4 ect-py-3 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">{{ h }}</th></tr></thead>
            <tbody>
              <template v-if="userListLoading">
                <tr v-for="index in skeletonRows" :key="index" class="ect-border-t ect-border-sand">
                  <td v-for="width in userSkeletonWidths" :key="width" class="ect-px-4 ect-py-3">
                    <div class="ect-h-4 ect-rounded ect-bg-sand ect-animate-pulse" :class="width"></div>
                  </td>
                </tr>
              </template>
              <tr v-for="row in users" v-else :key="row.id" class="ect-border-t ect-border-sand"><td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-font-semibold"><RouterLink :to="`/internal/users/${row.id}`" class="ect-text-charcoal hover:ect-text-gold-700 hover:ect-underline">{{ row.name }}</RouterLink></td><td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/60">{{ row.email }}</td><td class="ect-px-4 ect-py-3"><span class="ect-rounded-full ect-px-2.5 ect-py-1 ect-font-body ect-text-xs ect-font-semibold" :class="row.isAdmin ? 'ect-bg-gold-700 ect-text-white' : row.isInternal ? 'ect-bg-charcoal ect-text-white' : 'ect-bg-cream ect-text-charcoal/60'">{{ row.isAdmin ? 'Full Admin' : row.isInternal ? 'Internal' : 'Customer' }}</span></td><td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">{{ row.channel }}</td><td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">{{ row.orderCount }}</td><td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ formatDate(row.createdAt) }}<span class="ect-block ect-text-xs ect-text-charcoal/40">by {{ row.createdBy || '—' }}</span></td><td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ row.modifiedAt ? formatDate(row.modifiedAt) : '—' }}<span v-if="row.modifiedBy" class="ect-block ect-text-xs ect-text-charcoal/40">by {{ row.modifiedBy }}</span></td></tr>
              <tr v-if="!userListLoading && !users.length" class="ect-border-t ect-border-sand">
                <td colspan="7" class="ect-px-4 ect-py-6 ect-font-body ect-text-sm ect-text-charcoal/45">No users found.</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!userListLoading && users.length" class="ect-flex ect-flex-col ect-items-center ect-gap-3 ect-border-t ect-border-sand ect-px-4 ect-py-4">
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45">Showing {{ users.length }} of {{ userTotal }}</p>
            <button
              v-if="userHasMore"
              type="button"
              :disabled="userLoadingMore"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
              @click="loadUsers(false)"
            >
              {{ userLoadingMore ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        </div>

        <!-- Approvals: storefront sign-ups waiting for a Full Admin. Approving
             one creates the User, their address and their company record. -->
        <div v-else-if="activeTabId === 'approvals'" class="ect-overflow-x-auto">
          <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-2 ect-border-b ect-border-sand ect-bg-cream ect-px-4 ect-py-3">
            <div class="ect-relative ect-w-full sm:ect-w-72">
              <svg class="ect-absolute ect-left-3 ect-top-1/2 -ect-translate-y-1/2 ect-w-4 ect-h-4 ect-text-charcoal/35" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"/></svg>
              <input
                v-model="signupSearch"
                type="search"
                placeholder="Search name, email, company, tax ID…"
                class="ect-w-full ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-pl-9 ect-pr-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
                @input="onSignupSearchInput"
              />
            </div>
            <div class="ect-w-full sm:ect-w-44">
              <UiSelect :model-value="signupStatusFilter" :options="signupStatusOptions" @update:model-value="onSignupStatusChange" />
            </div>
            <p class="sm:ect-ml-auto ect-font-body ect-text-sm ect-text-charcoal/55">
              <span class="ect-font-semibold ect-text-charcoal">{{ signupPendingCount }}</span> awaiting approval
            </p>
          </div>

          <p v-if="signupMessage" class="ect-border-b ect-border-sand ect-bg-emerald-50 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-emerald-800">{{ signupMessage }}</p>
          <p v-if="signupError" class="ect-border-b ect-border-sand ect-bg-red-50 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-red-700">{{ signupError }}</p>

          <table class="ect-w-full ect-min-w-[1040px] ect-border-collapse">
            <thead class="ect-bg-cream">
              <tr>
                <th v-for="h in ['Reference', 'Applicant', 'Company', 'Phone', 'Location', 'Submitted', 'Status', '']" :key="h" class="ect-px-4 ect-py-3 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="signupListLoading">
                <tr v-for="index in skeletonRows" :key="index" class="ect-border-t ect-border-sand">
                  <td v-for="width in signupSkeletonWidths" :key="width" class="ect-px-4 ect-py-3">
                    <div class="ect-h-4 ect-rounded ect-bg-sand ect-animate-pulse" :class="width"></div>
                  </td>
                  <td class="ect-px-4 ect-py-3"><div class="ect-h-4 ect-w-16 ect-rounded ect-bg-sand ect-animate-pulse"></div></td>
                  <td class="ect-px-4 ect-py-3"><div class="ect-h-4 ect-w-24 ect-rounded ect-bg-sand ect-animate-pulse"></div></td>
                </tr>
              </template>
              <tr v-for="row in signupRequests" v-else :key="row.reference" class="ect-border-t ect-border-sand">
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-font-semibold">
                  <RouterLink :to="{ name: 'internal-signup-request', params: { reference: row.reference } }" class="ect-text-charcoal hover:ect-text-gold-700 hover:ect-underline">{{ row.reference }}</RouterLink>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/70">
                  {{ row.name }}
                  <span class="ect-block ect-text-xs ect-text-charcoal/40">{{ row.email }}</span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/70">
                  <span :class="row.companyName ? '' : 'ect-text-charcoal/35'">{{ row.companyName || '—' }}</span>
                  <span v-if="row.taxId" class="ect-block ect-text-xs ect-text-charcoal/40">Tax ID {{ row.taxId }}</span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/70">{{ row.phone }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/70">
                  {{ row.city }}, {{ row.state }}
                  <span class="ect-block ect-text-xs ect-text-charcoal/40">{{ row.postalCode }} · {{ row.country }}</span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ formatDate(row.createdAt) }}</td>
                <td class="ect-px-4 ect-py-3">
                  <span class="ect-rounded-full ect-px-2.5 ect-py-1 ect-font-body ect-text-xs ect-font-semibold ect-capitalize" :class="signupStatusClass(row.status)">{{ row.status }}</span>
                  <span v-if="row.status !== 'pending' && row.reviewedBy" class="ect-block ect-mt-1 ect-text-xs ect-text-charcoal/40">by {{ row.reviewedBy }}</span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-whitespace-nowrap">
                  <template v-if="row.status === 'pending' && isAdminUser">
                    <button
                      type="button"
                      :disabled="signupActionReference === row.reference"
                      class="ect-rounded-full ect-bg-charcoal ect-px-3.5 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                      @click="decideSignupRequest(row, 'approve')"
                    >
                      {{ signupActionReference === row.reference ? 'Working…' : 'Approve' }}
                    </button>
                    <button
                      type="button"
                      :disabled="signupActionReference === row.reference"
                      class="ect-ml-2 ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3.5 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-red-400 hover:ect-text-red-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                      @click="decideSignupRequest(row, 'reject')"
                    >
                      Reject
                    </button>
                  </template>
                  <span v-else-if="row.status === 'pending'" class="ect-font-body ect-text-xs ect-text-charcoal/40">Full Admin approval required</span>
                  <span v-else class="ect-font-body ect-text-xs ect-text-charcoal/40">{{ row.reviewedAt ? formatDate(row.reviewedAt) : '—' }}</span>
                </td>
              </tr>
              <tr v-if="!signupListLoading && !signupRequests.length" class="ect-border-t ect-border-sand">
                <td colspan="8" class="ect-px-4 ect-py-6 ect-font-body ect-text-sm ect-text-charcoal/45">
                  {{ signupSearch.trim() ? 'No sign-up requests match your search.' : 'No sign-up requests in this view.' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!signupListLoading && signupRequests.length" class="ect-flex ect-flex-col ect-items-center ect-gap-3 ect-border-t ect-border-sand ect-px-4 ect-py-4">
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45">Showing {{ signupRequests.length }} of {{ signupTotal }}</p>
            <button
              v-if="signupHasMore"
              type="button"
              :disabled="signupLoadingMore"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
              @click="loadSignupRequests(false)"
            >
              {{ signupLoadingMore ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        </div>

        <div v-else-if="activeTabId === 'homepage'" class="ect-p-4 sm:ect-p-5">
          <div class="ect-mb-5 ect-flex ect-flex-col ect-gap-3 sm:ect-flex-row sm:ect-items-center sm:ect-justify-between">
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-gold-700 ect-mb-1">Storefront hero</p>
              <div class="ect-flex ect-items-center ect-gap-2">
                <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">Homepage full-screen images</h2>
                <span
                  class="ect-group ect-relative ect-inline-flex"
                  tabindex="0"
                  role="img"
                  aria-label="Recommended banner image specifications"
                >
                  <svg class="ect-h-5 ect-w-5 ect-cursor-help ect-text-charcoal/35 hover:ect-text-gold-700" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="8.25" stroke="currentColor" stroke-width="1.4" />
                    <circle cx="10" cy="6.4" r="1" fill="currentColor" />
                    <path d="M10 9v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                  <span
                    class="ect-pointer-events-none ect-absolute ect-left-0 ect-top-full ect-z-30 ect-mt-2 ect-w-[20rem] ect-max-w-[80vw] ect-rounded-xl ect-border ect-border-charcoal/10 ect-bg-white ect-p-4 ect-text-left ect-font-body ect-text-charcoal/70 ect-opacity-0 ect-shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] ect-transition-opacity ect-duration-150 group-hover:ect-opacity-100 group-focus-within:ect-opacity-100"
                  >
                    <span class="ect-mb-2 ect-block ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal">For crisp, undistorted banners</span>
                    <span class="ect-mb-2.5 ect-block ect-text-xs ect-leading-relaxed ect-text-charcoal/55">The hero stretches each image to fill the frame (no cropping), so the image’s shape must match the slot or it will look squished.</span>
                    <span class="ect-block ect-space-y-1.5 ect-text-xs ect-leading-relaxed">
                      <span class="ect-flex ect-justify-between ect-gap-3"><span class="ect-text-charcoal/55">Desktop</span><span class="ect-font-semibold ect-text-charcoal">2560 × 1440 px · 16:9 landscape</span></span>
                      <span class="ect-flex ect-justify-between ect-gap-3"><span class="ect-text-charcoal/55">Mobile</span><span class="ect-font-semibold ect-text-charcoal">1080 × 1920 px · 9:16 portrait</span></span>
                      <span class="ect-flex ect-justify-between ect-gap-3"><span class="ect-text-charcoal/55">Format</span><span class="ect-font-semibold ect-text-charcoal">WebP, AVIF or JPEG</span></span>
                      <span class="ect-flex ect-justify-between ect-gap-3"><span class="ect-text-charcoal/55">File size</span><span class="ect-font-semibold ect-text-charcoal">up to 15 MB (≈1–2 MB ideal)</span></span>
                    </span>
                    <span class="ect-mt-2.5 ect-block ect-text-xs ect-leading-relaxed ect-text-charcoal/55">Images are hosted on S3, so you can upload full-quality exports — aim for ~1–2 MB so the hero still loads fast. Use sharp, high-resolution exports — never upscale a small image. Add a separate mobile image so phones get the portrait crop.</span>
                  </span>
                </span>
              </div>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Add and reorder full-screen slides for the homepage hero. If no active slides exist, the current default hero stays visible.</p>
            </div>
            <div class="ect-flex ect-flex-wrap ect-gap-2">
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-gold-700 hover:ect-bg-cream ect-transition-colors"
                @click="addHomepageSlide"
              >
                Add slide
              </button>
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-60"
                :disabled="homepageSaving || homepageUploading"
                @click="saveHomepageSlides"
              >
                {{ homepageSaving ? 'Saving…' : 'Save homepage' }}
              </button>
            </div>
          </div>

          <p
            v-if="homepageUploading"
            class="ect-mb-4 ect-font-body ect-text-sm ect-text-charcoal/55"
          >
            Uploading image…
          </p>
          <p
            v-else-if="homepageMessage"
            class="ect-mb-4 ect-font-body ect-text-sm"
            :class="homepageMessage === 'Homepage slides saved.' ? 'ect-text-emerald-700' : 'ect-text-red-600'"
          >
            {{ homepageMessage }}
          </p>

          <div v-if="homepageLoading" class="ect-grid ect-gap-4 lg:ect-grid-cols-2">
            <div v-for="index in 2" :key="index" class="ect-h-72 ect-rounded-2xl ect-bg-cream ect-animate-pulse" />
          </div>

          <div v-else-if="homepageSlides.length" ref="homepageGrid" class="ect-grid ect-gap-4 lg:ect-grid-cols-2">
            <article
              v-for="(slide, index) in homepageSlides"
              :key="slide.id || `homepage-${index}`"
              class="ect-overflow-hidden ect-rounded-2xl ect-border ect-border-sand ect-bg-white"
            >
              <div class="ect-bg-charcoal/5 ect-p-3">
                <div class="ect-mb-2 ect-flex ect-items-center ect-justify-between">
                  <span class="ect-inline-flex ect-items-center ect-gap-2 ect-rounded-full ect-bg-white/90 ect-px-3 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal">
                    Slide {{ index + 1 }}
                  </span>
                  <span
                    v-if="slide.device && slide.device !== 'all'"
                    class="ect-inline-flex ect-items-center ect-gap-2 ect-rounded-full ect-bg-charcoal/85 ect-px-3 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-white">
                    {{ slide.device === 'mobile' ? 'Mobile only' : 'Desktop only' }}
                  </span>
                </div>
                <div class="ect-flex ect-gap-3">
                  <div class="ect-flex-1 ect-min-w-0">
                    <span class="ect-mb-1 ect-block ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/45">Desktop</span>
                    <div class="ect-relative ect-aspect-[16/10] ect-overflow-hidden ect-rounded-xl ect-bg-charcoal/10">
                      <img
                        v-if="slide.imageUrl"
                        :src="slide.imageUrl"
                        :alt="slide.headline || `Homepage slide ${index + 1} desktop`"
                        class="ect-h-full ect-w-full ect-object-cover"
                      />
                      <div v-else class="ect-flex ect-h-full ect-items-center ect-justify-center ect-px-2 ect-text-center ect-font-body ect-text-xs ect-text-charcoal/40">
                        Add desktop image
                      </div>
                    </div>
                  </div>
                  <div class="ect-w-24 ect-shrink-0 sm:ect-w-28">
                    <span class="ect-mb-1 ect-block ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/45">Mobile</span>
                    <div class="ect-relative ect-aspect-[9/16] ect-overflow-hidden ect-rounded-xl ect-bg-charcoal/10">
                      <img
                        v-if="slide.mobileImageUrl"
                        :src="slide.mobileImageUrl"
                        :alt="slide.headline || `Homepage slide ${index + 1} mobile`"
                        class="ect-h-full ect-w-full ect-object-cover"
                      />
                      <div v-else class="ect-flex ect-h-full ect-items-center ect-justify-center ect-px-2 ect-text-center ect-font-body ect-text-xs ect-text-charcoal/40">
                        Add mobile image
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="ect-space-y-4 ect-p-4">
                <div class="ect-flex ect-flex-wrap ect-gap-2">
                  <label class="ect-inline-flex ect-cursor-pointer ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 hover:ect-bg-cream">
                    Upload desktop image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      class="ect-hidden"
                      @change="onHomepageSlideFileChange(index, $event, 'desktop')"
                    />
                  </label>
                  <label class="ect-inline-flex ect-cursor-pointer ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 hover:ect-bg-cream">
                    Upload mobile image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      class="ect-hidden"
                      @change="onHomepageSlideFileChange(index, $event, 'mobile')"
                    />
                  </label>
                </div>

                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Desktop image URL</span>
                  <input v-model="slide.imageUrl" type="text" placeholder="https://…" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                </label>

                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Mobile image URL <span class="ect-normal-case ect-font-normal ect-text-charcoal/35">(optional)</span></span>
                  <input v-model="slide.mobileImageUrl" type="text" placeholder="https://…" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                </label>

                <div class="ect-grid ect-gap-4 sm:ect-grid-cols-2">
                  <label class="ect-block">
                    <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Headline</span>
                    <input v-model="slide.headline" type="text" placeholder="Optional headline" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                  </label>
                  <label class="ect-block">
                    <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">CTA label</span>
                    <input v-model="slide.ctaLabel" type="text" placeholder="Explore now" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                  </label>
                </div>

                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Subheadline</span>
                  <textarea v-model="slide.subheadline" rows="3" placeholder="Optional supporting copy" class="ect-w-full ect-resize-none ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40"></textarea>
                </label>

                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">CTA link</span>
                  <input v-model="slide.ctaHref" type="text" placeholder="/services or https://…" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                </label>

                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Show on</span>
                  <select v-model="slide.device" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40">
                    <option value="all">All devices</option>
                    <option value="desktop">Desktop only</option>
                    <option value="mobile">Mobile only</option>
                  </select>
                </label>

                <div class="ect-flex ect-flex-wrap ect-items-center ect-justify-between ect-gap-3 ect-border-t ect-border-sand ect-pt-4">
                  <label class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-sm ect-text-charcoal">
                    <input v-model="slide.active" type="checkbox" class="ect-h-4 ect-w-4 ect-rounded ect-border-gold-400 ect-text-gold-700 focus:ect-ring-gold-400" />
                    Active on homepage
                  </label>
                  <div class="ect-flex ect-flex-wrap ect-gap-2">
                    <button type="button" class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700" :disabled="index === 0" @click="moveHomepageSlide(index, -1)">Move up</button>
                    <button type="button" class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700" :disabled="index === homepageSlides.length - 1" @click="moveHomepageSlide(index, 1)">Move down</button>
                    <button type="button" class="ect-rounded-full ect-border ect-border-red-200 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-red-600 hover:ect-bg-red-50" @click="removeHomepageSlide(index)">Remove</button>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="ect-rounded-2xl ect-border ect-border-dashed ect-border-sand ect-bg-cream ect-p-10 ect-text-center">
            <p class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">No homepage slides yet</p>
            <p class="ect-mt-2 ect-font-body ect-text-sm ect-text-charcoal/55">Add your first full-screen image and it will replace the default storefront hero.</p>
            <button
              type="button"
              class="ect-mt-5 ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors"
              @click="addHomepageSlide"
            >
              Add first slide
            </button>
          </div>

          <!-- Shop by Collection tile images -->
          <div class="ect-mt-10 ect-border-t ect-border-sand ect-pt-8">
            <div class="ect-mb-5 ect-flex ect-flex-col ect-gap-3 sm:ect-flex-row sm:ect-items-center sm:ect-justify-between">
              <div>
                <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-gold-700 ect-mb-1">Storefront grid</p>
                <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">Shop by Collection images</h2>
                <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Set an image for each collection tile on the homepage grid. Tiles left blank keep the default gold placeholder. Landscape images around 700 × 500 px (7:5) look best.</p>
              </div>
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-60"
                :disabled="collectionImagesSaving || collectionImagesUploading"
                @click="saveCollectionImages"
              >
                {{ collectionImagesSaving ? 'Saving…' : 'Save collection images' }}
              </button>
            </div>

            <p
              v-if="collectionImagesUploading"
              class="ect-mb-4 ect-font-body ect-text-sm ect-text-charcoal/55"
            >
              Uploading image…
            </p>
            <p
              v-else-if="collectionImagesMessage"
              class="ect-mb-4 ect-font-body ect-text-sm"
              :class="collectionImagesMessage === 'Collection images saved.' ? 'ect-text-emerald-700' : 'ect-text-red-600'"
            >
              {{ collectionImagesMessage }}
            </p>

            <div class="ect-grid ect-gap-4 sm:ect-grid-cols-2 lg:ect-grid-cols-3">
              <article
                v-for="link in collectionLinks"
                :key="link.slug"
                class="ect-overflow-hidden ect-rounded-2xl ect-border ect-border-sand ect-bg-white"
              >
                <div class="ect-relative ect-aspect-[7/5] ect-bg-charcoal/10">
                  <img
                    v-if="collectionImages[link.slug]"
                    :src="collectionImages[link.slug]"
                    :alt="`${link.title} tile`"
                    class="ect-h-full ect-w-full ect-object-cover"
                  />
                  <div v-else class="ect-flex ect-h-full ect-items-center ect-justify-center ect-px-2 ect-text-center ect-font-body ect-text-xs ect-text-charcoal/40">
                    No image — placeholder shown
                  </div>
                  <span class="ect-pointer-events-none ect-absolute ect-bottom-2 ect-left-2 ect-rounded-full ect-bg-white/90 ect-px-3 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal">
                    {{ link.title }}
                  </span>
                </div>
                <div class="ect-space-y-3 ect-p-3">
                  <div class="ect-flex ect-flex-wrap ect-gap-2">
                    <label class="ect-inline-flex ect-cursor-pointer ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 hover:ect-bg-cream">
                      Upload image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        class="ect-hidden"
                        @change="onCollectionImageFileChange(link.slug, $event)"
                      />
                    </label>
                    <button
                      v-if="collectionImages[link.slug]"
                      type="button"
                      class="ect-rounded-full ect-border ect-border-red-200 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-red-600 hover:ect-bg-red-50"
                      @click="clearCollectionImage(link.slug)"
                    >
                      Remove
                    </button>
                  </div>
                  <label class="ect-block">
                    <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Image URL</span>
                    <input
                      :value="collectionImages[link.slug] || ''"
                      type="text"
                      placeholder="https://…"
                      class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40"
                      @input="setCollectionImageUrl(link.slug, ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div v-else-if="activeTabId === 'about'" class="ect-p-4 sm:ect-p-5">
          <div class="ect-mb-5 ect-flex ect-flex-col ect-gap-3 sm:ect-flex-row sm:ect-items-center sm:ect-justify-between">
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-gold-700 ect-mb-1">Storefront page</p>
              <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">About Us page</h2>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Configure the hero copy, journey milestones, and team portraits shown on the About page. Use real group and founder photos — landscape ~1200 × 900 px (4:3) for milestones, portrait ~900 × 1200 px (3:4) for people. Fields left blank keep the built-in defaults.</p>
            </div>
            <button
              type="button"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-60"
              :disabled="aboutSaving || aboutUploading"
              @click="saveAboutContent"
            >
              {{ aboutSaving ? 'Saving…' : 'Save About page' }}
            </button>
          </div>

          <p v-if="aboutUploading" class="ect-mb-4 ect-font-body ect-text-sm ect-text-charcoal/55">Uploading image…</p>
          <p
            v-else-if="aboutMessage"
            class="ect-mb-4 ect-font-body ect-text-sm"
            :class="aboutMessage === 'About page saved.' ? 'ect-text-emerald-700' : 'ect-text-red-600'"
          >
            {{ aboutMessage }}
          </p>

          <!-- Hero copy -->
          <div class="ect-rounded-2xl ect-border ect-border-sand ect-bg-white ect-p-4 ect-mb-8">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/45 ect-mb-3">Hero copy</p>
            <div class="ect-grid ect-gap-4 sm:ect-grid-cols-2">
              <label class="ect-block">
                <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Eyebrow</span>
                <input v-model="aboutHeroEyebrow" type="text" placeholder="Kiana Jewels · Jaipur" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
              </label>
              <label class="ect-block">
                <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Headline</span>
                <input v-model="aboutHeroHeadline" type="text" placeholder="Brilliance by Design" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
              </label>
            </div>
            <label class="ect-block ect-mt-4">
              <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Subheadline</span>
              <textarea v-model="aboutHeroSubheadline" rows="2" placeholder="Reinventing fine jewellery with precision, craftsmanship and stories told in every stone." class="ect-w-full ect-resize-none ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40"></textarea>
            </label>
          </div>

          <!-- Journey milestones -->
          <div class="ect-mb-3 ect-flex ect-items-center ect-justify-between">
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/45">Journey milestones</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Shown as alternating photo + story rows. Add your group photos here — until a milestone is added, the page shows the built-in three (2004 Mumbai → 2010 New York → 2024 Jaipur).</p>
            </div>
            <button
              type="button"
              class="ect-shrink-0 ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-gold-700 hover:ect-bg-cream ect-transition-colors"
              @click="addAboutJourney"
            >
              Add milestone
            </button>
          </div>

          <div v-if="aboutJourney.length" class="ect-grid ect-gap-4 lg:ect-grid-cols-2 ect-mb-8">
            <article
              v-for="(step, index) in aboutJourney"
              :key="`about-journey-${index}`"
              class="ect-overflow-hidden ect-rounded-2xl ect-border ect-border-sand ect-bg-white"
            >
              <div class="ect-relative ect-aspect-[4/3] ect-bg-charcoal/10">
                <img v-if="step.imageUrl" :src="step.imageUrl" :alt="step.title || `Milestone ${index + 1}`" class="ect-h-full ect-w-full ect-object-cover" />
                <div v-else class="ect-flex ect-h-full ect-items-center ect-justify-center ect-px-2 ect-text-center ect-font-body ect-text-xs ect-text-charcoal/40">
                  Add a group / workshop photo (4:3)
                </div>
                <span class="ect-pointer-events-none ect-absolute ect-bottom-2 ect-left-2 ect-rounded-full ect-bg-white/90 ect-px-3 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal">
                  Milestone {{ index + 1 }}
                </span>
              </div>
              <div class="ect-space-y-4 ect-p-4">
                <div class="ect-flex ect-flex-wrap ect-gap-2">
                  <label class="ect-inline-flex ect-cursor-pointer ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 hover:ect-bg-cream">
                    Upload photo
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" class="ect-hidden" @change="onAboutImageFileChange('journey', index, $event)" />
                  </label>
                </div>
                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Image URL</span>
                  <input v-model="step.imageUrl" type="text" placeholder="https://…" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                </label>
                <div class="ect-grid ect-gap-4 sm:ect-grid-cols-2">
                  <label class="ect-block">
                    <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Year</span>
                    <input v-model="step.year" type="text" placeholder="2024" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                  </label>
                  <label class="ect-block">
                    <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Place</span>
                    <input v-model="step.place" type="text" placeholder="Jaipur" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                  </label>
                </div>
                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Title <span class="ect-text-red-500">*</span></span>
                  <input v-model="step.title" type="text" placeholder="Kiana Jewels" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                </label>
                <label class="ect-block">
                  <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Story</span>
                  <textarea v-model="step.desc" rows="3" placeholder="What happened at this point in the journey…" class="ect-w-full ect-resize-none ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40"></textarea>
                </label>
                <div class="ect-flex ect-flex-wrap ect-items-center ect-justify-between ect-gap-3 ect-border-t ect-border-sand ect-pt-4">
                  <label class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-sm ect-text-charcoal">
                    <input v-model="step.active" type="checkbox" class="ect-h-4 ect-w-4 ect-rounded ect-border-gold-400 ect-text-gold-700 focus:ect-ring-gold-400" />
                    Visible on page
                  </label>
                  <div class="ect-flex ect-flex-wrap ect-gap-2">
                    <button type="button" class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700" :disabled="index === 0" @click="moveAboutJourney(index, -1)">Move up</button>
                    <button type="button" class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700" :disabled="index === aboutJourney.length - 1" @click="moveAboutJourney(index, 1)">Move down</button>
                    <button type="button" class="ect-rounded-full ect-border ect-border-red-200 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-red-600 hover:ect-bg-red-50" @click="removeAboutJourney(index)">Remove</button>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="ect-rounded-2xl ect-border ect-border-dashed ect-border-sand ect-bg-cream ect-p-8 ect-text-center ect-mb-8">
            <p class="ect-font-body ect-text-sm ect-text-charcoal/55">No custom milestones yet — the storefront shows the built-in journey. Add one to replace it with your own photos and story.</p>
          </div>

          <!-- Team / founders -->
          <div class="ect-border-t ect-border-sand ect-pt-8">
            <div class="ect-mb-3 ect-flex ect-items-center ect-justify-between">
              <div>
                <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/45">Founders &amp; team</p>
                <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Portrait cards shown in a "The people behind Kiana" section. The section stays hidden until at least one person is added.</p>
              </div>
              <button
                type="button"
                class="ect-shrink-0 ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-gold-700 hover:ect-bg-cream ect-transition-colors"
                @click="addAboutTeam"
              >
                Add person
              </button>
            </div>

            <div v-if="aboutTeam.length" class="ect-grid ect-gap-4 sm:ect-grid-cols-2 lg:ect-grid-cols-3">
              <article
                v-for="(member, index) in aboutTeam"
                :key="`about-team-${index}`"
                class="ect-overflow-hidden ect-rounded-2xl ect-border ect-border-sand ect-bg-white"
              >
                <div class="ect-relative ect-aspect-[3/4] ect-max-h-64 ect-w-full ect-bg-charcoal/10">
                  <img v-if="member.imageUrl" :src="member.imageUrl" :alt="member.name || `Team member ${index + 1}`" class="ect-h-full ect-w-full ect-object-cover" />
                  <div v-else class="ect-flex ect-h-full ect-items-center ect-justify-center ect-px-2 ect-text-center ect-font-body ect-text-xs ect-text-charcoal/40">
                    Add a portrait photo (3:4)
                  </div>
                </div>
                <div class="ect-space-y-4 ect-p-4">
                  <div class="ect-flex ect-flex-wrap ect-gap-2">
                    <label class="ect-inline-flex ect-cursor-pointer ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 hover:ect-bg-cream">
                      Upload portrait
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" class="ect-hidden" @change="onAboutImageFileChange('team', index, $event)" />
                    </label>
                  </div>
                  <label class="ect-block">
                    <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Image URL</span>
                    <input v-model="member.imageUrl" type="text" placeholder="https://…" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                  </label>
                  <div class="ect-grid ect-gap-4 sm:ect-grid-cols-2">
                    <label class="ect-block">
                      <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Name</span>
                      <input v-model="member.name" type="text" placeholder="Full name" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                    </label>
                    <label class="ect-block">
                      <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Role</span>
                      <input v-model="member.role" type="text" placeholder="Co-founder" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
                    </label>
                  </div>
                  <div class="ect-flex ect-flex-wrap ect-items-center ect-justify-between ect-gap-3 ect-border-t ect-border-sand ect-pt-4">
                    <label class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-sm ect-text-charcoal">
                      <input v-model="member.active" type="checkbox" class="ect-h-4 ect-w-4 ect-rounded ect-border-gold-400 ect-text-gold-700 focus:ect-ring-gold-400" />
                      Visible on page
                    </label>
                    <div class="ect-flex ect-flex-wrap ect-gap-2">
                      <button type="button" class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700" :disabled="index === 0" @click="moveAboutTeam(index, -1)">Move up</button>
                      <button type="button" class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700" :disabled="index === aboutTeam.length - 1" @click="moveAboutTeam(index, 1)">Move down</button>
                      <button type="button" class="ect-rounded-full ect-border ect-border-red-200 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-red-600 hover:ect-bg-red-50" @click="removeAboutTeam(index)">Remove</button>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div v-else class="ect-rounded-2xl ect-border ect-border-dashed ect-border-sand ect-bg-cream ect-p-8 ect-text-center">
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55">No people added yet — the "People behind Kiana" section is hidden on the storefront until you add someone.</p>
            </div>
          </div>
        </div>

        <div v-else-if="activeTabId === 'branding'" class="ect-p-4 sm:ect-p-5">
          <div class="ect-mb-5 ect-flex ect-flex-col ect-gap-3 sm:ect-flex-row sm:ect-items-center sm:ect-justify-between">
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-gold-700 ect-mb-1">Storefront identity</p>
              <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">Site logo</h2>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Upload a logo or paste an image URL. It replaces the logo in the header and footer across the storefront. If left empty, the bundled default logo is used.</p>
            </div>
            <div class="ect-flex ect-flex-wrap ect-gap-2">
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-60"
                :disabled="logoSaving || logoLoading"
                @click="saveSiteConfig"
              >
                {{ logoSaving ? 'Saving…' : 'Save branding' }}
              </button>
            </div>
          </div>

          <p
            v-if="logoMessage"
            class="ect-mb-4 ect-font-body ect-text-sm"
            :class="logoMessage === 'Branding saved.' ? 'ect-text-emerald-700' : 'ect-text-red-600'"
          >
            {{ logoMessage }}
          </p>

          <div v-if="logoLoading" class="ect-h-40 ect-max-w-md ect-rounded-2xl ect-bg-cream ect-animate-pulse" />

          <article v-else class="ect-max-w-md ect-overflow-hidden ect-rounded-2xl ect-border ect-border-sand ect-bg-white">
            <div class="ect-flex ect-items-center ect-justify-center ect-bg-charcoal/5 ect-p-8">
              <img :src="logoPreviewSrc" alt="Logo preview" class="ect-h-14 ect-w-auto ect-max-w-full ect-object-contain" />
            </div>
            <div class="ect-space-y-4 ect-p-4">
              <div class="ect-flex ect-flex-wrap ect-gap-2">
                <label class="ect-inline-flex ect-cursor-pointer ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-gold-400 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 hover:ect-bg-cream">
                  Upload logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="ect-hidden"
                    @change="onLogoFileChange"
                  />
                </label>
                <button
                  v-if="logoUrl"
                  type="button"
                  class="ect-rounded-full ect-border ect-border-red-200 ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-red-600 hover:ect-bg-red-50"
                  @click="clearLogo"
                >
                  Reset to default
                </button>
              </div>

              <label class="ect-block">
                <span class="ect-mb-1.5 ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Logo image URL</span>
                <input v-model="logoUrl" type="text" placeholder="https://… or upload above" class="ect-w-full ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40" />
              </label>
            </div>
          </article>
        </div>

        <div v-else-if="activeTabId === 'discounts'" class="ect-p-4 sm:ect-p-5">
          <div class="ect-mb-5 ect-flex ect-flex-col ect-gap-3 sm:ect-flex-row sm:ect-items-center sm:ect-justify-between">
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-gold-700 ect-mb-1">Pricing</p>
              <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">Volume discount</h2>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Reward larger orders with an automatic discount based on the total number of items in the cart. The best matching tier is applied at checkout.</p>
            </div>
            <div class="ect-flex ect-flex-wrap ect-gap-2">
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-60"
                :disabled="discountSaving || logoLoading"
                @click="saveDiscountConfig"
              >
                {{ discountSaving ? 'Saving…' : 'Save discount' }}
              </button>
            </div>
          </div>

          <p
            v-if="discountMessage"
            class="ect-mb-4 ect-font-body ect-text-sm"
            :class="discountMessage === 'Discount settings saved.' ? 'ect-text-emerald-700' : 'ect-text-red-600'"
          >
            {{ discountMessage }}
          </p>

          <div v-if="logoLoading" class="ect-h-40 ect-max-w-xl ect-rounded-2xl ect-bg-cream ect-animate-pulse" />

          <article v-else class="ect-max-w-xl ect-rounded-2xl ect-border ect-border-sand ect-bg-white ect-p-5 ect-space-y-5">
            <label class="ect-flex ect-items-center ect-gap-3 ect-cursor-pointer">
              <input v-model="volumeDiscountEnabled" type="checkbox" class="ect-h-4 ect-w-4 ect-rounded ect-border-charcoal/25 ect-text-gold-700 focus:ect-ring-gold-400/40" />
              <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Enable volume discount on the storefront</span>
            </label>

            <div :class="volumeDiscountEnabled ? '' : 'ect-opacity-50 ect-pointer-events-none'">
              <div class="ect-flex ect-items-center ect-justify-between ect-mb-2">
                <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Discount tiers</span>
                <button
                  type="button"
                  class="ect-inline-flex ect-items-center ect-gap-1 ect-rounded-full ect-border ect-border-gold-400 ect-px-3 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 hover:ect-bg-cream"
                  @click="addDiscountTier"
                >
                  + Add tier
                </button>
              </div>

              <p v-if="!volumeDiscountTiers.length" class="ect-font-body ect-text-sm ect-text-charcoal/45 ect-py-3">No tiers yet. Add one, e.g. “5 items → 5% off”.</p>

              <div class="ect-space-y-2">
                <div
                  v-for="(tier, i) in volumeDiscountTiers"
                  :key="i"
                  class="ect-flex ect-items-center ect-gap-2"
                >
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/55">Buy</span>
                  <input
                    v-model.number="tier.minQty"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Qty"
                    class="ect-w-20 ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40"
                  />
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/55">+ items, get</span>
                  <input
                    v-model.number="tier.percent"
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    placeholder="%"
                    class="ect-w-20 ect-rounded-xl ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40"
                  />
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/55">% off</span>
                  <button
                    type="button"
                    class="ect-ml-auto ect-p-1.5 ect-rounded-full ect-text-charcoal/30 hover:ect-bg-red-50 hover:ect-text-red-500 ect-transition-colors"
                    aria-label="Remove tier"
                    @click="removeDiscountTier(i)"
                  >
                    <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              <p class="ect-mt-3 ect-font-body ect-text-[11px] ect-text-charcoal/40">Tiers are matched by total cart quantity; the highest tier the cart qualifies for wins. Customized (quote) items count toward quantity but the percentage only reduces the priced subtotal.</p>
            </div>
          </article>
        </div>

        <div v-else-if="activeTabId === 'products'" class="ect-overflow-x-auto">
          <div class="ect-flex ect-flex-wrap ect-items-center ect-justify-between ect-gap-2 ect-border-b ect-border-sand ect-bg-cream ect-px-4 ect-py-3">
            <div class="ect-flex ect-w-full ect-flex-wrap ect-items-center ect-gap-2 lg:ect-w-auto">
              <div class="ect-relative ect-w-full sm:ect-w-72">
                <svg class="ect-absolute ect-left-3 ect-top-1/2 -ect-translate-y-1/2 ect-w-4 ect-h-4 ect-text-charcoal/35" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"/></svg>
                <input
                  v-model="productSearch"
                  type="search"
                  placeholder="Search products…"
                  class="ect-w-full ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-pl-9 ect-pr-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
                  @input="onProductSearchInput"
                />
              </div>
              <UiSelect
                v-model="productStatusFilter"
                :options="productStatusOptions"
                class="ect-w-full sm:ect-w-44"
                @update:model-value="onProductStatusChange"
              />
              <UiSelect
                v-model="productVectorFilter"
                :options="productVectorOptions"
                class="ect-w-full sm:ect-w-48"
                @update:model-value="onProductStatusChange"
              />
            </div>
            <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-2">
            <button
              v-if="aiRunning"
              type="button"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-red-200 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-red-600 hover:ect-bg-red-50 ect-transition-colors"
              @click="stopAiRun"
            >
              {{ `Stop AI run (${aiProgress.done}${aiProgress.total ? '/' + aiProgress.total : ''})` }}
            </button>
            <button
              v-if="syncRunning"
              type="button"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-red-200 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-red-600 hover:ect-bg-red-50 ect-transition-colors"
              @click="stopPhotoVectorSync"
            >
              {{ `Stop photo sync (${syncProgress.done}${syncProgress.total ? '/' + syncProgress.total : ''})` }}
            </button>
            <div ref="productMoreRef" class="ect-relative">
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-gap-1.5 ect-rounded-full ect-border ect-border-charcoal/15 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors"
                aria-haspopup="menu"
                :aria-expanded="productMoreOpen"
                @click="productMoreOpen = !productMoreOpen"
              >
                More
                <svg class="ect-w-3.5 ect-h-3.5 ect-transition-transform" :class="productMoreOpen ? 'ect-rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              <div
                v-if="productMoreOpen"
                class="ect-absolute ect-right-0 ect-top-full ect-z-30 ect-mt-2 ect-w-56 ect-rounded-2xl ect-border ect-border-charcoal/10 ect-bg-white ect-py-1.5 ect-shadow-xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  :disabled="aiRunning"
                  class="ect-block ect-w-full ect-px-4 ect-py-2.5 ect-text-left ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-bg-cream hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                  @click="productMoreOpen = false; openAiModal()"
                >
                  {{ aiRunning ? `Running ${aiProgress.done}${aiProgress.total ? '/' + aiProgress.total : ''}…` : 'Run all through AI' }}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  :disabled="syncRunning || aiRunning"
                  title="Re-scan every product's photos (DB + S3 folder) and embed any new ones for visual search. Already-embedded photos are skipped."
                  class="ect-block ect-w-full ect-px-4 ect-py-2.5 ect-text-left ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-bg-cream hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                  @click="productMoreOpen = false; runPhotoVectorSync()"
                >
                  {{ syncRunning ? `Syncing ${syncProgress.done}${syncProgress.total ? '/' + syncProgress.total : ''}…` : 'Sync photo vectors' }}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  :disabled="exporting"
                  class="ect-block ect-w-full ect-px-4 ect-py-2.5 ect-text-left ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-bg-cream hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                  @click="productMoreOpen = false; exportProducts()"
                >
                  {{ exporting ? 'Exporting…' : 'Export products' }}
                </button>
              </div>
            </div>
            <RouterLink
              to="/internal/products/import"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors"
            >
              Mass upload
            </RouterLink>
            <RouterLink
              to="/internal/products/new"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors"
            >
              New product
            </RouterLink>
            </div>
          </div>

          <p v-if="exportError" class="ect-mt-2 ect-font-body ect-text-sm ect-text-red-600">{{ exportError }}</p>

          <!-- Run-through-AI options modal -->
          <div
            v-if="aiModalOpen"
            class="ect-fixed ect-inset-0 ect-z-[60] ect-flex ect-items-center ect-justify-center ect-bg-charcoal/40 ect-backdrop-blur-sm ect-p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Run products through AI"
            @click.self="aiModalOpen = false"
          >
            <div class="ect-w-full ect-max-w-md ect-rounded-2xl ect-bg-white ect-p-6 ect-shadow-2xl">
              <h3 class="ect-font-display ect-text-xl ect-text-charcoal">Run products through AI</h3>
              <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55">
                Generates the AI description and refreshes the image-search vector. Images are pulled
                from each product's S3 folder when none are stored in the database.
              </p>

              <div class="ect-mt-4 ect-space-y-2">
                <label
                  class="ect-flex ect-cursor-pointer ect-items-start ect-gap-3 ect-rounded-xl ect-border ect-p-3 ect-transition-colors"
                  :class="aiScope === 'missing' ? 'ect-border-gold-400 ect-bg-champagne/50' : 'ect-border-charcoal/15 hover:ect-border-charcoal/25'"
                >
                  <input type="radio" value="missing" v-model="aiScope" class="ect-mt-1" />
                  <span>
                    <span class="ect-block ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Only products missing an AI description</span>
                    <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/55">Cheaper. Skips products that already have one. Good for incremental runs.</span>
                  </span>
                </label>
                <label
                  class="ect-flex ect-cursor-pointer ect-items-start ect-gap-3 ect-rounded-xl ect-border ect-p-3 ect-transition-colors"
                  :class="aiScope === 'all' ? 'ect-border-gold-400 ect-bg-champagne/50' : 'ect-border-charcoal/15 hover:ect-border-charcoal/25'"
                >
                  <input type="radio" value="all" v-model="aiScope" class="ect-mt-1" />
                  <span>
                    <span class="ect-block ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">All products (overwrite existing)</span>
                    <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/55">Re-runs every active product. Overwrites existing AI descriptions — one vision call per product (costs apply).</span>
                  </span>
                </label>
              </div>

              <div class="ect-mt-6 ect-flex ect-items-center ect-justify-end ect-gap-2">
                <button
                  type="button"
                  class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors"
                  @click="aiModalOpen = false"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors"
                  @click="runAllThroughAi"
                >
                  Start run
                </button>
              </div>
            </div>
          </div>

          <div v-if="aiError" class="ect-mx-4 ect-mt-3 ect-rounded-lg ect-bg-red-50 ect-p-3 ect-font-body ect-text-sm ect-text-red-700">
            {{ aiError }}
          </div>
          <div v-if="aiResults.length" class="ect-mx-4 ect-mt-3 ect-rounded-lg ect-border ect-border-sand ect-p-3">
            <p class="ect-font-body ect-text-sm ect-text-charcoal/70">
              Generated {{ aiTotals.generated }} · Empty {{ aiTotals.empty }} · Skipped {{ aiTotals.skipped }} · Errors {{ aiTotals.error }}
              <span v-if="!aiRunning" class="ect-text-charcoal/45"> · done</span>
            </p>
            <div class="ect-mt-2 ect-max-h-60 ect-overflow-y-auto">
              <div v-for="(r, i) in aiResults" :key="i" class="ect-flex ect-items-center ect-gap-2 ect-py-1 ect-font-body ect-text-sm">
                <span class="ect-rounded-full ect-px-2 ect-py-0.5 ect-text-xs ect-font-semibold" :class="aiStatusClass(r.status)">{{ r.status }}</span>
                <span class="ect-text-charcoal/80">{{ r.slug }}</span>
                <span class="ect-text-charcoal/50">{{ r.message }}</span>
              </div>
            </div>
          </div>
          <div v-if="syncError" class="ect-mx-4 ect-mt-3 ect-rounded-lg ect-bg-red-50 ect-p-3 ect-font-body ect-text-sm ect-text-red-700">
            {{ syncError }}
          </div>
          <div v-if="syncResults.length" class="ect-mx-4 ect-mt-3 ect-rounded-lg ect-border ect-border-sand ect-p-3">
            <p class="ect-font-body ect-text-sm ect-text-charcoal/70">
              Photo vectors — Synced {{ syncTotals.synced || 0 }} · Unchanged {{ syncTotals.unchanged || 0 }} · No images {{ syncTotals['no-images'] || 0 }} · Errors {{ syncTotals.error || 0 }}
              <span v-if="!syncRunning" class="ect-text-charcoal/45"> · done</span>
            </p>
            <div class="ect-mt-2 ect-max-h-60 ect-overflow-y-auto">
              <div v-for="(r, i) in syncResults" :key="i" class="ect-flex ect-items-center ect-gap-2 ect-py-1 ect-font-body ect-text-sm">
                <span class="ect-rounded-full ect-px-2 ect-py-0.5 ect-text-xs ect-font-semibold" :class="syncStatusClass(r.status)">{{ r.status }}</span>
                <span class="ect-text-charcoal/80">{{ r.slug }}</span>
                <span class="ect-text-charcoal/50">{{ r.message }}</span>
              </div>
            </div>
          </div>
          <table class="ect-w-full ect-min-w-[920px] ect-border-collapse">
            <thead class="ect-bg-cream"><tr><th v-for="h in ['Product', 'Category', 'Material', 'Status', 'Photo vectors', 'Created', 'Modified']" :key="h" class="ect-px-4 ect-py-3 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">{{ h }}</th></tr></thead>
            <tbody>
              <template v-if="productListLoading">
                <tr v-for="index in skeletonRows" :key="index" class="ect-border-t ect-border-sand">
                  <td v-for="width in productSkeletonWidths" :key="width" class="ect-px-4 ect-py-3">
                    <div class="ect-h-4 ect-rounded ect-bg-sand ect-animate-pulse" :class="width"></div>
                  </td>
                </tr>
              </template>
              <tr v-for="row in products" v-else :key="row.id" class="ect-border-t ect-border-sand">
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-font-semibold">
                  <RouterLink :to="`/internal/products/${row.slug}`" class="ect-text-charcoal hover:ect-text-gold-700 hover:ect-underline">
                    {{ row.title }}
                  </RouterLink>
                  <RouterLink :to="`/internal/products/${row.slug}`" class="ect-block ect-text-xs ect-text-charcoal/40 hover:ect-text-gold-700 hover:ect-underline">
                    {{ row.slug }}
                  </RouterLink>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">{{ row.category }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">{{ row.material }}</td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm">{{ row.active ? 'Active' : 'Hidden' }}</td>
                <td class="ect-px-4 ect-py-3">
                  <span
                    class="ect-inline-flex ect-items-center ect-rounded-full ect-px-2.5 ect-py-1 ect-font-body ect-text-xs ect-font-semibold"
                    :class="row.imageVectors ? 'ect-bg-emerald-100 ect-text-emerald-700' : 'ect-bg-amber-100 ect-text-amber-700'"
                  >
                    {{ row.imageVectors ? `Synced · ${row.imageVectors}` : 'Not synced' }}
                  </span>
                </td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ formatDate(row.createdAt) }}<span class="ect-block ect-text-xs ect-text-charcoal/40">by {{ row.createdBy || '—' }}</span></td>
                <td class="ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55">{{ row.modifiedAt ? formatDate(row.modifiedAt) : formatDate(row.updatedAt) }}<span v-if="row.modifiedBy" class="ect-block ect-text-xs ect-text-charcoal/40">by {{ row.modifiedBy }}</span></td>
              </tr>
              <tr v-if="!productListLoading && !products.length" class="ect-border-t ect-border-sand">
                <td colspan="7" class="ect-px-4 ect-py-6 ect-font-body ect-text-sm ect-text-charcoal/45">No products found.</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!productListLoading && products.length" class="ect-flex ect-flex-col ect-items-center ect-gap-3 ect-border-t ect-border-sand ect-px-4 ect-py-4">
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45">Showing {{ products.length }} of {{ productTotal }}</p>
            <button
              v-if="productHasMore"
              type="button"
              :disabled="productLoadingMore"
              class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
              @click="loadProducts(false)"
            >
              {{ productLoadingMore ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
