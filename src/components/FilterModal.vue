<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { CATALOG_CATEGORIES, CENTER_SHAPE_OPTIONS, centerStoneSizesForShapes, formatCenterStoneSize, productHasCenterShape, productHasCenterStoneSize, type Category, type Material, type Color } from '../data/products'
import {
  BANGLE_BRACELET_TYPE_OPTIONS,
  DEFAULT_FACETS,
  FACET_ORDER,
  METAL_OPTIONS,
  STONE_OPTIONS,
  bangleBraceletTypeLabel,
  formatPrice,
  metalLabel,
  productHasBangleBraceletType,
  productHasMetal,
  productHasStone,
  productPriceValue,
  stoneLabel,
  type BangleBraceletTypeId,
  type FacetId,
  type MetalId,
  type PriceBounds,
  type StoneId,
} from '../data/filters'

interface Filters {
  categories: Category[]
  materials: Material[]
  colors: Color[]
  centerShapes: string[]
  centerStoneSizes: string[]
  metals: MetalId[]
  stones: StoneId[]
  types: BangleBraceletTypeId[]
  priceMin: number | null
  priceMax: number | null
}

const props = defineProps<{
  modelValue: boolean
  initial: Filters
  products?: any[]
  // Categories the page is scoped to. One (e.g. the Rings collection) hides the
  // Category section and is always kept. Two or more (Bracelets & Bangles) keeps
  // the section but offers only those, so the shopper narrows without escaping
  // the page's scope.
  lockedCategories?: Category[]
  /** The facets this collection offers; the panel mirrors the desktop sidebar. */
  facets?: FacetId[]
  /** Price slider ends, already scoped to the page's categories by the grid. */
  priceBounds?: PriceBounds | null
}>()

const facets = computed<FacetId[]>(() => (props.facets?.length ? props.facets : DEFAULT_FACETS))

const lockedCategories = computed<Category[]>(() => props.lockedCategories ?? [])
const singleLockedCategory = computed<Category | null>(() =>
  lockedCategories.value.length === 1 ? lockedCategories.value[0] ?? null : null,
)
const categoryOptions = computed<Category[]>(() =>
  lockedCategories.value.length > 1 ? lockedCategories.value : CATALOG_CATEGORIES,
)

// Same rule placement as the desktop rail in CollectionGrid.vue: one rule above
// each section and none above the first, so a facet that isn't drawn — Category
// on a single-category page, Price with nothing priced in scope — must not count
// as one.
const showFacet = (facet: FacetId) => {
  if (!facets.value.includes(facet)) return false
  if (facet === 'category') return !singleLockedCategory.value
  if (facet === 'price') return Boolean(props.priceBounds)
  return true
}
const visibleFacets = computed(() => FACET_ORDER.filter(showFacet))
const isFirstFacet = (facet: FacetId) => visibleFacets.value[0] === facet

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'apply', filters: Filters): void
}>()

function cloneFilters(source: Filters): Filters {
  return {
    ...source,
    categories: [...(source.categories || [])],
    materials: [...(source.materials || [])],
    colors: [...(source.colors || [])],
    centerShapes: [...(source.centerShapes || [])],
    centerStoneSizes: [...(source.centerStoneSizes || [])],
    metals: [...(source.metals || [])],
    stones: [...(source.stones || [])],
    types: [...(source.types || [])],
    priceMin: source.priceMin ?? null,
    priceMax: source.priceMax ?? null,
  }
}

const local = ref<Filters>(cloneFilters(props.initial))

watch(() => props.modelValue, (open) => {
  if (open) local.value = cloneFilters(props.initial)
})

const activeCount = computed(() => {
  let count = 0
  if (lockedCategories.value.length > 1) {
    if (local.value.categories.length < lockedCategories.value.length) count++
  } else if (!singleLockedCategory.value && local.value.categories.length) count++
  if (local.value.materials.length) count++
  if (local.value.centerShapes.length) count++
  if (local.value.centerStoneSizes.length) count++
  if (local.value.metals.length) count++
  if (local.value.stones.length) count++
  if (local.value.types.length) count++
  if (priceNarrowed.value) count++
  return count
})

