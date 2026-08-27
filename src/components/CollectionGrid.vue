<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import ProductCard from './ProductCard.vue'
import FilterModal from './FilterModal.vue'
import { CATALOG_CATEGORIES, CENTER_SHAPE_OPTIONS, centerStoneSizesForShapes, formatCenterStoneSize, productHasCenterShape, productHasCenterStoneSize, type Category, type Material, type Color, type ProductSubtype } from '../data/products'
import {
  DEFAULT_FACETS,
  FACET_HEADINGS,
  formatPrice,
  metalLabel,
  metalOptionsFor,
  pieceTypeLabel,
  pieceTypeOptionsFor,
  priceBoundsFor,
  productHasMetal,
  productHasPieceType,
  productHasStone,
  productPriceValue,
  stoneLabel,
  stoneOptionsFor,
  type FacetId,
  type FacetOption,
  type MetalId,
  type PieceTypeId,
  type StoneId,
} from '../data/filters'
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
  metals: MetalId[]
  stones: StoneId[]
  types: PieceTypeId[]
  /** Null means "still at the slider's end", so no bound is sent for it. */
  priceMin: number | null
  priceMax: number | null
}

/** Cleared filters, scoped to whatever categories the page locks. */
function emptyFilters(categories: readonly Category[] = []): Filters {
  return {
    categories: [...categories],
    materials: [],
    colors: [],
    subtypes: [],
    centerShapes: [],
    centerStoneSizes: [],
    metals: [],
    stones: [],
    types: [],
    priceMin: null,
    priceMax: null,
  }
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
const appliedFilters = ref<Filters>(emptyFilters())
// Which facets this collection offers. Set from the preset so the filter list is
// a merchandising edit in src/data/collections.ts, not a change in here.
// Facet list, options and order all come from the collection preset, so the
// Earrings rail can lead on Stone over 24 of them while Bracelets & Bangles
// leads on Metal over five.
const facets = ref<FacetId[]>([...DEFAULT_FACETS])
const metalOptions = ref(metalOptionsFor())
const stoneOptions = ref(stoneOptionsFor())
const typeOptions = ref(pieceTypeOptionsFor())

// The price slider's ends come from the pieces actually in scope, so a
// collection page opens on its own catalogue's span rather than the whole
// site's. Null bounds (nothing in scope is priced) hide the facet.
const scopedProducts = computed(() => {
  const locked = lockedCategories.value
  const list = products.value
  return locked.length ? list.filter((p) => locked.includes(p.category as Category)) : list
})
const priceBounds = computed(() => priceBoundsFor(scopedProducts.value))

/** The checkbox facets, and the options each offers on this page. */
const CHECKBOX_FACETS: FacetId[] = ['metal', 'stone', 'type', 'category', 'material', 'stone-shape']

function facetOptions(facet: FacetId): FacetOption[] {
  switch (facet) {
    case 'metal': return metalOptions.value
    case 'stone': return stoneOptions.value
    case 'type': return typeOptions.value
    case 'category': return categoryOptions.value.map((cat) => ({ id: cat, label: cat }))
    case 'material': return materialOptions.map((m) => ({ id: m.id, label: m.label }))
    case 'stone-shape': return CENTER_SHAPE_OPTIONS.map((shape) => ({ id: shape, label: shape }))
    default: return []
  }
}

function facetSelected(facet: FacetId): string[] {
  const f = appliedFilters.value
  switch (facet) {
    case 'metal': return f.metals
    case 'stone': return f.stones
    case 'type': return f.types
    case 'category': return f.categories
    case 'material': return f.materials
    case 'stone-shape': return f.centerShapes
    default: return []
  }
}

function toggleFacet(facet: FacetId, id: string) {
  switch (facet) {
    case 'metal': return toggleMetal(id as MetalId)
    case 'stone': return toggleStone(id as StoneId)
    case 'type': return toggleType(id as PieceTypeId)
    case 'category': return toggleCategory(id as Category)
    case 'material': return toggleMaterial(id as Material)
    case 'stone-shape': return toggleCenterShape(id)
  }
}

/**
 * Is this facet actually drawn? A facet can drop out beyond the page's own list
 * — Category on a single-category page (the title already says it), Price with
 * nothing priced in scope, any checkbox facet with no options — and one that
 * isn't drawn must not count as one, or the rule that separates sections opens
 * the rail with nothing above it.
 */
const showFacet = (facet: FacetId) => {
  if (!facets.value.includes(facet)) return false
  if (facet === 'category' && singleLockedCategory.value) return false
  if (facet === 'price') return Boolean(priceBounds.value)
  if (CHECKBOX_FACETS.includes(facet)) return facetOptions(facet).length > 0
  return true
}
// Preset order, not a fixed one: Earrings wants Stone before Metal.
const visibleFacets = computed(() => facets.value.filter(showFacet))
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
  const locked = presetCategories(p)
  const f = emptyFilters(locked)
  if (p.material) f.materials = [p.material]
  if (p.color) f.colors = [p.color]
  if (p.subtypes !== undefined) f.subtypes = p.subtypes
  if (p.types !== undefined) f.types = [...p.types]
  appliedFilters.value = f
  lockedCategories.value = locked
  facets.value = p.facets?.length ? [...p.facets] : [...DEFAULT_FACETS]
  metalOptions.value = metalOptionsFor(p.metalOptions)
  stoneOptions.value = stoneOptionsFor(p.stoneOptions)
  typeOptions.value = pieceTypeOptionsFor(p.typeOptions)
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
  toggleIn(appliedFilters.value.materials, m)
}

