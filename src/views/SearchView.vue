<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSearch } from '../composables/useSearch'
import { useProductsApi } from '../composables/useProductsApi'
import { API_BASE } from '../config-api'
import type { Product } from '../data/products'
import ProductCard from '../components/ProductCard.vue'

const route = useRoute()
const router = useRouter()

const {
  isImageSearch,
  imageSearchLoading,
  imageSearchError,
  imagePreviewUrl,
  imageResults: rawImageResults,
  imageSearchStrategy,
  searchByImage,
  clearImageSearch,
  searchSubmitTick,
} = useSearch()

const imageFileInput = ref<HTMLInputElement | null>(null)
const localQuery = ref(String(route.query.q || ''))
// The query whose results are on screen. Typing edits localQuery only; results
// (and this ref) change exclusively on explicit submit — Enter / lens / deep link.
const submittedQuery = ref('')

// AI text search state — results come from the existing /api/chat product-search
// flow (same endpoint the chat assistant uses), not a bespoke search endpoint.
const aiResults = ref<Product[]>([])
const aiLoading = ref(false)
// 'ai' = chat semantic results; 'keyword' = client fallback when the call fails.
const searchMode = ref<'ai' | 'keyword' | 'empty'>('empty')

// Resolve the same chat endpoint useChat targets (honours VITE_CHAT_ENDPOINT).
const rawChatEndpoint = String(import.meta.env.VITE_CHAT_ENDPOINT || 'chat').trim()
const chatPath = rawChatEndpoint.startsWith('/api/')
  ? rawChatEndpoint
  : rawChatEndpoint.startsWith('api/')
    ? `/${rawChatEndpoint}`
    : `/api/${rawChatEndpoint}`

const { products, ensureProductsLoaded, loading: productsLoading } = useProductsApi()

// Literal substring match — used as the client-side fallback if the request fails.
function clientKeywordFilter(q: string): Product[] {
  const needle = q.toLowerCase().trim()
  if (!needle) return products.value
  return products.value.filter(
    (p) =>
      p.title?.toLowerCase().includes(needle) ||
      p.category?.toLowerCase().includes(needle) ||
      p.description?.toLowerCase().includes(needle),
  )
}

// Token guards against out-of-order responses clobbering a newer query.
let searchToken = 0
let inFlightQuery: string | null = null

// Below this length the query can't carry intent — the keyword filter covers it.
const MIN_AI_QUERY_LENGTH = 3

// Map the chat endpoint's result summaries (slug-bearing) back to full catalog
// products so ProductCard renders with images/price — same approach as
// useChat.resolveResultProducts.
function resolveBySlug(rawResults: Array<{ slug?: string }>): Product[] {
  const bySlug = new Map(products.value.map((p) => [p.slug, p]))
  const resolved: Product[] = []
  for (const item of rawResults) {
    if (!item?.slug) continue
    const full = bySlug.get(item.slug)
    if (full) resolved.push(full)
  }
  return resolved
}

