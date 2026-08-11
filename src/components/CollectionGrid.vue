<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import ProductCard from './ProductCard.vue'
import FilterModal from './FilterModal.vue'
import { CATALOG_CATEGORIES, CENTER_SHAPE_OPTIONS, centerStoneSizesForShapes, formatCenterStoneSize, productHasCenterShape, productHasCenterStoneSize, type Category, type Material, type Color, type ProductSubtype } from '../data/products'
import { presetCategories, useCollectionPreset } from '../composables/useCollectionPreset'
import { useProductsApi } from '../composables/useProductsApi'
import { useAuth } from '../composables/useAuth'
import { useRoute } from 'vue-router'
import { API_BASE } from '../config-api'

type TabId = 'new' | 'bestseller' | 'all'

interface Filters {
  categories: Category[]
  materials: Material[]
  colors: Color[]
  subtypes: ProductSubtype[]
  centerShapes: string[]
  centerStoneSizes: string[]
}

const props = withDefaults(defineProps<{ hideHeader?: boolean; sidebar?: boolean; guestPreviewLimit?: number }>(), {
  guestPreviewLimit: 0,
})

const { products, ensureProductsLoaded, loading: productsLoading, loaded: productsLoaded } = useProductsApi()
const { preset, consumePreset } = useCollectionPreset()
const { isLoggedIn } = useAuth()
const route = useRoute()

const activeTab = ref<TabId>('all')
const filterOpen = ref(false)
// Categories a collection preset scopes the page to. One locked category (the
// Rings page) hides the Category filter — the page title already says it. Two
// or more (Bracelets & Bangles) keeps the filter but narrows it to that set, so
// shoppers can drill into just one without escaping the page's scope.
const lockedCategories = ref<Category[]>([])
const singleLockedCategory = computed(() => (lockedCategories.value.length === 1 ? lockedCategories.value[0] : null))
const appliedFilters = ref<Filters>({ categories: [], materials: [], colors: [], subtypes: [], centerShapes: [], centerStoneSizes: [] })
const filteredProducts = ref<any[]>([])
const listLoading = ref(false)
const firstLoadDone = ref(false)
const readyForFilterFetch = ref(false)
const mainColumnRef = ref<HTMLElement | null>(null)

function scrollToResultsTop() {
  const column = mainColumnRef.value
  if (!column) return
  const top = window.scrollY + column.getBoundingClientRect().top - 112
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

function applyPreset(p: NonNullable<typeof preset.value>) {
  const f: Filters = { categories: [], materials: [], colors: [], subtypes: [], centerShapes: [], centerStoneSizes: [] }
  const locked = presetCategories(p)
  f.categories = [...locked]
  if (p.material) f.materials = [p.material]
  if (p.color) f.colors = [p.color]
  if (p.subtypes !== undefined) f.subtypes = p.subtypes
  appliedFilters.value = f
  lockedCategories.value = locked
  if (p.tab) activeTab.value = p.tab
}

onMounted(async () => {
  await ensureProductsLoaded()
  const pending = preset.value
  if (pending) {
    applyPreset(pending)
    consumePreset()
  }
  readyForFilterFetch.value = true
  if (pending || activeFilterCount.value > 0 || activeTab.value !== 'all') {
    await loadFilteredProducts()
  } else {
    filteredProducts.value = products.value
    firstLoadDone.value = true
  }
})

watch(preset, (p) => {
  if (p) {
    applyPreset(p)
    consumePreset()
  }
})

const tabs: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New Arrival' },
  { id: 'bestseller', label: 'Best Seller' },
]

function switchTab(tab: TabId) {
  activeTab.value = tab
  scrollToResultsTop()
}

// --- Sort (desktop sidebar layout) ---
type SortId = 'featured' | 'newest'
const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
]
const sortBy = ref<SortId>('featured')
const sortOpen = ref(false)
const sortLabel = computed(() => SORT_OPTIONS.find((o) => o.id === sortBy.value)?.label ?? 'Featured')
const catalogLocked = computed(() => props.guestPreviewLimit > 0 && !isLoggedIn.value)

function selectSort(id: SortId) {
  sortBy.value = id
  sortOpen.value = false
}