/** Add-or-remove for the single-axis facets, which all behave identically. */
function toggleIn<T>(list: T[], value: T) {
  const i = list.indexOf(value)
  if (i === -1) list.push(value)
  else list.splice(i, 1)
  scrollToResultsTop()
}

function toggleMetal(id: MetalId) {
  toggleIn(appliedFilters.value.metals, id)
}

function toggleStone(id: StoneId) {
  toggleIn(appliedFilters.value.stones, id)
}

function toggleType(id: PieceTypeId) {
  toggleIn(appliedFilters.value.types, id)
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

// --- Price facet ---
const priceFloor = computed(() => priceBounds.value?.min ?? 0)
const priceCeil = computed(() => priceBounds.value?.max ?? 0)
// ~200 stops across the span, so dragging feels smooth on a $500k range and
// still lands on round-ish dollars on a narrow one.
const priceStep = computed(() => Math.max(1, Math.round((priceCeil.value - priceFloor.value) / 200)))
// A whole number of steps rarely lands exactly on the dearest piece, and a max
// thumb that can't reach the top would quietly hold that piece out of an
// otherwise-cleared filter. The input's ceiling is therefore rounded up to the
// next stop; the value it reports is still clamped to the real maximum, so the
// top stop reads as "no upper bound".
const priceSliderMax = computed(() => {
  const span = priceCeil.value - priceFloor.value
  if (span <= 0) return priceCeil.value
  return priceFloor.value + Math.ceil(span / priceStep.value) * priceStep.value
})
const priceSpan = computed(() => Math.max(1, priceSliderMax.value - priceFloor.value))

// Thumb positions while dragging. Committing on release keeps one drag from
// firing a request per pixel, while the labels still track the thumb live.
const priceDraft = ref<{ low: number; high: number } | null>(null)
const priceLow = computed(() => priceDraft.value?.low ?? appliedFilters.value.priceMin ?? priceFloor.value)
const priceHigh = computed(() => priceDraft.value?.high ?? appliedFilters.value.priceMax ?? priceCeil.value)
const priceNarrowed = computed(
  () => appliedFilters.value.priceMin != null || appliedFilters.value.priceMax != null,
)

function dragPrice(edge: 'low' | 'high', value: number) {
  const next = { low: priceLow.value, high: priceHigh.value }
  if (edge === 'low') next.low = Math.max(priceFloor.value, Math.min(value, next.high))
  else next.high = Math.min(priceCeil.value, Math.max(value, next.low))
  priceDraft.value = next
}

function commitPrice() {
  const draft = priceDraft.value
  priceDraft.value = null
  if (!draft) return
  // A thumb parked at its end is "no bound", so the filter stays inactive and
  // pieces the price query can't resolve are not silently dropped.
  appliedFilters.value.priceMin = draft.low <= priceFloor.value ? null : draft.low
  appliedFilters.value.priceMax = draft.high >= priceCeil.value ? null : draft.high
}

function clearPrice() {
  priceDraft.value = null
  appliedFilters.value.priceMin = null
  appliedFilters.value.priceMax = null
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
    metals: [...f.metals],
    stones: [...f.stones],
    types: [...f.types],
    priceMin: f.priceMin,
    priceMax: f.priceMax,
  }
}