// AI search runs only on explicit intent: Enter / lens button / a deep link
// with a query. Typing shows the client keyword filter and never calls this.
async function runTextSearch(rawQuery: string) {
  const q = rawQuery.trim()
  // Too short for the AI to rank meaningfully — the keyword filter is already showing.
  if (!q || q.length < MIN_AI_QUERY_LENGTH) return
  // Same query already on the wire (e.g. Enter mashed while loading) — let it finish.
  if (q === inFlightQuery) return
  const token = ++searchToken
  aiLoading.value = true
  inFlightQuery = q
  try {
    await ensureProductsLoaded()
    const res = await fetch(`${API_BASE}${chatPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: q }] }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      results?: Array<{ slug?: string }>
      searchResults?: Array<{ slug?: string }>
    }
    if (!res.ok) throw new Error('chat search failed')
    if (token !== searchToken) return // a newer query superseded this one
    const rawResults = Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.searchResults)
        ? data.searchResults
        : []
    aiResults.value = resolveBySlug(rawResults)
    searchMode.value = 'ai'
  } catch {
    if (token !== searchToken) return
    searchMode.value = 'keyword' // textResults falls back to the keyword filter
  } finally {
    if (token === searchToken) aiLoading.value = false
    if (inFlightQuery === q) inFlightQuery = null
  }
}

// The single entry point for an explicit search: keyword results show at once,
// and the AI ranking replaces them when it lands (skipped for tiny queries).
function executeSearch(rawQuery: string) {
  const q = rawQuery.trim()
  // Same query already on the wire — a nav-bar submit triggers both the route
  // watcher and the submit tick; let the first request finish, don't orphan it.
  if (q && q === inFlightQuery) return
  submittedQuery.value = q
  searchToken++ // orphan any in-flight AI response from a previous submit
  // A new text search replaces any earlier image search — otherwise the sticky
  // module-level image state keeps rendering the old visual results. Empty
  // queries must NOT clear it: starting an image search wipes ?q from the URL,
  // and the resulting executeSearch('') from the route watcher would kill the
  // image search that was just kicked off.
  if (q) clearImageSearch()
  if (!q) {
    searchMode.value = 'empty'
    aiResults.value = []
    return
  }
  searchMode.value = 'keyword'
  if (q.length >= MIN_AI_QUERY_LENGTH) void runTextSearch(q)
}

// Results always belong to the last submitted query — typing changes nothing here.
const textResults = computed(() => {
  const q = submittedQuery.value
  if (!q) return products.value
  if (searchMode.value === 'ai') return aiResults.value
  return clientKeywordFilter(q)
})

// Image search results come from the composable (module-level state persists after navigation)
const imageResults = computed(() => rawImageResults?.value ?? [])

// Honest description of how the backend actually matched — it may fall back
// from photo-to-photo search to text embeddings or attribute scoring, and the
// thresholds differ per path, so no fixed similarity claim is shown.
const imageSearchMethodLabel = computed(() => {
  switch (imageSearchStrategy.value) {
    case 'image-vector':
      return 'Matched by photo similarity'
    case 'vector':
      return 'Matched by AI description similarity'
    case null:
      return ''
    default:
      return 'Matched by detected attributes'
  }
})

// Badge only near-duplicate photo hits. Raw cosine scores read as false
// precision ("91% vs 89%" is embedding noise), and the text-vector fallback's
// scores live on a different scale where 0.9 doesn't mean visually identical —
// so anything below the bar, or from another strategy, shows no badge at all.
const CLOSE_MATCH_THRESHOLD = 0.9
function isCloseMatch(item: Product): boolean {
  return (
    imageSearchStrategy.value === 'image-vector' &&
    Number((item as any).vectorScore || 0) >= CLOSE_MATCH_THRESHOLD
  )
}

const isLoading = computed(
  () =>
    productsLoading.value ||
    imageSearchLoading.value ||
    (aiLoading.value && !!submittedQuery.value),
)

function openImagePicker() {
  imageFileInput.value?.click()
}

function onImageFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  localQuery.value = ''
  router.replace({ path: '/search' })
  searchByImage(file)
  ;(e.target as HTMLInputElement).value = ''
}

// Enter / lens button on this page's own search bar — explicit intent, so it
// always replaces an active image search (even with an empty query).
function handleSubmit() {
  clearImageSearch()
  const q = localQuery.value.trim()
  router.replace({ path: '/search', query: q ? { q } : {} })
  executeSearch(localQuery.value)
}

function clearQuery() {
  localQuery.value = ''
  router.replace('/search')
  executeSearch('')
}

// The banner's ✕ — router.replace alone can't do this, since the image state
// lives in the composable and the URL often already has no query to change.
function dismissImageSearch() {
  clearImageSearch()
  router.replace('/search')
}

// The URL only changes on explicit submits and external navigation (nav-bar
// search, back/forward, shared links) — all of which should run the search.
watch(() => route.query.q, (v) => {
  const next = String(v || '')
  if (next === localQuery.value && next === submittedQuery.value) return
  localQuery.value = next
  executeSearch(next)
})

// Re-submit of the same query from the nav-bar (Enter / lens) — the URL doesn't
// change, so the route watcher stays silent; the tick still signals intent.
watch(searchSubmitTick, () => {
  localQuery.value = String(route.query.q || '')
  executeSearch(localQuery.value)
})

onMounted(async () => {
  await ensureProductsLoaded()
  // A deep link (/search?q=…) carries explicit intent — run the search once.
  if (localQuery.value.trim()) executeSearch(localQuery.value)
})
</script>

<template>
  <input
    ref="imageFileInput"
    type="file"
    accept="image/*"
    class="ect-hidden"
    @change="onImageFileChange"
  />

  <main class="ect-min-h-screen ect-bg-cream ect-pt-32 ect-pb-20 ect-px-5">
    <section class="ect-max-w-5xl ect-mx-auto">

      <!-- Search bar (desktop only — mobile uses the header's search bar) -->
      <form
        @submit.prevent="handleSubmit"
        class="ect-hidden lg:ect-flex ect-items-center ect-gap-2 ect-mb-10"
      >
        <section class="ect-flex-1 ect-flex ect-items-center ect-gap-3 ect-bg-white ect-rounded-2xl ect-shadow-sm ect-ring-1 ect-ring-charcoal/[0.07] focus-within:ect-ring-gold-400/40 ect-px-4 ect-py-3 ect-transition-all">
          <button
            type="submit"
            title="Search"
            aria-label="Search"
            class="ect-shrink-0 ect-text-charcoal/25 hover:ect-text-gold-700 ect-transition-colors"
          >
            <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </button>
          <input
            v-model="localQuery"
            type="text"
            placeholder="Search for jewellery…"
            autofocus
            class="ect-flex-1 ect-bg-transparent ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none"
          />
          <button
            v-if="localQuery"
            type="button"
            class="ect-text-charcoal/30 hover:ect-text-charcoal ect-transition-colors ect-shrink-0"
            @click="clearQuery"
          >
            <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </section>

        <!-- Camera button -->
        <button
          type="button"
          title="Search by image"
          aria-label="Search by image"
          class="ect-flex ect-items-center ect-justify-center ect-w-12 ect-h-12 ect-rounded-2xl ect-bg-white ect-shadow-sm ect-ring-1 ect-ring-charcoal/[0.07] ect-text-charcoal/40 hover:ect-text-gold-700 hover:ect-ring-gold-400/50 ect-transition-all ect-shrink-0"
          @click="openImagePicker"
        >
          <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        </button>
      </form>

      <!-- Image search header -->
      <section v-if="isImageSearch" class="ect-flex ect-items-center ect-gap-4 ect-mb-8 ect-p-4 ect-bg-white ect-rounded-2xl ect-ring-1 ect-ring-charcoal/[0.06]">
        <img
          v-if="imagePreviewUrl"
          :src="imagePreviewUrl"
          alt="Search image"
          decoding="async"
          class="ect-w-14 ect-h-14 ect-rounded-xl ect-object-cover ect-ring-1 ect-ring-charcoal/10 ect-shrink-0"
        />
        <section class="ect-flex-1 ect-min-w-0">
          <p v-if="imageSearchLoading" class="ect-font-body ect-text-sm ect-text-charcoal/50 ect-flex ect-items-center ect-gap-2">
            <svg class="ect-w-4 ect-h-4 ect-animate-spin ect-text-gold-600 ect-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle class="ect-opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
              <path class="ect-opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Analysing image and searching catalogue…
          </p>
          <p v-else-if="imageSearchError" class="ect-font-body ect-text-sm ect-text-red-500">{{ imageSearchError }}</p>
          <p v-else class="ect-font-body ect-text-sm ect-text-charcoal">
            <span class="ect-font-semibold ect-text-charcoal">{{ imageResults.length }}</span>
            visually similar {{ imageResults.length === 1 ? 'piece' : 'pieces' }} found
          </p>
          <p class="ect-font-body ect-text-xs ect-text-charcoal/35 ect-mt-0.5">
            Searched by image<template v-if="!imageSearchLoading && !imageSearchError && imageSearchMethodLabel"> · {{ imageSearchMethodLabel }}</template>
          </p>
        </section>
        <button
          type="button"
          class="ect-shrink-0 ect-p-1.5 ect-text-charcoal/30 hover:ect-text-charcoal ect-transition-colors"
          aria-label="Clear image search"
          @click="dismissImageSearch"
        >
          <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </section>

      <!-- Text search label -->
      <p v-else-if="submittedQuery && !isLoading" class="ect-font-body ect-text-sm ect-text-charcoal/40 ect-mb-6 ect-flex ect-items-center ect-gap-2">
        <span>
          {{ textResults.length }} {{ textResults.length === 1 ? 'result' : 'results' }} for
          <span class="ect-text-charcoal/70 ect-font-medium">"{{ submittedQuery }}"</span>
        </span>
        <span
          v-if="searchMode === 'ai'"
          class="ect-inline-flex ect-items-center ect-gap-1 ect-px-2 ect-py-0.5 ect-rounded-full ect-bg-gold-100/70 ect-ring-1 ect-ring-gold-400/30 ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-gold-700"
        >
          <svg class="ect-w-2.5 ect-h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>
          Smart search
        </span>
      </p>

      <!-- Loading skeletons -->
      <ul v-if="isLoading" class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0">
        <li v-for="n in 8" :key="n" class="ect-animate-pulse">
          <section class="ect-aspect-square ect-rounded-2xl ect-bg-sand ect-mb-3" />
          <section class="ect-h-4 ect-w-3/4 ect-rounded ect-bg-sand/80 ect-mb-2" />
          <section class="ect-h-3 ect-w-1/3 ect-rounded ect-bg-sand/60" />
        </li>
      </ul>

      <!-- Image search results -->
      <template v-else-if="isImageSearch">
        <ul v-if="imageResults.length" class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0">
          <li v-for="item in imageResults" :key="item.slug" class="ect-relative ect-h-full">
            <!-- Shown only on near-duplicate photo hits; raw scores stay in the API debug payload -->
            <span
              v-if="isCloseMatch(item)"
              class="ect-absolute ect-top-2 ect-left-2 ect-z-10 ect-inline-flex ect-items-center ect-gap-1 ect-px-2 ect-py-0.5 ect-rounded-full ect-bg-white/90 ect-backdrop-blur-sm ect-ring-1 ect-ring-charcoal/10 ect-font-body ect-text-[10px] ect-font-semibold ect-text-gold-700"
            >
              <svg class="ect-w-2.5 ect-h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>
              Close match
            </span>
            <ProductCard
              :slug="item.slug"
              :title="item.title"
              :category="item.category"
              :material="(item as any).material"
              :price="(item as any).price"
              :images="(item as any).images"
              :product="item"
            />
          </li>
        </ul>
        <section v-else-if="!imageSearchLoading" class="ect-flex ect-flex-col ect-items-center ect-py-24 ect-text-center">
          <span class="ect-w-16 ect-h-16 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-mb-4">
            <svg class="ect-w-7 ect-h-7 ect-text-gold-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </span>
          <p class="ect-font-display ect-text-lg ect-font-light ect-text-charcoal ect-mb-1">No close matches found</p>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/45 ect-mb-6">Try a clearer or closer photo of the jewellery</p>
          <button
            type="button"
            class="ect-inline-flex ect-items-center ect-gap-2 ect-px-5 ect-py-2.5 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold hover:ect-bg-noir ect-transition-colors"
            @click="openImagePicker"
          >
            <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            Try another image
          </button>
        </section>
      </template>

      <!-- Text search results -->
      <template v-else>
        <ul v-if="textResults.length" class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0">
          <li v-for="item in textResults" :key="item.slug" class="ect-h-full">
            <ProductCard
              :slug="item.slug"
              :title="item.title"
              :category="item.category"
              :material="item.material"
              :price="item.price"
              :images="item.images"
              :product="item"
            />
          </li>
        </ul>
        <section v-else-if="submittedQuery && !productsLoading" class="ect-flex ect-flex-col ect-items-center ect-py-24 ect-text-center">
          <span class="ect-w-16 ect-h-16 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-mb-4">
            <svg class="ect-w-7 ect-h-7 ect-text-gold-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </span>
          <p class="ect-font-display ect-text-lg ect-font-light ect-text-charcoal ect-mb-1">No results for "{{ submittedQuery }}"</p>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/45">Try a different word, or search by image using the camera button</p>
        </section>
      </template>

    </section>
  </main>
</template>