const displayedProducts = computed(() => {
  const list = [...filteredProducts.value]
  if (sortBy.value === 'newest') list.sort((a, b) => (b.isNewArrival ? 1 : 0) - (a.isNewArrival ? 1 : 0))
  return catalogLocked.value ? list.slice(0, props.guestPreviewLimit) : list
})

const hiddenProductCount = computed(() => Math.max(0, filteredProducts.value.length - displayedProducts.value.length))
const authRedirectQuery = computed(() => ({ redirect: route.fullPath }))

// --- Sidebar filter toggles (bind directly to appliedFilters; the deep
// watcher re-fetches the filtered list on change) ---
const materialOptions: { id: Material; label: string }[] = [
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
]

// Categories offered in the filter. A multi-category page (Bracelets & Bangles)
// offers only its own categories so the shopper can narrow without leaving it.
const categoryOptions = computed<Category[]>(() =>
  lockedCategories.value.length > 1 ? lockedCategories.value : CATALOG_CATEGORIES,
)

function toggleCategory(cat: Category) {
  const arr = appliedFilters.value.categories
  const i = arr.indexOf(cat)
  if (i === -1) arr.push(cat)
  else arr.splice(i, 1)
  // On a multi-category page an empty selection would mean "no category filter"
  // and leak the whole catalogue in, so clearing the last one falls back to the
  // page's full scope instead.
  if (lockedCategories.value.length > 1 && !arr.length) {
    appliedFilters.value.categories = [...lockedCategories.value]
  }
  scrollToResultsTop()
}
function toggleMaterial(m: Material) {
  const arr = appliedFilters.value.materials
  const i = arr.indexOf(m)
  if (i === -1) arr.push(m)
  else arr.splice(i, 1)
  scrollToResultsTop()
}
function toggleCenterShape(s: string) {
  const arr = appliedFilters.value.centerShapes
  const i = arr.indexOf(s)
  if (i === -1) arr.push(s)
  else arr.splice(i, 1)
  const availableSizes = new Set(centerStoneSizesForShapes(arr))
  appliedFilters.value.centerStoneSizes = appliedFilters.value.centerStoneSizes.filter((size) => availableSizes.has(size))
  scrollToResultsTop()
}
function toggleCenterStoneSize(s: string) {
  const arr = appliedFilters.value.centerStoneSizes
  const i = arr.indexOf(s)
  if (i === -1) arr.push(s)
  else arr.splice(i, 1)
  scrollToResultsTop()
}

function applyModalFilters(filters: Omit<Filters, 'subtypes'>) {
  appliedFilters.value = { ...filters, subtypes: appliedFilters.value.subtypes }
  scrollToResultsTop()
}
let filterRequestId = 0

function snapshotFilters(): Filters {
  const f = appliedFilters.value
  return {
    categories: [...f.categories],
    materials: [...f.materials],
    colors: [...f.colors],
    subtypes: [...f.subtypes],
    centerShapes: [...f.centerShapes],
    centerStoneSizes: [...f.centerStoneSizes],
  }
}