/**
 * The facets the API doesn't express. Multi-select is OR within a facet and AND
 * across them, so "18K White Gold or Platinum" widens while adding a Stone
 * narrows — which is what the checkboxes look like they do.
 */
function applyClientFacets(list: any[], f: Filters): any[] {
  let out = Array.isArray(list) ? list : []
  if (f.subtypes?.length) out = out.filter((p) => f.subtypes.includes(p.subtype))
  if (f.centerShapes?.length) {
    out = out.filter((p) => f.centerShapes.some((shape) => productHasCenterShape(p.customizationOptions?.centerShapes, shape)))
  }
  if (f.centerStoneSizes?.length) {
    out = out.filter((p) => f.centerStoneSizes.some((size) => productHasCenterStoneSize(p.customizationOptions?.centerStoneSizes, size)))
  }
  if (f.metals.length) out = out.filter((p) => f.metals.some((id) => productHasMetal(p, id)))
  if (f.stones.length) out = out.filter((p) => f.stones.some((id) => productHasStone(p, id)))
  if (f.types.length) out = out.filter((p) => f.types.some((id) => productHasPieceType(p, id)))
  return out
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
    const list = applyClientFacets(Array.isArray(data?.products) ? data.products : [], filters)
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
    if (f.priceMin != null) list = list.filter((p) => productPriceValue(p) >= (f.priceMin as number))
    if (f.priceMax != null) list = list.filter((p) => productPriceValue(p) <= (f.priceMax as number))
    if (requestId === filterRequestId) filteredProducts.value = applyClientFacets(list, f)
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

interface FilterChip {
  key: string
  label: string
  /** The facet that already shows this selection, or null if none does. */
  facet: FacetId | null
  remove: () => void
}

/**
 * Every applied filter as a removable chip.
 *
 * Colour and subtype have no control anywhere — they arrive from a collection
 * preset or a mega-menu deep link (`?metal=yellow`, `?style=stud`) — so they
 * carry no facet, and the desktop rail shows them for exactly that reason: a
 * filter the shopper can't see is one they can't undo.
 */
const filterChips = computed<FilterChip[]>(() => {
  const f = appliedFilters.value
  const chips: FilterChip[] = []
  categoryChips.value.forEach((cat) =>
    chips.push({ key: `cat-${cat}`, label: cat, facet: 'category', remove: () => toggleCategory(cat) }),
  )
  f.materials.forEach((m) =>
    chips.push({ key: `mat-${m}`, label: m.charAt(0).toUpperCase() + m.slice(1), facet: 'material', remove: () => toggleMaterial(m) }),
  )
  f.colors.forEach((c) =>
    chips.push({
      key: `color-${c}`,
      label: c.charAt(0).toUpperCase() + c.slice(1),
      facet: null,
      remove: () => { appliedFilters.value.colors = f.colors.filter((v) => v !== c) },
    }),
  )
  f.subtypes.forEach((t) =>
    chips.push({
      key: `subtype-${t}`,
      label: t.replace(/-/g, ' ').replace(/^./, (ch) => ch.toUpperCase()),
      facet: null,
      remove: () => { appliedFilters.value.subtypes = f.subtypes.filter((v) => v !== t) },
    }),
  )
  f.metals.forEach((id) =>
    chips.push({ key: `metal-${id}`, label: metalLabel(id), facet: 'metal', remove: () => toggleMetal(id) }),
  )
  f.stones.forEach((id) =>
    chips.push({ key: `stone-${id}`, label: stoneLabel(id), facet: 'stone', remove: () => toggleStone(id) }),
  )
  f.types.forEach((id) =>
    chips.push({ key: `type-${id}`, label: pieceTypeLabel(id), facet: 'type', remove: () => toggleType(id) }),
  )
  f.centerShapes.forEach((shape) =>
    chips.push({ key: `shape-${shape}`, label: shape, facet: 'stone-shape', remove: () => toggleCenterShape(shape) }),
  )
  f.centerStoneSizes.forEach((size) =>
    chips.push({ key: `size-${size}`, label: formatCenterStoneSize(size), facet: 'stone-size', remove: () => toggleCenterStoneSize(size) }),
  )
  if (priceNarrowed.value) {
    chips.push({
      key: 'price',
      label: `${formatPrice(priceLow.value)} – ${formatPrice(priceHigh.value)}`,
      facet: 'price',
      remove: clearPrice,
    })
  }
  return chips
})

/** Chips the sidebar's own controls don't already show, for the desktop rail. */
const unshownChips = computed(() =>
  filterChips.value.filter((chip) => chip.facet === null || !facets.value.includes(chip.facet)),
)

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
  if (f.metals.length) count++
  if (f.stones.length) count++
  if (f.types.length) count++
  if (priceNarrowed.value) count++
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
        <!-- One ordered pass: the preset decides which facets appear and in
             what order, and the rule that separates them sits above each
             section but the first. -->
        <template v-for="(facet, index) in visibleFacets" :key="facet">
          <hr v-if="index > 0" class="ect-border-sand ect-mb-6" />

          <!-- Price -->
          <section v-if="facet === 'price'" class="ect-mb-6">
            <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-gold-700 ect-mb-3.5">{{ FACET_HEADINGS.price }}</h3>
            <p class="ect-font-body ect-text-sm ect-text-charcoal/80 ect-mb-3">{{ formatPrice(priceLow) }} <span class="ect-text-charcoal/35">–</span> {{ formatPrice(priceHigh) }}</p>
            <div class="price-range">
              <span class="price-track" aria-hidden="true" />
              <span
                class="price-fill"
                aria-hidden="true"
                :style="{
                  left: `${((priceLow - priceFloor) / priceSpan) * 100}%`,
                  right: `${100 - ((priceHigh - priceFloor) / priceSpan) * 100}%`,
                }"
              />
              <input
                type="range"
                class="price-thumb"
                aria-label="Minimum price"
                :min="priceFloor"
                :max="priceSliderMax"
                :step="priceStep"
                :value="priceLow"
                @input="dragPrice('low', Number(($event.target as HTMLInputElement).value))"
                @change="commitPrice()"
              />
              <input
                type="range"
                class="price-thumb"
                aria-label="Maximum price"
                :min="priceFloor"
                :max="priceSliderMax"
                :step="priceStep"
                :value="priceHigh"
                @input="dragPrice('high', Number(($event.target as HTMLInputElement).value))"
                @change="commitPrice()"
              />
            </div>
            <button
              v-if="priceNarrowed"
              type="button"
              @click="clearPrice()"
              class="ect-mt-3 ect-font-body ect-text-xs ect-font-medium ect-text-gold-700 hover:ect-text-gold-800 ect-underline ect-underline-offset-2 ect-transition-colors"
            >Reset price</button>
          </section>

          <!-- Metal, Stone, Type, Category, Material, Stone Shape: one
               checkbox list, options and order per the preset. -->
          <section v-else-if="CHECKBOX_FACETS.includes(facet)" class="ect-mb-6">
            <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-gold-700 ect-mb-3.5">{{ FACET_HEADINGS[facet] }}</h3>
            <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
              <li v-for="option in facetOptions(facet)" :key="option.id">
                <label class="ect-flex ect-items-center ect-gap-2.5 ect-cursor-pointer ect-group">
                  <input type="checkbox" class="ect-sr-only" :checked="facetSelected(facet).includes(option.id)" @change="toggleFacet(facet, option.id)" />
                  <span class="ect-w-[18px] ect-h-[18px] ect-shrink-0 ect-rounded ect-border ect-flex ect-items-center ect-justify-center ect-transition-colors" :class="facetSelected(facet).includes(option.id) ? 'ect-bg-rose-700 ect-border-rose-700' : 'ect-border-charcoal/25 group-hover:ect-border-rose-400'">
                    <svg v-if="facetSelected(facet).includes(option.id)" class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/80 group-hover:ect-text-charcoal ect-transition-colors">{{ option.label }}</span>
                </label>
              </li>
            </ul>
          </section>

          <!-- Stone Size is faceted by the chosen shape, so it stands apart. -->
          <section v-else-if="facet === 'stone-size'" class="ect-mb-6">
            <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-gold-700 ect-mb-3.5">{{ FACET_HEADINGS['stone-size'] }}</h3>
            <p v-if="!appliedFilters.centerShapes.length" class="ect-font-body ect-text-sm ect-leading-5 ect-text-charcoal/45">Select a stone shape to see available sizes.</p>
            <ul v-else class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
              <li v-for="size in availableSidebarCenterStoneSizes" :key="size">
                <label class="ect-flex ect-items-center ect-gap-2.5 ect-cursor-pointer ect-group">
                  <input type="checkbox" class="ect-sr-only" :checked="appliedFilters.centerStoneSizes.includes(size)" @change="toggleCenterStoneSize(size)" />
                  <span class="ect-w-[18px] ect-h-[18px] ect-shrink-0 ect-rounded ect-border ect-flex ect-items-center ect-justify-center ect-transition-colors" :class="appliedFilters.centerStoneSizes.includes(size) ? 'ect-bg-rose-700 ect-border-rose-700' : 'ect-border-charcoal/25 group-hover:ect-border-rose-400'">
                    <svg v-if="appliedFilters.centerStoneSizes.includes(size)" class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/80 group-hover:ect-text-charcoal ect-transition-colors">{{ formatCenterStoneSize(size) }}</span>
                </label>
              </li>
            </ul>
          </section>
        </template>
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

    <!-- Active filter chips. With a sidebar the desktop rail carries only what
         no visible facet shows — a colour or subtype from a mega-menu deep
         link — since the checkboxes already stand for the rest. -->
    <section v-if="filterChips.length" class="ect-flex ect-flex-wrap ect-gap-2 ect-mb-6" :class="sidebar ? 'lg:ect-hidden' : ''">
      <span v-for="chip in filterChips" :key="chip.key" class="ect-inline-flex ect-items-center ect-gap-1 ect-px-3 ect-py-1 ect-rounded-full ect-bg-charcoal/10 ect-text-charcoal ect-font-body ect-text-xs ect-font-medium">
        {{ chip.label }}
        <button type="button" @click="chip.remove()" class="hover:ect-text-charcoal/70" :aria-label="`Remove ${chip.label} filter`">×</button>
      </span>
    </section>
    <section v-if="sidebar && unshownChips.length" class="ect-hidden lg:ect-flex ect-flex-wrap ect-gap-2 ect-mb-6">
      <span v-for="chip in unshownChips" :key="chip.key" class="ect-inline-flex ect-items-center ect-gap-1 ect-px-3 ect-py-1 ect-rounded-full ect-bg-charcoal/10 ect-text-charcoal ect-font-body ect-text-xs ect-font-medium">
        {{ chip.label }}
        <button type="button" @click="chip.remove()" class="hover:ect-text-charcoal/70" :aria-label="`Remove ${chip.label} filter`">×</button>
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
        @click="appliedFilters = emptyFilters(lockedCategories)"
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
    :facets="facets"
    :metal-options="metalOptions.map((o) => o.id)"
    :stone-options="stoneOptions.map((o) => o.id)"
    :type-options="typeOptions.map((o) => o.id)"
    :price-bounds="priceBounds"
    @apply="applyModalFilters"
  />