/**
 * Does a piece survive the current selection, optionally ignoring one facet?
 * `previewCount` passes nothing; the per-pill counts pass their own facet, so
 * each pill shows the tally it would yield if it were the one chosen.
 */
function matches(p: any, exclude: string = '') {
  const f = local.value
  if (exclude !== 'category' && f.categories.length && !f.categories.includes(p.category)) return false
  if (exclude !== 'material' && f.materials.length && !f.materials.includes(p.material)) return false
  if (exclude !== 'color' && f.colors.length && !f.colors.includes(p.color)) return false
  if (exclude !== 'shape' && f.centerShapes.length && !f.centerShapes.some((s) => productHasCenterShape(p.customizationOptions?.centerShapes, s))) return false
  if (exclude !== 'size' && f.centerStoneSizes.length && !f.centerStoneSizes.some((s) => productHasCenterStoneSize(p.customizationOptions?.centerStoneSizes, s))) return false
  if (exclude !== 'metal' && f.metals.length && !f.metals.some((id) => productHasMetal(p, id))) return false
  if (exclude !== 'stone' && f.stones.length && !f.stones.some((id) => productHasStone(p, id))) return false
  if (exclude !== 'type' && f.types.length && !f.types.some((id) => productHasBangleBraceletType(p, id))) return false
  if (exclude !== 'price') {
    const value = productPriceValue(p)
    if (f.priceMin != null && value < f.priceMin) return false
    if (f.priceMax != null && value > f.priceMax) return false
  }
  return true
}

// Live preview of how many pieces match the current (unapplied) selection.
const previewCount = computed(() => {
  const list = props.products
  if (!Array.isArray(list) || !list.length) return null
  return list.filter((p) => matches(p)).length
})

// --- Price facet. Bounds come from the grid, already scoped to the page. ---
const priceFloor = computed(() => props.priceBounds?.min ?? 0)
const priceCeil = computed(() => props.priceBounds?.max ?? 0)
const priceStep = computed(() => Math.max(1, Math.round((priceCeil.value - priceFloor.value) / 200)))
// See the note on priceSliderMax in CollectionGrid.vue: the input's ceiling is
// rounded up to the next stop so the max thumb can always reach "no upper
// bound", while the value it reports stays clamped to the real maximum.
const priceSliderMax = computed(() => {
  const span = priceCeil.value - priceFloor.value
  if (span <= 0) return priceCeil.value
  return priceFloor.value + Math.ceil(span / priceStep.value) * priceStep.value
})
const priceSpan = computed(() => Math.max(1, priceSliderMax.value - priceFloor.value))
const priceLow = computed(() => local.value.priceMin ?? priceFloor.value)
const priceHigh = computed(() => local.value.priceMax ?? priceCeil.value)
const priceNarrowed = computed(() => local.value.priceMin != null || local.value.priceMax != null)

// Nothing refetches until Apply, so the panel can write straight through — no
// need for the grid's commit-on-release dance.
function dragPrice(edge: 'low' | 'high', value: number) {
  if (edge === 'low') {
    const low = Math.max(priceFloor.value, Math.min(value, priceHigh.value))
    local.value.priceMin = low <= priceFloor.value ? null : low
  } else {
    const high = Math.min(priceCeil.value, Math.max(value, priceLow.value))
    local.value.priceMax = high >= priceCeil.value ? null : high
  }
}

function clearPrice() {
  local.value.priceMin = null
  local.value.priceMax = null
}

function toggleCategory(cat: Category) {
  const idx = local.value.categories.indexOf(cat)
  if (idx === -1) local.value.categories.push(cat)
  else local.value.categories.splice(idx, 1)
  // On a multi-category page an empty selection would mean "no category filter"
  // and leak the whole catalogue in, so clearing the last one falls back to the
  // page's full scope instead.
  if (lockedCategories.value.length > 1 && !local.value.categories.length) {
    local.value.categories = [...lockedCategories.value]
  }
}

function toggleMaterial(m: Material) {
  const idx = local.value.materials.indexOf(m)
  if (idx === -1) local.value.materials.push(m)
  else local.value.materials.splice(idx, 1)
}