async function loadFilteredProducts() {
  const requestId = ++filterRequestId
  const requestedTab = activeTab.value
  const filters = snapshotFilters()
  listLoading.value = true
  try {
    const res = await fetch(`${API_BASE}/api/products-filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab: requestedTab,
        filters,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Failed to load filtered products.')
    let list = Array.isArray(data?.products) ? data.products : []
    const subtypes = filters.subtypes
    if (subtypes?.length) {
      list = list.filter((p: any) => subtypes.includes(p.subtype))
    }
    const shapes = filters.centerShapes
    if (shapes?.length) {
      list = list.filter((p: any) => shapes.some((s) => productHasCenterShape(p.customizationOptions?.centerShapes, s)))
    }
    const sizes = filters.centerStoneSizes
    if (sizes?.length) {
      list = list.filter((p: any) => sizes.some((s) => productHasCenterStoneSize(p.customizationOptions?.centerStoneSizes, s)))
    }
    if (requestId === filterRequestId) filteredProducts.value = list
  } catch (err) {
    console.error('Filter API error:', err)
    let list = products.value
    if (requestedTab === 'new') list = list.filter((p) => p.isNewArrival)
    else if (requestedTab === 'bestseller') list = list.filter((p) => p.isBestSeller)
    const f = filters
    if (f.categories.length) list = list.filter((p) => f.categories.includes(p.category))
    if (f.materials.length) list = list.filter((p) => f.materials.includes(p.material))
    if (f.colors.length) list = list.filter((p) => f.colors.includes(p.color))
    if (f.subtypes?.length) list = list.filter((p) => f.subtypes.includes(p.subtype as ProductSubtype))
    if (f.centerShapes?.length) list = list.filter((p) => f.centerShapes.some((s) => productHasCenterShape(p.customizationOptions?.centerShapes, s)))
    if (f.centerStoneSizes?.length) list = list.filter((p) => f.centerStoneSizes.some((s) => productHasCenterStoneSize(p.customizationOptions?.centerStoneSizes, s)))
    if (requestId === filterRequestId) filteredProducts.value = list
  } finally {
    if (requestId === filterRequestId) {
      listLoading.value = false
      firstLoadDone.value = true
    }
  }
}

const availableSidebarCenterStoneSizes = computed(() => centerStoneSizesForShapes(appliedFilters.value.centerShapes))

// Category chips stand for shopper choices only. A single locked category is
// page context; on a multi-category page the full locked set is too, so chips
// appear only once the shopper has narrowed to a subset of it.
const categoryChips = computed<Category[]>(() => {
  const locked = lockedCategories.value
  const selected = appliedFilters.value.categories
  if (locked.length > 1) return selected.length < locked.length ? [...selected] : []
  return selected.filter((c) => c !== singleLockedCategory.value)
})

const activeFilterCount = computed(() => {
  const f = appliedFilters.value
  let count = 0
  // Locked categories are page context, not a user-applied filter — but on a
  // multi-category page, narrowing to a subset of them is.
  const locked = lockedCategories.value
  if (locked.length > 1) {
    if (f.categories.length < locked.length) count++
  } else if (f.categories.some((c) => c !== singleLockedCategory.value)) count++
  if (f.materials.length) count++
  if (f.subtypes?.length) count++
  if (f.centerShapes?.length) count++
  if (f.centerStoneSizes?.length) count++
  return count
})

watch([activeTab, appliedFilters], () => {
  if (!readyForFilterFetch.value) return
  void loadFilteredProducts()
}, { deep: true })
</script>

<template>
  <section id="collections" class="ect-px-6 ect-max-w-7xl ect-mx-auto ect-pb-16 sm:ect-pb-24" :class="hideHeader ? 'ect-pt-3' : 'ect-pt-16 sm:ect-pt-24'">
    <header v-if="!hideHeader" class="ect-flex ect-flex-col sm:ect-flex-row sm:ect-items-end sm:ect-justify-between ect-gap-2 ect-mb-8">
      <section>
        <p class="ect-inline-flex ect-items-center ect-gap-2.5 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.22em] ect-text-gold-700 ect-mb-3">
          <span class="ect-w-8 ect-h-px ect-bg-gold-400" />
          The Collection
        </p>
        <h2 class="ect-font-display ect-text-3xl sm:ect-text-[2.75rem] ect-font-light ect-leading-tight ect-text-charcoal">Discover Our Pieces</h2>
      </section>
    </header>

    <!-- Tabs + Filter (single line on mobile: All, New, Best, icon) -->
    <section v-if="!catalogLocked" class="ect-flex ect-items-center ect-justify-between ect-gap-2 ect-mb-6 ect-border-b ect-border-sand ect-min-w-0" :class="sidebar ? 'lg:ect-hidden' : ''">
      <!-- Filter: icon only on mobile -->
      <button
        type="button"
        @click="filterOpen = true"
        aria-label="Filter"
        class="ect-relative ect-shrink-0 ect-flex ect-items-center ect-justify-center ect-w-9 ect-h-9 sm:ect-w-auto sm:ect-h-auto sm:ect-gap-1.5 sm:ect-px-3 sm:ect-py-2 ect-mb-1 ect-rounded-full ect-border ect-transition-colors"
        :class="activeFilterCount > 0 ? 'ect-border-gold-400 ect-text-gold-700 ect-bg-gold-50' : 'ect-border-sand ect-text-charcoal/60 hover:ect-border-gold-400/60 hover:ect-text-charcoal'"
      >
        <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
        </svg>
        <span class="ect-hidden sm:ect-inline ect-font-body ect-text-sm ect-font-medium">Filter</span>
        <span v-if="activeFilterCount > 0" class="ect-absolute -ect-top-0.5 -ect-right-0.5 sm:ect-static sm:ect-ml-0 ect-inline-flex ect-items-center ect-justify-center ect-min-w-[18px] ect-h-[18px] ect-rounded-full ect-bg-charcoal ect-text-white ect-text-[10px] ect-font-bold ect-px-1">{{ activeFilterCount }}</span>
      </button>

      <!-- Result count (right of the filter icon) -->
      <p class="ect-mb-1 ect-shrink-0 ect-font-body ect-text-xs ect-text-charcoal/40 ect-whitespace-nowrap">
        <template v-if="listLoading || productsLoading || !productsLoaded || !firstLoadDone">
          Loading pieces...
        </template>
        <template v-else>
          {{ filteredProducts.length }} {{ filteredProducts.length === 1 ? 'piece' : 'pieces' }} found
        </template>
      </p>

      <nav class="ect-flex ect-gap-0.5 sm:ect-gap-1 ect-min-w-0 ect-flex-1 ect-justify-end" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-label="tab.label"
          :class="activeTab === tab.id ? 'ect-text-charcoal ect-border-gold-400' : 'ect-text-charcoal/50 hover:ect-text-charcoal ect-border-transparent'"
          class="ect-font-body ect-text-xs sm:ect-text-sm ect-font-medium ect-px-2 sm:ect-px-4 ect-py-3 ect--mb-px ect-border-b-2 ect-transition-colors ect-whitespace-nowrap"
          @click="switchTab(tab.id)"
        >
          <span v-if="tab.id === 'all'">{{ tab.label }}</span>
          <template v-else-if="tab.id === 'new'">
            <span class="sm:ect-hidden">New</span>
            <span class="ect-hidden sm:ect-inline">New Arrival</span>
          </template>
          <template v-else-if="tab.id === 'bestseller'">
            <span class="sm:ect-hidden">Best</span>
            <span class="ect-hidden sm:ect-inline">Best Seller</span>
          </template>
        </button>
      </nav>
    </section>

    <!-- Two-column layout (persistent sidebar on desktop) -->
    <div :class="sidebar ? 'lg:ect-flex lg:ect-items-start lg:ect-gap-10' : ''">

      <!-- Desktop filter sidebar -->
      <aside v-if="sidebar && !catalogLocked" class="ect-hidden lg:ect-block lg:ect-w-56 lg:ect-shrink-0 lg:ect-sticky lg:ect-top-28 lg:ect-self-start lg:ect-max-h-[calc(100vh-8rem)] lg:ect-overflow-y-auto lg:ect-pr-2 ect-no-scrollbar">
        <!-- Category -->
        <section v-if="!singleLockedCategory" class="ect-mb-6">
          <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-gold-700 ect-mb-3.5">Category</h3>
          <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
            <li v-for="cat in categoryOptions" :key="cat">
              <label class="ect-flex ect-items-center ect-gap-2.5 ect-cursor-pointer ect-group">
                <input type="checkbox" class="ect-sr-only" :checked="appliedFilters.categories.includes(cat)" @change="toggleCategory(cat)" />
                <span class="ect-w-[18px] ect-h-[18px] ect-rounded ect-border ect-flex ect-items-center ect-justify-center ect-transition-colors" :class="appliedFilters.categories.includes(cat) ? 'ect-bg-rose-700 ect-border-rose-700' : 'ect-border-charcoal/25 group-hover:ect-border-rose-400'">
                  <svg v-if="appliedFilters.categories.includes(cat)" class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span class="ect-font-body ect-text-sm ect-text-charcoal/80 group-hover:ect-text-charcoal ect-transition-colors">{{ cat }}</span>
              </label>
            </li>
          </ul>
        </section>
        <hr v-if="!singleLockedCategory" class="ect-border-sand ect-mb-6" />

        <!-- Material -->
        <section class="ect-mb-6">
          <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-gold-700 ect-mb-3.5">Material</h3>
          <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
            <li v-for="m in materialOptions" :key="m.id">
              <label class="ect-flex ect-items-center ect-gap-2.5 ect-cursor-pointer ect-group">
                <input type="checkbox" class="ect-sr-only" :checked="appliedFilters.materials.includes(m.id)" @change="toggleMaterial(m.id)" />
                <span class="ect-w-[18px] ect-h-[18px] ect-rounded ect-border ect-flex ect-items-center ect-justify-center ect-transition-colors" :class="appliedFilters.materials.includes(m.id) ? 'ect-bg-rose-700 ect-border-rose-700' : 'ect-border-charcoal/25 group-hover:ect-border-rose-400'">
                  <svg v-if="appliedFilters.materials.includes(m.id)" class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span class="ect-font-body ect-text-sm ect-text-charcoal/80 group-hover:ect-text-charcoal ect-transition-colors">{{ m.label }}</span>
              </label>
            </li>
          </ul>
        </section>
        <hr class="ect-border-sand ect-mb-6" />

        <!-- Stone Shape -->
        <section>
          <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-gold-700 ect-mb-3.5">Stone Shape</h3>
          <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
            <li v-for="shape in CENTER_SHAPE_OPTIONS" :key="shape">
              <label class="ect-flex ect-items-center ect-gap-2.5 ect-cursor-pointer ect-group">
                <input type="checkbox" class="ect-sr-only" :checked="appliedFilters.centerShapes.includes(shape)" @change="toggleCenterShape(shape)" />
                <span class="ect-w-[18px] ect-h-[18px] ect-rounded ect-border ect-flex ect-items-center ect-justify-center ect-transition-colors" :class="appliedFilters.centerShapes.includes(shape) ? 'ect-bg-rose-700 ect-border-rose-700' : 'ect-border-charcoal/25 group-hover:ect-border-rose-400'">
                  <svg v-if="appliedFilters.centerShapes.includes(shape)" class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span class="ect-font-body ect-text-sm ect-text-charcoal/80 group-hover:ect-text-charcoal ect-transition-colors">{{ shape }}</span>
              </label>
            </li>
          </ul>
        </section>
        <hr class="ect-border-sand ect-my-6" />

        <!-- Stone Size -->
        <section>
          <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-gold-700 ect-mb-3.5">Stone Size</h3>
          <p v-if="!appliedFilters.centerShapes.length" class="ect-font-body ect-text-sm ect-leading-5 ect-text-charcoal/45">Select a stone shape to see available sizes.</p>
          <ul v-else class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
            <li v-for="size in availableSidebarCenterStoneSizes" :key="size">
              <label class="ect-flex ect-items-center ect-gap-2.5 ect-cursor-pointer ect-group">
                <input type="checkbox" class="ect-sr-only" :checked="appliedFilters.centerStoneSizes.includes(size)" @change="toggleCenterStoneSize(size)" />
                <span class="ect-w-[18px] ect-h-[18px] ect-rounded ect-border ect-flex ect-items-center ect-justify-center ect-transition-colors" :class="appliedFilters.centerStoneSizes.includes(size) ? 'ect-bg-rose-700 ect-border-rose-700' : 'ect-border-charcoal/25 group-hover:ect-border-rose-400'">
                  <svg v-if="appliedFilters.centerStoneSizes.includes(size)" class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span class="ect-font-body ect-text-sm ect-text-charcoal/80 group-hover:ect-text-charcoal ect-transition-colors">{{ formatCenterStoneSize(size) }}</span>
              </label>
            </li>
          </ul>
        </section>
      </aside>

      <!-- Main column -->
      <div ref="mainColumnRef" class="ect-flex-1 ect-min-w-0">

        <!-- Desktop count + sort bar -->
        <div v-if="sidebar && !catalogLocked" class="ect-hidden lg:ect-flex ect-items-center ect-justify-between ect-mb-6">
          <p class="ect-font-body ect-text-sm ect-text-charcoal/55">
            <template v-if="listLoading || productsLoading || !productsLoaded || !firstLoadDone">Loading pieces…</template>
            <template v-else>{{ filteredProducts.length }} {{ filteredProducts.length === 1 ? 'piece' : 'pieces' }}</template>
          </p>
          <div class="ect-relative">
            <button
              type="button"
              @click="sortOpen = !sortOpen"
              class="ect-flex ect-items-center ect-gap-2.5 ect-px-4 ect-py-2.5 ect-rounded-lg ect-border ect-border-sand ect-bg-white ect-font-body ect-text-sm ect-text-charcoal hover:ect-border-gold-400/60 ect-transition-colors"
              :aria-expanded="sortOpen"
            >
              <span>Sort: {{ sortLabel }}</span>
              <svg class="ect-w-4 ect-h-4 ect-text-charcoal/40 ect-transition-transform" :class="sortOpen ? 'ect-rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <span v-if="sortOpen" @click="sortOpen = false" class="ect-fixed ect-inset-0 ect-z-10"></span>
            <div v-if="sortOpen" class="ect-absolute ect-right-0 ect-top-full ect-mt-2 ect-w-52 ect-z-20 ect-rounded-lg ect-border ect-border-sand ect-bg-white ect-shadow-luxe-sm ect-py-1.5 ect-overflow-hidden">
              <button
                v-for="opt in SORT_OPTIONS"
                :key="opt.id"
                type="button"
                @click="selectSort(opt.id)"
                class="ect-w-full ect-text-left ect-px-4 ect-py-2 ect-font-body ect-text-sm hover:ect-bg-champagne ect-transition-colors"
                :class="sortBy === opt.id ? 'ect-text-gold-700 ect-font-semibold' : 'ect-text-charcoal/80'"
              >{{ opt.label }}</button>
            </div>
          </div>
        </div>

    <!-- Active filter chips -->
    <section v-if="activeFilterCount > 0" class="ect-flex ect-flex-wrap ect-gap-2 ect-mb-6" :class="sidebar ? 'lg:ect-hidden' : ''">
      <span v-for="cat in categoryChips" :key="cat" class="ect-inline-flex ect-items-center ect-gap-1 ect-px-3 ect-py-1 ect-rounded-full ect-bg-charcoal/10 ect-text-charcoal ect-font-body ect-text-xs ect-font-medium">
        {{ cat }}
        <button type="button" @click="toggleCategory(cat)" class="hover:ect-text-charcoal/70">×</button>
      </span>
      <span v-for="m in appliedFilters.materials" :key="m" class="ect-inline-flex ect-items-center ect-gap-1 ect-px-3 ect-py-1 ect-rounded-full ect-bg-charcoal/10 ect-text-charcoal ect-font-body ect-text-xs ect-font-medium ect-capitalize">
        {{ m }}
        <button type="button" @click="appliedFilters.materials = appliedFilters.materials.filter(v => v !== m)" class="hover:ect-text-charcoal/70">×</button>
      </span>
      <span v-for="subtype in appliedFilters.subtypes" :key="subtype" class="ect-inline-flex ect-items-center ect-gap-1 ect-px-3 ect-py-1 ect-rounded-full ect-bg-charcoal/10 ect-text-charcoal ect-font-body ect-text-xs ect-font-medium ect-capitalize">
        {{ subtype.replace('-', ' ') }}
        <button type="button" @click="appliedFilters.subtypes = appliedFilters.subtypes.filter(t => t !== subtype)" class="hover:ect-text-charcoal/70">×</button>
      </span>
      <span v-for="shape in appliedFilters.centerShapes" :key="'shape-'+shape" class="ect-inline-flex ect-items-center ect-gap-1 ect-px-3 ect-py-1 ect-rounded-full ect-bg-charcoal/10 ect-text-charcoal ect-font-body ect-text-xs ect-font-medium">
        {{ shape }}
        <button type="button" @click="toggleCenterShape(shape)" class="hover:ect-text-charcoal/70">×</button>
      </span>
      <span v-for="size in appliedFilters.centerStoneSizes" :key="'size-'+size" class="ect-inline-flex ect-items-center ect-gap-1 ect-px-3 ect-py-1 ect-rounded-full ect-bg-charcoal/10 ect-text-charcoal ect-font-body ect-text-xs ect-font-medium">
        {{ formatCenterStoneSize(size) }}
        <button type="button" @click="appliedFilters.centerStoneSizes = appliedFilters.centerStoneSizes.filter(s => s !== size)" class="hover:ect-text-charcoal/70">×</button>
      </span>
    </section>

    <!-- Product skeleton -->
    <ul v-if="!firstLoadDone" class="ect-grid ect-grid-cols-2 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0" :class="sidebar ? 'lg:ect-grid-cols-3' : 'lg:ect-grid-cols-4'">
      <li v-for="n in 8" :key="`skeleton-${n}`" class="ect-animate-pulse">
        <section class="ect-aspect-square ect-rounded-2xl ect-bg-champagne ect-mb-3" />
        <section class="ect-h-4 ect-w-3/4 ect-rounded ect-bg-sand ect-mb-2" />
        <section class="ect-h-3 ect-w-1/3 ect-rounded ect-bg-sand" />
      </li>
    </ul>

    <!-- Product grid -->
    <ul v-else-if="displayedProducts.length" :aria-busy="listLoading" class="ect-grid ect-grid-cols-2 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0 ect-transition-opacity ect-duration-150" :class="[sidebar ? 'lg:ect-grid-cols-3' : 'lg:ect-grid-cols-4', listLoading ? 'ect-opacity-55 ect-pointer-events-none' : '']">
      <li v-for="piece in displayedProducts" :key="piece.slug" class="ect-h-full">
        <ProductCard :slug="piece.slug" :title="piece.title" :category="piece.category" :material="piece.material" :price="piece.price" :images="piece.images" :product="piece" />
      </li>
    </ul>

    <!-- Guest catalogue gate -->
    <section
      v-if="catalogLocked && hiddenProductCount > 0"
      class="ect-relative ect-mt-10 ect-overflow-hidden ect-rounded-2xl ect-border ect-border-gold-200 ect-bg-gradient-to-br ect-from-white ect-via-champagne/60 ect-to-gold-50 ect-px-5 ect-py-9 sm:ect-px-10 sm:ect-py-11 ect-text-center"
    >
      <span class="ect-mx-auto ect-mb-4 ect-flex ect-h-12 ect-w-12 ect-items-center ect-justify-center ect-rounded-full ect-bg-white ect-text-gold-700 ect-shadow-sm" aria-hidden="true">
        <svg class="ect-h-5 ect-w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 0h10.5A2.25 2.25 0 0119.5 12.75v6A2.25 2.25 0 0117.25 21H6.75a2.25 2.25 0 01-2.25-2.25v-6a2.25 2.25 0 012.25-2.25z" />
        </svg>
      </span>
      <p class="ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.2em] ect-text-gold-700">Members-only catalogue</p>
      <h3 class="ect-mt-2 ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-text-charcoal">Unlock more designs</h3>
      <p class="ect-mx-auto ect-mt-2 ect-max-w-lg ect-font-body ect-text-sm sm:ect-text-base ect-leading-relaxed ect-text-charcoal/60">Sign in or create a free account to view the complete collection.</p>
      <div class="ect-mt-6 ect-flex ect-flex-col sm:ect-flex-row ect-items-center ect-justify-center ect-gap-3">
        <RouterLink :to="{ name: 'login', query: authRedirectQuery }" class="ect-inline-flex ect-w-full sm:ect-w-auto ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-7 ect-py-3 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors">Sign in to view all</RouterLink>
        <RouterLink :to="{ name: 'signup', query: authRedirectQuery }" class="ect-inline-flex ect-w-full sm:ect-w-auto ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/20 ect-bg-white ect-px-7 ect-py-3 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal hover:ect-border-gold-400 ect-transition-colors">Create free account</RouterLink>
      </div>
    </section>

    <!-- Empty state -->
    <section v-if="!listLoading && firstLoadDone && !displayedProducts.length" class="ect-flex ect-flex-col ect-items-center ect-py-24 ect-text-center">
      <span class="ect-w-16 ect-h-16 ect-rounded-full ect-bg-champagne ect-flex ect-items-center ect-justify-center ect-mb-4">
        <svg class="ect-w-7 ect-h-7 ect-text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
        </svg>
      </span>
      <p class="ect-font-display ect-text-lg ect-font-light ect-text-charcoal ect-mb-1">No pieces match your filters</p>
      <p class="ect-font-body ect-text-sm ect-text-charcoal/50 ect-mb-5">Try adjusting or clearing your filters to see more.</p>
      <button
        type="button"
        @click="appliedFilters = { categories: [...lockedCategories], materials: [], colors: [], subtypes: [], centerShapes: [], centerStoneSizes: [] }"
        class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-5 ect-py-2.5 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold hover:ect-bg-noir ect-transition-colors"
      >
        Clear all filters
      </button>
    </section>

      </div>
    </div>
  </section>

  <FilterModal
    v-if="!catalogLocked"
    v-model="filterOpen"
    :initial="appliedFilters"
    :products="products"
    :locked-categories="lockedCategories"
    @apply="applyModalFilters"
  />
</template>

<style scoped>
.ect-no-scrollbar::-webkit-scrollbar { display: none; }
.ect-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

</style>