</template>

<style scoped>
.ect-no-scrollbar::-webkit-scrollbar { display: none; }
.ect-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Two range inputs stacked on one track. The inputs are transparent and let
   pointer events through except on their thumbs, so either end stays grabbable
   even when both sit at the same value. */
.price-range { position: relative; height: 20px; }
.price-track,
.price-fill {
  position: absolute;
  top: 50%;
  height: 3px;
  border-radius: 999px;
  transform: translateY(-50%);
}
.price-track { left: 0; right: 0; background: #ebe7e2; }
.price-fill { background: #a33d4f; }
.price-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  background: none;
  appearance: none;
  -webkit-appearance: none;
  pointer-events: none;
}
.price-thumb:focus { outline: none; }
.price-thumb::-webkit-slider-runnable-track { height: 20px; background: none; }
.price-thumb::-moz-range-track { height: 20px; background: none; }
.price-thumb::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid #a33d4f;
  background: #fff;
  box-shadow: 0 1px 3px rgba(27, 25, 23, 0.25);
  cursor: pointer;
}
.price-thumb::-moz-range-thumb {
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid #a33d4f;
  background: #fff;
  box-shadow: 0 1px 3px rgba(27, 25, 23, 0.25);
  cursor: pointer;
}
.price-thumb:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(163, 61, 79, 0.25); }
.price-thumb:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px rgba(163, 61, 79, 0.25); }
</style>