function toggleCenterShape(s: string) {
  const idx = local.value.centerShapes.indexOf(s)
  if (idx === -1) {
    local.value.centerShapes.push(s)
    // Size counts are faceted by the selected shape. Reveal the next facet so
    // shoppers can immediately see which stone sizes are available.
    stoneSizeOpen.value = true
  } else {
    local.value.centerShapes.splice(idx, 1)
  }
  const availableSizes = new Set(centerStoneSizesForShapes(local.value.centerShapes))
  local.value.centerStoneSizes = local.value.centerStoneSizes.filter((size) => availableSizes.has(size))
}

function toggleCenterStoneSize(s: string) {
  const idx = local.value.centerStoneSizes.indexOf(s)
  if (idx === -1) local.value.centerStoneSizes.push(s)
  else local.value.centerStoneSizes.splice(idx, 1)
}

function toggleIn<T>(list: T[], value: T) {
  const idx = list.indexOf(value)
  if (idx === -1) list.push(value)
  else list.splice(idx, 1)
}

function toggleMetal(id: MetalId) {
  toggleIn(local.value.metals, id)
}

function toggleStone(id: StoneId) {
  toggleIn(local.value.stones, id)
}

function toggleType(id: BangleBraceletTypeId) {
  toggleIn(local.value.types, id)
}

function countFor(facet: string, predicate: (p: any) => boolean) {
  const list = props.products
  if (!Array.isArray(list)) return 0
  return list.filter((p) => matches(p, facet) && predicate(p)).length
}

const categoryCount = (cat: Category) => countFor('category', (p) => p.category === cat)
const materialCount = (m: Material) => countFor('material', (p) => p.material === m)
const shapeCount = (s: string) => countFor('shape', (p) => productHasCenterShape(p.customizationOptions?.centerShapes, s))
const sizeCount = (s: string) => countFor('size', (p) => productHasCenterStoneSize(p.customizationOptions?.centerStoneSizes, s))
const metalCount = (id: MetalId) => countFor('metal', (p) => productHasMetal(p, id))
const stoneCount = (id: StoneId) => countFor('stone', (p) => productHasStone(p, id))
const typeCount = (id: BangleBraceletTypeId) => countFor('type', (p) => productHasBangleBraceletType(p, id))
const availableCenterStoneSizes = computed(() => centerStoneSizesForShapes(local.value.centerShapes))

// Applied selections rendered as removable chips at the top of the panel.
const activeChips = computed(() => {
  const chips: { key: string; label: string; remove: () => void }[] = []
  local.value.materials.forEach((m) => chips.push({ key: `mat-${m}`, label: m.charAt(0).toUpperCase() + m.slice(1), remove: () => toggleMaterial(m) }))
  // A single locked category is page context, not a shopper choice; on a
  // multi-category page so is the full locked set, so chips appear only once
  // the shopper has narrowed to a subset of it.
  const locked = lockedCategories.value
  const chosen =
    locked.length > 1
      ? local.value.categories.length < locked.length
        ? local.value.categories
        : []
      : local.value.categories.filter((c) => c !== singleLockedCategory.value)
  chosen.forEach((c) => chips.push({ key: `cat-${c}`, label: c, remove: () => toggleCategory(c) }))
  local.value.metals.forEach((id) => chips.push({ key: `metal-${id}`, label: metalLabel(id), remove: () => toggleMetal(id) }))
  local.value.stones.forEach((id) => chips.push({ key: `stone-${id}`, label: stoneLabel(id), remove: () => toggleStone(id) }))
  local.value.types.forEach((id) => chips.push({ key: `type-${id}`, label: bangleBraceletTypeLabel(id), remove: () => toggleType(id) }))
  local.value.centerShapes.forEach((s) => chips.push({ key: `shape-${s}`, label: s, remove: () => toggleCenterShape(s) }))
  local.value.centerStoneSizes.forEach((s) => chips.push({ key: `size-${s}`, label: formatCenterStoneSize(s), remove: () => toggleCenterStoneSize(s) }))
  if (priceNarrowed.value) {
    chips.push({ key: 'price', label: `${formatPrice(priceLow.value)} – ${formatPrice(priceHigh.value)}`, remove: clearPrice })
  }
  return chips
})

function clear() {
  local.value = {
    categories: [...lockedCategories.value],
    materials: [],
    colors: [],
    centerShapes: [],
    centerStoneSizes: [],
    metals: [],
    stones: [],
    types: [],
    priceMin: null,
    priceMax: null,
  }
}

// Collapsible sections (header toggles content visibility).
const stoneShapeOpen = ref(false)
const stoneSizeOpen = ref(false)

function apply() {
  emit('apply', cloneFilters(local.value))
  emit('update:modelValue', false)
}

function close() {
  emit('update:modelValue', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

</script>

<template>
  <Transition
    enter-active-class="ect-transition ect-duration-200 ect-ease-out"
    enter-from-class="ect-opacity-0"
    enter-to-class="ect-opacity-100"
    leave-active-class="ect-transition ect-duration-150 ect-ease-in"
    leave-from-class="ect-opacity-100"
    leave-to-class="ect-opacity-0"
  >
    <section v-if="modelValue" class="ect-fixed ect-inset-0 ect-z-50 ect-flex ect-items-stretch ect-justify-start" role="dialog" aria-modal="true" aria-label="Filters">
      <!-- Backdrop -->
      <span class="ect-absolute ect-inset-0 ect-bg-charcoal/40 ect-backdrop-blur-sm" @click="close" />

      <!-- Panel (slides in from the left) -->
      <Transition
        enter-active-class="ect-transition ect-duration-300 ect-ease-out"
        enter-from-class="-ect-translate-x-full"
        enter-to-class="ect-translate-x-0"
        leave-active-class="ect-transition ect-duration-200 ect-ease-in"
        leave-from-class="ect-translate-x-0"
        leave-to-class="-ect-translate-x-full"
      >
        <article v-if="modelValue" class="ect-relative ect-w-[95%] ect-max-w-md ect-h-full ect-bg-cream ect-rounded-r-3xl ect-shadow-2xl ect-overflow-y-auto">
          <!-- Header -->
          <header class="ect-px-6 ect-pt-3 ect-pb-3 ect-border-b ect-border-sand ect-sticky ect-top-0 ect-bg-cream ect-z-10">
            <section class="ect-flex ect-items-start ect-justify-between">
              <div>
                <h2 class="ect-font-display ect-text-2xl ect-font-medium ect-text-charcoal ect-leading-none">Filters</h2>
                <p v-if="previewCount !== null" class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1.5">{{ previewCount }} {{ previewCount === 1 ? 'piece' : 'pieces' }} match</p>
              </div>
              <button type="button" @click="close" class="ect-text-charcoal/70 hover:ect-text-charcoal ect-transition-colors -ect-mt-0.5" aria-label="Close">
                <svg class="ect-w-6 ect-h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </section>

            <!-- Active filter chips -->
            <section v-if="activeChips.length" class="ect-flex ect-items-center ect-gap-2 ect-flex-wrap ect-mt-3">
              <button
                v-for="chip in activeChips"
                :key="chip.key"
                type="button"
                @click="chip.remove()"
                class="ect-group ect-inline-flex ect-items-center ect-gap-1.5 ect-pl-3 ect-pr-2 ect-py-1.5 ect-bg-gold-50 ect-text-gold-700 ect-border ect-border-gold-400/50 ect-rounded-full ect-font-body ect-text-xs ect-font-medium ect-transition-colors hover:ect-bg-gold-100"
              >
                {{ chip.label }}
                <svg class="ect-w-3 ect-h-3 ect-text-gold-700/70 group-hover:ect-text-gold-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button type="button" @click="clear" class="ect-font-body ect-text-xs ect-font-medium ect-text-gold-700 hover:ect-text-gold-800 ect-underline ect-underline-offset-2 ect-ml-1 ect-transition-colors">Clear all</button>
            </section>
          </header>

          <section class="ect-px-6 ect-py-4 ect-space-y-4">
            <!-- Price -->
            <template v-if="showFacet('price')">
              <hr v-if="!isFirstFacet('price')" class="ect-border-sand" />
              <section>
                <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50 ect-mb-2">Price</h3>
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
                  />
                </div>
              </section>

            </template>

            <!-- Metal -->
            <template v-if="showFacet('metal')">
              <hr v-if="!isFirstFacet('metal')" class="ect-border-sand" />
              <section>
                <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50 ect-mb-2">Metal</h3>
                <section class="ect-flex ect-flex-wrap ect-gap-2">
                  <button
                    v-for="option in METAL_OPTIONS"
                    :key="option.id"
                    type="button"
                    :aria-pressed="local.metals.includes(option.id)"
                    :class="local.metals.includes(option.id) ? 'ect-bg-gold-50 ect-text-gold-700 ect-border-gold-400' : 'ect-border-sand ect-text-charcoal/80 hover:ect-border-gold-400/60'"
                    class="ect-flex-none ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-[13px] ect-font-medium ect-px-3 ect-py-2.5 ect-rounded-full ect-border ect-whitespace-nowrap ect-transition-colors"
                    @click="toggleMetal(option.id)"
                  >
                    {{ option.label }}
                    <span class="ect-text-xs" :class="local.metals.includes(option.id) ? 'ect-text-gold-700/60' : 'ect-text-charcoal/40'">{{ metalCount(option.id) }}</span>
                  </button>
                </section>
              </section>

            </template>

            <!-- Stone -->
            <template v-if="showFacet('stone')">
              <hr v-if="!isFirstFacet('stone')" class="ect-border-sand" />
              <section>
                <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50 ect-mb-2">Stone</h3>
                <section class="ect-flex ect-flex-wrap ect-gap-2">
                  <button
                    v-for="option in STONE_OPTIONS"
                    :key="option.id"
                    type="button"
                    :aria-pressed="local.stones.includes(option.id)"
                    :class="local.stones.includes(option.id) ? 'ect-bg-gold-50 ect-text-gold-700 ect-border-gold-400' : 'ect-border-sand ect-text-charcoal/80 hover:ect-border-gold-400/60'"
                    class="ect-flex-none ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-[13px] ect-font-medium ect-px-3 ect-py-2.5 ect-rounded-full ect-border ect-whitespace-nowrap ect-transition-colors"
                    @click="toggleStone(option.id)"
                  >
                    {{ option.label }}
                    <span class="ect-text-xs" :class="local.stones.includes(option.id) ? 'ect-text-gold-700/60' : 'ect-text-charcoal/40'">{{ stoneCount(option.id) }}</span>
                  </button>
                </section>
              </section>

            </template>

            <!-- Type -->
            <template v-if="showFacet('type')">
              <hr v-if="!isFirstFacet('type')" class="ect-border-sand" />
              <section>
                <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50 ect-mb-2">Type</h3>
                <section class="ect-flex ect-flex-wrap ect-gap-2">
                  <button
                    v-for="option in BANGLE_BRACELET_TYPE_OPTIONS"
                    :key="option.id"
                    type="button"
                    :aria-pressed="local.types.includes(option.id)"
                    :class="local.types.includes(option.id) ? 'ect-bg-gold-50 ect-text-gold-700 ect-border-gold-400' : 'ect-border-sand ect-text-charcoal/80 hover:ect-border-gold-400/60'"
                    class="ect-flex-none ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-[13px] ect-font-medium ect-px-3 ect-py-2.5 ect-rounded-full ect-border ect-whitespace-nowrap ect-transition-colors"
                    @click="toggleType(option.id)"
                  >
                    {{ option.label }}
                    <span class="ect-text-xs" :class="local.types.includes(option.id) ? 'ect-text-gold-700/60' : 'ect-text-charcoal/40'">{{ typeCount(option.id) }}</span>
                  </button>
                </section>
              </section>

            </template>

            <!-- Material -->
            <template v-if="showFacet('material')">
              <hr v-if="!isFirstFacet('material')" class="ect-border-sand" />
            <section>
              <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50 ect-mb-2">Material</h3>
              <section class="ect-flex ect-gap-2.5 ect-flex-wrap">
                <button
                  v-for="m in (['gold', 'silver'] as Material[])"
                  :key="m"
                  type="button"
                  :aria-pressed="local.materials.includes(m)"
                  :class="local.materials.includes(m) ? 'ect-bg-rose-500 ect-text-white ect-border-rose-500' : 'ect-bg-champagne ect-text-charcoal ect-border-transparent hover:ect-bg-sand'"
                  class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-font-medium ect-px-5 ect-py-2.5 ect-rounded-full ect-border ect-capitalize ect-transition-colors"
                  @click="toggleMaterial(m)"
                >
                  {{ m }}
                  <span class="ect-text-xs" :class="local.materials.includes(m) ? 'ect-text-white/60' : 'ect-text-charcoal/40'">{{ materialCount(m) }}</span>
                </button>
              </section>
            </section>

            </template>

            <!-- Category (pills wrap onto multiple lines). Hidden when the page
                 locks a single category; narrowed to the page's own categories
                 when it locks several. -->
            <template v-if="showFacet('category')">
              <hr v-if="!isFirstFacet('category')" class="ect-border-sand" />
              <section>
                <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50 ect-mb-2">Category</h3>
                <section class="ect-flex ect-flex-wrap ect-gap-2">
                  <button
                    v-for="cat in categoryOptions"
                    :key="cat"
                    type="button"
                    :aria-pressed="local.categories.includes(cat)"
                    :class="local.categories.includes(cat) ? 'ect-bg-gold-50 ect-text-gold-700 ect-border-gold-400' : 'ect-border-sand ect-text-charcoal/80 hover:ect-border-gold-400/60'"
                    class="ect-flex-none ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-[13px] ect-font-medium ect-px-3 ect-py-2.5 ect-rounded-full ect-border ect-whitespace-nowrap ect-transition-colors"
                    @click="toggleCategory(cat)"
                  >
                    {{ cat }}
                    <span class="ect-text-xs" :class="local.categories.includes(cat) ? 'ect-text-gold-700/60' : 'ect-text-charcoal/40'">{{ categoryCount(cat) }}</span>
                  </button>
                </section>
              </section>

            </template>

            <!-- Stone Shape -->
            <template v-if="showFacet('stone-shape')">
              <hr v-if="!isFirstFacet('stone-shape')" class="ect-border-sand" />
            <section>
              <button
                type="button"
                class="ect-w-full ect-flex ect-items-center ect-justify-between ect-mb-2"
                :aria-expanded="stoneShapeOpen"
                @click="stoneShapeOpen = !stoneShapeOpen"
              >
                <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50">Stone Shape</h3>
                <span class="ect-flex ect-items-center ect-gap-2">
                  <span v-if="local.centerShapes.length" class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/70">{{ local.centerShapes.length }} selected</span>
                  <svg class="ect-w-4 ect-h-4 ect-text-charcoal/40 ect-transition-transform" :class="stoneShapeOpen ? 'ect-rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              <section v-show="stoneShapeOpen" class="ect-flex ect-gap-2.5 ect-flex-wrap">
                <button
                  v-for="shape in CENTER_SHAPE_OPTIONS"
                  :key="shape"
                  type="button"
                  :aria-pressed="local.centerShapes.includes(shape)"
                  :class="local.centerShapes.includes(shape) ? 'ect-bg-gold-50 ect-text-gold-700 ect-border-gold-400' : 'ect-border-sand ect-text-charcoal/80 hover:ect-border-gold-400/60'"
                  class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-font-medium ect-px-5 ect-py-2.5 ect-rounded-full ect-border ect-transition-colors"
                  @click="toggleCenterShape(shape)"
                >
                  {{ shape }}
                  <span class="ect-text-xs" :class="local.centerShapes.includes(shape) ? 'ect-text-gold-700/60' : 'ect-text-charcoal/40'">{{ shapeCount(shape) }}</span>
                </button>
              </section>
            </section>

            </template>

            <!-- Stone Size -->
            <hr v-if="showFacet('stone-size') && !isFirstFacet('stone-size')" class="ect-border-sand" />
            <section v-if="showFacet('stone-size')">
              <button
                type="button"
                class="ect-w-full ect-flex ect-items-center ect-justify-between ect-mb-2"
                :aria-expanded="stoneSizeOpen"
                @click="stoneSizeOpen = !stoneSizeOpen"
              >
                <h3 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50">Stone Size</h3>
                <span class="ect-flex ect-items-center ect-gap-2">
                  <span v-if="local.centerStoneSizes.length" class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/70">{{ local.centerStoneSizes.length }} selected</span>
                  <svg class="ect-w-4 ect-h-4 ect-text-charcoal/40 ect-transition-transform" :class="stoneSizeOpen ? 'ect-rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              <section v-show="stoneSizeOpen" class="ect-flex ect-gap-2.5 ect-flex-wrap">
                <p v-if="!local.centerShapes.length" class="ect-font-body ect-text-sm ect-text-charcoal/45">Select a stone shape to see available sizes.</p>
                <button
                  v-for="size in availableCenterStoneSizes"
                  :key="size"
                  type="button"
                  :aria-pressed="local.centerStoneSizes.includes(size)"
                  :class="local.centerStoneSizes.includes(size) ? 'ect-bg-gold-50 ect-text-gold-700 ect-border-gold-400' : 'ect-border-sand ect-text-charcoal/80 hover:ect-border-gold-400/60'"
                  class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-font-medium ect-px-5 ect-py-2.5 ect-rounded-full ect-border ect-transition-colors"
                  @click="toggleCenterStoneSize(size)"
                >
                  {{ formatCenterStoneSize(size) }}
                  <span class="ect-text-xs" :class="local.centerStoneSizes.includes(size) ? 'ect-text-gold-700/60' : 'ect-text-charcoal/40'">{{ sizeCount(size) }}</span>
                </button>
              </section>
            </section>
          </section>

          <!-- Footer -->
          <footer class="ect-sticky ect-bottom-0 ect-bg-cream ect-border-t ect-border-sand ect-px-6 ect-py-3 ect-flex ect-gap-3">
            <button
              type="button"
              @click="clear"
              class="ect-flex-1 ect-flex ect-items-center ect-justify-center ect-gap-2 ect-py-3.5 ect-bg-white ect-border ect-border-sand ect-text-charcoal ect-font-body ect-text-sm ect-font-medium ect-rounded-full hover:ect-bg-pearl ect-transition-colors"
            >
              <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M5.6 9A7.5 7.5 0 0119 8.5M18.4 15A7.5 7.5 0 015 15.5" />
              </svg>
              Reset
            </button>
            <button
              type="button"
              @click="apply"
              :disabled="previewCount === 0"
              class="ect-flex-[1.6] ect-py-3.5 ect-bg-rose-500 ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-wider ect-rounded-full hover:ect-bg-rose-600 ect-transition-colors disabled:ect-opacity-40 disabled:ect-cursor-not-allowed"
            >
              <template v-if="previewCount !== null">{{ previewCount === 0 ? 'No pieces match' : `Show ${previewCount} ${previewCount === 1 ? 'piece' : 'pieces'}` }}</template>
              <template v-else>Apply Filters{{ activeCount > 0 ? ` (${activeCount})` : '' }}</template>
            </button>
          </footer>
        </article>
      </Transition>
    </section>
  </Transition>
</template>

<style scoped>
.ect-no-scrollbar::-webkit-scrollbar { display: none; }
.ect-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Two range inputs stacked on one track — see the same block in
   CollectionGrid.vue, which draws the desktop rail's copy of this facet. */
.price-range { position: relative; height: 24px; }
.price-track,
.price-fill {
  position: absolute;
  top: 50%;
  height: 3px;
  border-radius: 999px;
  transform: translateY(-50%);
}
.price-track { left: 0; right: 0; background: #ebe7e2; }
.price-fill { background: #d96b7d; }
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
.price-thumb::-webkit-slider-runnable-track { height: 24px; background: none; }
.price-thumb::-moz-range-track { height: 24px; background: none; }
.price-thumb::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  pointer-events: auto;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid #d96b7d;
  background: #fff;
  box-shadow: 0 1px 3px rgba(27, 25, 23, 0.25);
  cursor: pointer;
}
.price-thumb::-moz-range-thumb {
  pointer-events: auto;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid #d96b7d;
  background: #fff;
  box-shadow: 0 1px 3px rgba(27, 25, 23, 0.25);
  cursor: pointer;
}
.price-thumb:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(217, 107, 125, 0.3); }
.price-thumb:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px rgba(217, 107, 125, 0.3); }
</style>
