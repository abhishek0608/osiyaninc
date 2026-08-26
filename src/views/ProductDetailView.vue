<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProductCard from '../components/ProductCard.vue'
import StarRating from '../components/StarRating.vue'
import VolumeDiscountInfo from '../components/VolumeDiscountInfo.vue'
import CertifiedBadge from '../components/CertifiedBadge.vue'
import ImageWatermark from '../components/ImageWatermark.vue'
import { useAuth } from '../composables/useAuth'
import { useCart, type ProductCustomization } from '../composables/useCart'
import { useWishlist } from '../composables/useWishlist'
import { useProductsApi } from '../composables/useProductsApi'
import { useSiteConfig } from '../composables/useSiteConfig'
import { setPageMeta, setProductJsonLd } from '../composables/useSeo'
import { SITE_SETTINGS } from '../config/site-settings'
import { BANGLE_SIZE_OPTIONS, COLORS, formatProductPrice, getProductReviews, NECKLACE_SIZE_OPTIONS, RING_SIZE_OPTIONS, type Color, type Product, type ProductCustomizationOptions } from '../data/products'

const RING_SIZES = RING_SIZE_OPTIONS
const BANGLE_SIZES = BANGLE_SIZE_OPTIONS
const NECKLACE_SIZES = NECKLACE_SIZE_OPTIONS

const route = useRoute()
const router = useRouter()

// Return to the page the user arrived from (e.g. a collection); a deep link
// with no in-app history falls back to the homepage collections section.
function goBack() {
  if (router.options.history.state.back) router.back()
  else router.push('/#collections')
}
const { addToCart } = useCart()
const { isWishlisted, toggle: toggleWishlist } = useWishlist()
const { isLoggedIn } = useAuth()
const { products, ensureProductsLoaded, loading } = useProductsApi()
const { ensureSiteConfigLoaded } = useSiteConfig()

const product = computed(() => products.value.find((p) => p.slug === String(route.params.slug || '')))

const priceLabel = computed(() => (product.value ? formatProductPrice(product.value) : ''))
const wishlisted = computed(() => (product.value ? isWishlisted(product.value.slug) : false))

function handleToggleWishlist() {
  if (product.value) toggleWishlist(product.value)
}
const addedImages = ref<string[]>([])
const added = ref(false)
const addingToCart = ref(false)
const activeImage = ref(0)
const thumbsRef = ref<HTMLElement | null>(null)

// Hover-zoom magnifier lens for the main product image
const ZOOM_LEVEL = 1.7
const LENS_SIZE = 170
const stageRef = ref<HTMLElement | null>(null)
const zoomActive = ref(false)
const lensStyle = ref<Record<string, string>>({})

function canHover() {
  return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function startZoom() {
  if (!canHover() || !galleryImages.value[activeImage.value]) return
  zoomActive.value = true
}

function stopZoom() {
  zoomActive.value = false
}

function moveZoom(event: MouseEvent) {
  const stage = stageRef.value
  const src = galleryImages.value[activeImage.value]
  if (!stage || !src) return
  const rect = stage.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const half = LENS_SIZE / 2
  // keep the lens fully inside the image bounds
  const left = Math.max(0, Math.min(x - half, rect.width - LENS_SIZE))
  const top = Math.max(0, Math.min(y - half, rect.height - LENS_SIZE))
  // Mirror the img's object-cover sizing so the lens magnifies without
  // stretching non-square photos (which made round pieces look oval)
  let coverW = rect.width
  let coverH = rect.height
  const img = stage.querySelector('img')
  if (img?.naturalWidth && img.naturalHeight) {
    const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
    coverW = img.naturalWidth * scale
    coverH = img.naturalHeight * scale
  }
  const bgX = ((x + (coverW - rect.width) / 2) / coverW) * 100
  const bgY = ((y + (coverH - rect.height) / 2) / coverH) * 100
  lensStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    backgroundImage: `url("${src}")`,
    backgroundSize: `${coverW * ZOOM_LEVEL}px ${coverH * ZOOM_LEVEL}px`,
    backgroundPosition: `${bgX}% ${bgY}%`,
  }
}

// Every piece is exclusive, so its metal color is a fact of the piece rather
// than a choice the buyer makes: it comes straight off the product, drives which
// gallery shots are shown, and is stated in the spec sheet.
const productColor = computed<Color>(() => product.value?.color || 'yellow')
const productColorLabel = computed(
  () => COLORS.find((option) => option.id === productColor.value)?.label || productColor.value
)

const selectedRingSize = ref('')
const selectedBangleSize = ref('')
const selectedNecklaceSize = ref('')

// Decode the metal color an image represents from its filename. Uploads follow
// a "... <COLOR> (n)" convention where COLOR is a standalone R / W / Y letter
// (Rose / White / Yellow gold), e.g. "snapshot R (1).png". Returns null when no
// such token is present (older images, generic/model shots).
const COLOR_BY_LETTER: Record<string, Color> = { r: 'rose', w: 'white', y: 'yellow' }
function imageColor(url: string): Color | null {
  const file = decodeURIComponent(url.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '')
  for (const token of file.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length === 1 && COLOR_BY_LETTER[token]) return COLOR_BY_LETTER[token]
  }
  return null
}

const allImages = computed(() => {
  const base = product.value?.images?.filter(Boolean) || []
  return [...base, ...addedImages.value.filter((img) => !base.includes(img))]
})

// Whether any image filename encodes a metal color. Products whose images
// predate the convention show every image regardless of the piece's color.
const hasColorTaggedImages = computed(() => allImages.value.some((img) => imageColor(img)))

// Gallery filtered to the piece's metal color. Color-tagged shots for that color
// are shown alongside any untagged (generic) images — including the cover
// thumbnail, which keeps its place at the head of the rail; if the color has no
// dedicated shots, fall back to showing everything.
const galleryImages = computed(() => {
  const all = allImages.value
  if (!hasColorTaggedImages.value) return all
  const matching = all.filter((img) => {
    const color = imageColor(img)
    return color === null || color === productColor.value
  })
  return matching.length ? matching : all
})

// The rail is horizontal under the stage on narrow screens and vertical beside it
// from 900px up, so how many thumbs fit depends on the layout, not on a fixed
// count — show the scroll arrows only when the rail actually overflows.
const thumbsOverflow = ref(false)

function measureThumbsOverflow() {
  const rail = thumbsRef.value
  thumbsOverflow.value = rail
    ? rail.scrollWidth > rail.clientWidth + 1 || rail.scrollHeight > rail.clientHeight + 1
    : false
}

const showThumbRailControls = computed(() => thumbsOverflow.value)

const reviews = computed(() =>
  SITE_SETTINGS.enableReviews && product.value ? getProductReviews(product.value.slug) : []
)

const relatedProducts = computed<Product[]>(() => {
  if (!product.value) return []

  const current = product.value
  const currentTags = new Set([...(current.styleTags || []), ...(current.stoneTags || [])])

  return products.value
    .filter((item) => item.slug !== current.slug)
    .map((item) => {
      let score = 0
      if (item.category === current.category) score += 4
      if (item.material === current.material) score += 2
      if (item.color === current.color) score += 1
      if (item.subtype && item.subtype === current.subtype) score += 3
      for (const tag of item.styleTags || []) {
        if (currentTags.has(tag)) score += 1
      }
      for (const tag of item.stoneTags || []) {
        if (currentTags.has(tag)) score += 1
      }
      return { item, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ item }) => item)
})

// Only pieces we actually certify carry a lab; everything downstream (the tag
// on the photo, the badge, the report link) hangs off this being present.
const certification = computed(() => product.value?.certification || null)
const certificationLabel = computed(() => {
  const lab = certification.value?.lab?.trim() || ''
  if (!lab) return ''
  return /^in[-\s]?house$/i.test(lab) ? 'Certified in-house' : `${lab} certified`
})

const productBadges = computed(() => {
  if (!product.value) return []
  return [
    product.value.isNewArrival ? 'New arrival' : '',
    product.value.isBestSeller ? 'Best seller' : '',
    certificationLabel.value,
  ].filter(Boolean)
})

const reviewSummary = computed(() => {
  if (!SITE_SETTINGS.enableReviews) return ''
  if (!product.value?.rating || !product.value?.reviewCount) return ''
  return `${product.value.rating.toFixed(1)} · ${product.value.reviewCount} reviews`
})

const technicalDetailRows = computed<Array<{ label: string; value: string }>>(() => {
  const desc = product.value?.description?.trim() || ''
  const specs: Array<{ label: string; value: string }> = []
  const attributeSpecs = [
    { label: 'Gross Weight', value: product.value?.productAttributes?.grossWeight || '' },
    { label: 'Diamond Carats', value: product.value?.productAttributes?.diamondCarats || '' },
    { label: 'Diamond Quantity', value: product.value?.productAttributes?.diamondQuantity || '' },
  ].filter((spec) => spec.value)
  const seenLabels = new Set(attributeSpecs.map((spec) => spec.label.toLowerCase()))

  const regex = /([A-Z][A-Za-z ]+?):\s*(.+?)(?=\s+[A-Z][A-Za-z ]+?:|\s*$)/g
  let match: RegExpExecArray | null
  while (desc && (match = regex.exec(desc)) !== null) {
    const label = match[1]?.trim() || ''
    const value = match[2]?.trim().replace(/[.,;]+$/, '') || ''
    if (label && value && !seenLabels.has(label.toLowerCase())) specs.push({ label, value })
  }

  return [...attributeSpecs, ...specs]
})

// The spec sheet carries facts about the piece only. Size is already shown by its
// own control, so mirroring that selection back here just doubles the page's
// reading load; metal color has no control of its own — the piece exists in one
// color — so it is stated here.
const specRows = computed<Array<{ label: string; value: string }>>(() => {
  const rows = [
    { label: 'Metal Color', value: product.value ? productColorLabel.value : '' },
    ...technicalDetailRows.value,
  ]

  return rows.filter((row) => Boolean(row.value))
})

const hasSpecDetails = computed(() => Boolean(specRows.value.length || product.value?.details?.length))

// The certification accordion: everything about the report, so the "Details"
// panel above stays about the piece itself. `lab` alone is enough to open the
// panel — the number, date and scan each arrive on their own schedule.
const certificationRows = computed<Array<{ label: string; value: string }>>(() => {
  const cert = certification.value
  if (!cert) return []
  const isInHouse = /^in[-\s]?house$/i.test(cert.lab.trim())
  return [
    { label: 'Certified By', value: isInHouse ? 'Osiyan in-house assay' : cert.lab },
    { label: 'Report No.', value: cert.number || '' },
    { label: 'Date of Issue', value: formatCertificationDate(cert.certifiedAt) },
  ].filter((row) => Boolean(row.value))
})

function formatCertificationDate(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Details stays open — it is the spec sheet buyers scan before adding to cart.
// Certification collapses because it is a follow-up question, not a first read.
const certificationOpen = ref(false)

const isRingProduct = computed(
  () => product.value?.category === 'Rings' || !!(productCustomizationOptions.value.ringSizes?.length),
)

const isBangleProduct = computed(() => {
  if (productCustomizationOptions.value.bangleSizes?.length) return true
  const item = product.value
  if (!item) return false
  if (item.category === 'Bangles') return true
  // Bangle-ish pieces still filed under Bracelets need the bangle size too.
  if (item.category !== 'Bracelets') return false
  const fingerprint = [item.title, item.subtype, ...(item.details || [])].join(' ').toLowerCase()
  return /\b(bangle|kada|cuff)\b/.test(fingerprint)
})

const isNecklaceProduct = computed(() => {
  if (productCustomizationOptions.value.necklaceSizes?.length) return true
  const category = product.value?.category
  return category === 'Necklaces' || category === 'Mangal Sutra'
})

const productCustomizationOptions = computed<ProductCustomizationOptions>(() => product.value?.customizationOptions || {})

const availableRingSizes = computed((): string[] => [...RING_SIZES])
const availableBangleSizes = computed((): string[] => [...BANGLE_SIZES])
const availableNecklaceSizes = computed((): string[] => [...NECKLACE_SIZES])

function firstProductOption(key: keyof ProductCustomizationOptions): string {
  const arr = productCustomizationOptions.value[key]
  if (Array.isArray(arr) && arr.length) return String(arr[0]).trim()
  return ''
}

function resetSelections() {
  selectedRingSize.value = firstProductOption('ringSizes')
  selectedBangleSize.value = firstProductOption('bangleSizes')
  selectedNecklaceSize.value = firstProductOption('necklaceSizes')
}

// Metal color and size describe how the piece is made and worn, not a bespoke
// request: they ride along with the cart line so the order records them, but
// `isCustomized` stays unset — that flag diverts an item into the quote-only
// checkout, and we no longer take customisation orders.
function buildSelectionPayload(): ProductCustomization {
  return {
    metalColor: productColorLabel.value,
    ...(isRingProduct.value && selectedRingSize.value ? { ringSize: selectedRingSize.value } : {}),
    ...(isBangleProduct.value && selectedBangleSize.value ? { bangleSize: selectedBangleSize.value } : {}),
    ...(isNecklaceProduct.value && selectedNecklaceSize.value ? { necklaceSize: selectedNecklaceSize.value } : {}),
  }
}

function setActiveImage(index: number) {
  if (!galleryImages.value.length) {
    activeImage.value = 0
    return
  }
  const lastIndex = galleryImages.value.length - 1
  activeImage.value = Math.min(Math.max(index, 0), lastIndex)
}

function showPreviousImage() {
  if (!galleryImages.value.length) return
  const lastIndex = galleryImages.value.length - 1
  activeImage.value = activeImage.value <= 0 ? lastIndex : activeImage.value - 1
}

function showNextImage() {
  if (!galleryImages.value.length) return
  const lastIndex = galleryImages.value.length - 1
  activeImage.value = activeImage.value >= lastIndex ? 0 : activeImage.value + 1
}

// The rail runs horizontally under the stage on narrow screens and vertically
// beside it from 900px up, so scroll along whichever axis actually overflows.
function scrollThumbs(direction: 'prev' | 'next') {
  const rail = thumbsRef.value
  if (!rail) return
  const vertical = rail.scrollHeight > rail.clientHeight + 1
  const extent = vertical ? rail.clientHeight : rail.clientWidth
  const delta = (direction === 'next' ? 1 : -1) * Math.max(extent * 0.75, 180)
  rail.scrollBy({
    [vertical ? 'top' : 'left']: delta,
    behavior: 'smooth',
  })
}

// The rail's own box changes with the viewport; its content changes with the
// gallery. Watch both — a ResizeObserver alone misses thumbs added to a rail
// whose height is pinned to the stage.
let thumbsObserver: ResizeObserver | null = null

watch(thumbsRef, (rail) => {
  thumbsObserver?.disconnect()
  thumbsObserver = null
  if (!rail || typeof ResizeObserver === 'undefined') {
    measureThumbsOverflow()
    return
  }
  thumbsObserver = new ResizeObserver(() => measureThumbsOverflow())
  thumbsObserver.observe(rail)
  measureThumbsOverflow()
})

onBeforeUnmount(() => {
  thumbsObserver?.disconnect()
  thumbsObserver = null
})

onMounted(async () => {
  void ensureSiteConfigLoaded()
  await ensureProductsLoaded()
})

watch(product, (item) => {
  activeImage.value = 0
  addedImages.value = []
  resetSelections()
  if (item) {
    setPageMeta({ title: item.title, description: item.description })
    setProductJsonLd(item)
  }
}, { immediate: true })

watch(galleryImages, async (images) => {
  if (!images.length) {
    activeImage.value = 0
  } else if (activeImage.value >= images.length) {
    activeImage.value = images.length - 1
  }
  await nextTick()
  measureThumbsOverflow()
})

watch(activeImage, async (index) => {
  await nextTick()
  const container = thumbsRef.value
  const activeThumb = container?.querySelector<HTMLElement>(`[data-thumb-index="${index}"]`)
  activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
})

async function handleAddToCart() {
  if (!product.value || addingToCart.value) return

  addingToCart.value = true
  try {
    await addToCart(product.value, 1, buildSelectionPayload())
    added.value = true
    setTimeout(() => {
      added.value = false
    }, 2000)
  } catch (err) {
    console.error('Add to cart failed:', err)
  } finally {
    addingToCart.value = false
  }
}
</script>

<template>
  <section v-if="product" class="ect-pt-6 sm:ect-pt-14 ect-pb-28 ect-px-4 sm:ect-px-6 ect-bg-cream ect-min-h-screen">
    <article class="ect-max-w-6xl ect-mx-auto">
      <button
        type="button"
        class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.15em] ect-text-charcoal/45 hover:ect-text-gold-700 ect-transition-colors ect-mb-8"
        @click="goBack"
      >
        <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <section class="product-detail-hero">
        <section class="product-detail-gallery">
          <div class="product-detail-gallery-layout" :class="{ 'product-detail-gallery-layout--railed': galleryImages.length > 1 }">
            <figure
              ref="stageRef"
              class="product-detail-stage ect-relative ect-w-full ect-aspect-square ect-rounded-2xl ect-overflow-hidden ect-bg-champagne ect-shadow-luxe-sm ect-border ect-border-sand"
              :class="{ 'product-detail-stage--zooming': zoomActive }"
              @mouseenter="startZoom"
              @mouseleave="stopZoom"
              @mousemove="moveZoom"
            >
              <img
                v-if="galleryImages[activeImage]"
                :src="galleryImages[activeImage]"
                :alt="product.title"
                decoding="async"
                class="ect-w-full ect-h-full ect-object-cover"
              />
              <ImageWatermark v-if="galleryImages[activeImage]" :opacity="0.5" :scale="0.1" />
              <CertifiedBadge
                v-if="galleryImages[activeImage]"
                :certification="certification"
                size="md"
              />
              <div
                v-if="zoomActive && galleryImages[activeImage]"
                class="product-detail-lens"
                :style="lensStyle"
                aria-hidden="true"
              />
              <span
                v-if="galleryImages[activeImage]"
                class="product-detail-zoom-hint ect-pointer-events-none ect-absolute ect-bottom-4 ect-right-4 ect-inline-flex ect-items-center ect-gap-1.5 ect-rounded-full ect-bg-white/88 ect-px-3 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-text-charcoal ect-shadow-sm"
              >
                <svg class="ect-h-3.5 ect-w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
                Hover to zoom
              </span>
              <div v-if="galleryImages.length > 1" class="ect-pointer-events-none ect-absolute ect-inset-x-0 ect-top-0 ect-z-10 ect-flex ect-items-start ect-justify-between ect-p-4">
                <span class="ect-pointer-events-auto ect-inline-flex ect-items-center ect-rounded-full ect-bg-white/88 ect-px-3 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-text-charcoal ect-shadow-sm">
                  {{ activeImage + 1 }} / {{ galleryImages.length }}
                </span>
              </div>
              <div v-if="galleryImages.length > 1" class="ect-absolute ect-inset-x-0 ect-top-1/2 ect-z-10 ect-flex ect--translate-y-1/2 ect-items-center ect-justify-between ect-px-3">
                <button
                  type="button"
                  aria-label="Show previous image"
                  class="ect-inline-flex ect-h-10 ect-w-10 ect-items-center ect-justify-center ect-rounded-full ect-bg-white/88 ect-text-charcoal ect-shadow-md ect-transition hover:ect-bg-white"
                  @click="showPreviousImage"
                >
                  <svg class="ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Show next image"
                  class="ect-inline-flex ect-h-10 ect-w-10 ect-items-center ect-justify-center ect-rounded-full ect-bg-white/88 ect-text-charcoal ect-shadow-md ect-transition hover:ect-bg-white"
                  @click="showNextImage"
                >
                  <svg class="ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>
              <span v-else class="ect-w-full ect-h-full ect-flex ect-items-center ect-justify-center">
                <svg class="ect-w-16 ect-h-16 ect-text-gold-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </figure>

            <div v-if="galleryImages.length > 1" class="product-detail-thumbrail ect-flex ect-items-center ect-gap-2 sm:ect-gap-3">
              <button
                v-if="showThumbRailControls"
                type="button"
                aria-label="Show previous thumbnails"
                class="ect-inline-flex ect-h-8 ect-w-8 sm:ect-h-10 sm:ect-w-10 ect-shrink-0 ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-sand ect-bg-white/90 ect-text-charcoal ect-shadow-sm ect-transition hover:ect-border-gold-300 hover:ect-bg-white"
                @click="scrollThumbs('prev')"
              >
                <svg class="product-detail-thumbnav-icon ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              <ul
                ref="thumbsRef"
                class="product-detail-thumbs ect-flex ect-gap-2 sm:ect-gap-3 ect-list-none ect-m-0 ect-p-0 ect-overflow-x-auto"
              >
                <li v-for="(img, idx) in galleryImages" :key="`${img}-${idx}`" class="ect-shrink-0">
                  <button
                    type="button"
                    :data-thumb-index="idx"
                    @click="setActiveImage(idx)"
                    class="ect-w-14 ect-h-14 sm:ect-w-20 sm:ect-h-20 ect-rounded-xl ect-overflow-hidden ect-border-2 ect-transition-all focus:ect-outline-none focus-visible:ect-ring-2 focus-visible:ect-ring-gold-300 focus-visible:ect-ring-offset-2"
                    :class="activeImage === idx ? 'ect-border-gold-400 ect-shadow-sm' : 'ect-border-sand ect-opacity-75 hover:ect-border-gold-300 hover:ect-opacity-100'"
                    :aria-current="activeImage === idx ? 'true' : undefined"
                  >
                    <img :src="img" :alt="`${product.title} view ${idx + 1}`" loading="lazy" decoding="async" class="ect-w-full ect-h-full ect-object-cover" />
                  </button>
                </li>
              </ul>

              <button
                v-if="showThumbRailControls"
                type="button"
                aria-label="Show next thumbnails"
                class="ect-inline-flex ect-h-8 ect-w-8 sm:ect-h-10 sm:ect-w-10 ect-shrink-0 ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-sand ect-bg-white/90 ect-text-charcoal ect-shadow-sm ect-transition hover:ect-border-gold-300 hover:ect-bg-white"
                @click="scrollThumbs('next')"
              >
                <svg class="product-detail-thumbnav-icon ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        <section class="product-detail-content">
          <p class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">
            <span class="ect-w-6 ect-h-px ect-bg-gold-400" />
            {{ product.category }} · {{ product.material }}
          </p>
          <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-leading-[1.1] ect-mb-3">
            {{ product.title }}
          </h1>

          <div v-if="reviewSummary" class="ect-inline-flex ect-items-center ect-gap-2 ect-text-charcoal/55 ect-mb-5">
            <StarRating :rating="product.rating || 0" size="sm" />
            <span class="ect-font-body ect-text-sm">{{ reviewSummary }}</span>
          </div>

          <p
            v-if="isLoggedIn"
            class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-text-charcoal ect-tabular-nums ect-mb-5"
          >
            {{ priceLabel }}
          </p>
          <RouterLink
            v-else
            to="/login"
            class="ect-inline-block ect-font-body ect-text-base ect-font-medium ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors ect-mb-5"
          >
            Sign in to view price
          </RouterLink>

          <div v-if="productBadges.length" class="ect-flex ect-flex-wrap ect-gap-2 ect-mb-5">
            <span
              v-for="badge in productBadges"
              :key="badge"
              class="ect-inline-flex ect-items-center ect-rounded-full ect-bg-champagne ect-px-3 ect-py-1 ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-gold-700 ect-border ect-border-gold-200"
            >
              {{ badge }}
            </span>
          </div>

          <p
            v-if="product.description"
            class="ect-font-body ect-text-[15px] ect-leading-7 ect-text-charcoal/65 ect-mb-8"
          >
            {{ product.description }}
          </p>

          <!-- Size is the only variant choice: each piece is made in a single
               metal color, stated in the spec sheet below. -->
          <section v-if="isRingProduct" class="ect-mb-6 ect-max-w-[16rem] ect-space-y-2">
            <label for="ring-size" class="ect-block ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/48">
              Ring Size
            </label>
            <div class="ect-relative">
              <select
                id="ring-size"
                v-model="selectedRingSize"
                class="customization-control ect-w-full ect-appearance-none ect-cursor-pointer ect-rounded-xl ect-px-4 ect-py-3.5 ect-pr-12 ect-font-body ect-text-sm ect-font-medium ect-text-charcoal focus:ect-outline-none ect-transition-all"
              >
                <option value="">None</option>
                <option v-for="size in availableRingSizes" :key="size" :value="size">{{ size }}</option>
              </select>
              <span class="customization-chevron ect-pointer-events-none ect-absolute ect-right-2.5 ect-top-1/2 -ect-translate-y-1/2 ect-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-lg">
                <svg class="ect-w-3.5 ect-h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 011.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
              </span>
            </div>
          </section>

          <section v-if="isBangleProduct" class="ect-mb-6 ect-max-w-[16rem] ect-space-y-2">
            <label for="bangle-size" class="ect-block ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/48">
              Bangle Size
            </label>
            <div class="ect-relative">
              <select
                id="bangle-size"
                v-model="selectedBangleSize"
                class="customization-control ect-w-full ect-appearance-none ect-cursor-pointer ect-rounded-xl ect-px-4 ect-py-3.5 ect-pr-12 ect-font-body ect-text-sm ect-font-medium ect-text-charcoal focus:ect-outline-none ect-transition-all"
              >
                <option value="">None</option>
                <option v-for="size in availableBangleSizes" :key="size" :value="size">{{ size }}</option>
              </select>
              <span class="customization-chevron ect-pointer-events-none ect-absolute ect-right-2.5 ect-top-1/2 -ect-translate-y-1/2 ect-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-lg">
                <svg class="ect-w-3.5 ect-h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 011.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
              </span>
            </div>
          </section>

          <section v-if="isNecklaceProduct" class="ect-mb-6 ect-max-w-[16rem] ect-space-y-2">
            <label for="necklace-size" class="ect-block ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/48">
              Necklace Size
            </label>
            <div class="ect-relative">
              <select
                id="necklace-size"
                v-model="selectedNecklaceSize"
                class="customization-control ect-w-full ect-appearance-none ect-cursor-pointer ect-rounded-xl ect-px-4 ect-py-3.5 ect-pr-12 ect-font-body ect-text-sm ect-font-medium ect-text-charcoal focus:ect-outline-none ect-transition-all"
              >
                <option value="">None</option>
                <option v-for="size in availableNecklaceSizes" :key="size" :value="size">{{ size }}</option>
              </select>
              <span class="customization-chevron ect-pointer-events-none ect-absolute ect-right-2.5 ect-top-1/2 -ect-translate-y-1/2 ect-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-lg">
                <svg class="ect-w-3.5 ect-h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 011.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
              </span>
            </div>
          </section>

          <!-- Weight, carats and the certificate sit with the price, where they
               inform the decision. Two panels: the spec sheet is always open
               because it is part of the buying decision, while certification
               folds away as a follow-up question. -->
          <div
            v-if="hasSpecDetails || certificationRows.length"
            class="ect-mb-6 ect-border-t ect-border-sand"
          >
            <section v-if="hasSpecDetails" class="ect-py-5">
              <h2 class="ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/48 ect-mb-3">Details</h2>

              <dl v-if="specRows.length" class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-x-6 ect-gap-y-3">
                <div v-for="row in specRows" :key="row.label" class="ect-flex ect-flex-col ect-gap-0.5">
                  <dt class="ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/45">{{ row.label }}</dt>
                  <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-tabular-nums">{{ row.value }}</dd>
                </div>
              </dl>

              <ul
                v-if="product.details?.length"
                class="ect-list-none ect-m-0 ect-p-0 ect-space-y-2.5"
                :class="specRows.length ? 'ect-mt-4' : ''"
              >
                <li v-for="detail in product.details" :key="detail" class="ect-flex ect-gap-2.5">
                  <span class="ect-mt-2 ect-w-1 ect-h-1 ect-rounded-full ect-bg-gold-400 ect-shrink-0" />
                  <span class="ect-font-body ect-text-sm ect-leading-6 ect-text-charcoal/70">{{ detail }}</span>
                </li>
              </ul>

              <p class="ect-mt-4 ect-font-body ect-text-xs ect-leading-5 ect-text-charcoal/45">
                Weights and stone measurements may vary slightly. Photos are for representation purposes only.
              </p>
            </section>

            <section v-if="certificationRows.length" class="ect-border-t ect-border-sand ect-py-5">
              <h2 class="ect-m-0">
                <button
                  type="button"
                  @click="certificationOpen = !certificationOpen"
                  :aria-expanded="certificationOpen"
                  aria-controls="product-certification-panel"
                  class="ect-flex ect-w-full ect-items-center ect-justify-between ect-gap-4 ect-bg-transparent ect-p-0 ect-text-left focus:ect-outline-none focus-visible:ect-ring-2 focus-visible:ect-ring-gold-300 focus-visible:ect-ring-offset-4 focus-visible:ect-ring-offset-cream"
                >
                  <span class="ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/48">Certification</span>
                  <span
                    class="product-detail-accordion-chevron ect-flex ect-h-7 ect-w-7 ect-shrink-0 ect-items-center ect-justify-center ect-rounded-lg ect-text-gold-700"
                    :class="certificationOpen ? 'product-detail-accordion-chevron--open' : ''"
                    aria-hidden="true"
                  >
                    <svg class="ect-h-3.5 ect-w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 011.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                    </svg>
                  </span>
                </button>
              </h2>

              <!-- Animated on grid-template-rows so the panel slides without a
                   measured max-height; `inert` keeps the collapsed report link
                   out of the tab order. -->
              <div
                id="product-certification-panel"
                class="product-detail-accordion-panel"
                :class="certificationOpen ? 'product-detail-accordion-panel--open' : ''"
                :inert="!certificationOpen"
              >
                <div class="ect-overflow-hidden">
                  <dl class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-x-6 ect-gap-y-3 ect-pt-4">
                    <div v-for="row in certificationRows" :key="row.label" class="ect-flex ect-flex-col ect-gap-0.5">
                      <dt class="ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.14em] ect-text-charcoal/45">{{ row.label }}</dt>
                      <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-tabular-nums">{{ row.value }}</dd>
                    </div>
                  </dl>

                  <!-- The report itself, when the scan has been uploaded. -->
                  <a
                    v-if="certification?.fileUrl"
                    :href="certification.fileUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ect-mt-4 ect-inline-flex ect-items-center ect-gap-2 ect-rounded-full ect-border ect-border-gold-200 ect-bg-gold-50 ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-gold-700 ect-transition-colors hover:ect-border-gold-300 hover:ect-bg-gold-100"
                  >
                    <svg class="ect-h-4 ect-w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 5.25-3.75 8.25-9 9.75C6.75 20.25 3 17.25 3 12V5.25l9-3 9 3V12z" />
                    </svg>
                    View certificate
                  </a>

                  <p v-else class="ect-mt-4 ect-font-body ect-text-xs ect-leading-5 ect-text-charcoal/45">
                    The signed report is being scanned and will appear here shortly.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <VolumeDiscountInfo class="ect-mt-5" label="Volume discount available" />

          <!-- Primary action pair: a gold-edged aubergine bar with the wishlist
               square beside it, so the two read as one unit on the cream page. -->
          <div class="ect-mt-3 ect-flex ect-items-stretch ect-gap-3">
            <button
              type="button"
              @click="handleAddToCart"
              :disabled="addingToCart"
              class="ect-flex-1 ect-inline-flex ect-items-center ect-justify-center ect-gap-2.5 ect-px-7 ect-py-4 ect-rounded-lg ect-border ect-border-gold-400 ect-text-cream ect-font-body ect-text-sm ect-font-medium ect-uppercase ect-tracking-[0.18em] ect-shadow-sm ect-transition-colors"
              :class="addingToCart ? 'ect-bg-[var(--brand)] ect-opacity-70 ect-cursor-wait' : added ? 'ect-bg-[var(--brand-ink)]' : 'ect-bg-[var(--brand)] hover:ect-bg-[var(--brand-ink)]'"
            >
              <svg v-if="!addingToCart && !added" class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272" />
              </svg>
              <span v-if="addingToCart">Adding…</span>
              <span v-else>{{ added ? 'Added to Cart' : 'Add to Cart' }}</span>
            </button>

            <button
              type="button"
              @click="handleToggleWishlist"
              :aria-pressed="wishlisted"
              :aria-label="wishlisted ? 'Remove from wishlist' : 'Add to wishlist'"
              class="ect-w-14 sm:ect-w-16 ect-shrink-0 ect-inline-flex ect-items-center ect-justify-center ect-rounded-lg ect-border ect-border-gold-400 ect-bg-white ect-text-[var(--brand)] ect-shadow-sm ect-transition-colors hover:ect-bg-gold-50"
            >
              <svg class="ect-w-5 ect-h-5" :fill="wishlisted ? 'currentColor' : 'none'" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </button>
          </div>

          <RouterLink
            v-if="added"
            to="/cart"
            class="ect-mt-3 ect-flex ect-items-center ect-justify-center ect-px-6 ect-py-3.5 ect-rounded-lg ect-border ect-border-gold-400 ect-bg-white ect-font-body ect-text-sm ect-font-medium ect-uppercase ect-tracking-[0.18em] ect-text-[var(--brand)] hover:ect-bg-gold-50 ect-transition-colors"
          >
            View Cart
          </RouterLink>

          <p class="ect-mt-4 ect-mb-8 ect-font-body ect-text-xs ect-text-charcoal/45 ect-flex ect-items-center ect-gap-1.5">
            <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Free shipping · Insured delivery · Made to order
          </p>
        </section>
      </section>

      <section v-if="SITE_SETTINGS.enableReviews" class="ect-mt-16 ect-pt-12 ect-border-t ect-border-sand">
        <header class="ect-mb-6">
          <p class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">
            <span class="ect-w-6 ect-h-px ect-bg-gold-400" />
            Customer voices
          </p>
          <h2 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-text-charcoal">Reviews</h2>
        </header>
        <ul v-if="reviews.length" class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
          <li
            v-for="review in reviews"
            :key="review.id"
            class="ect-bg-white ect-rounded-2xl ect-border ect-border-sand ect-shadow-card ect-p-5"
          >
            <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-2 ect-mb-2">
              <StarRating :rating="review.rating" size="sm" />
              <span class="ect-font-body ect-text-sm ect-font-medium ect-text-charcoal">{{ review.author }}</span>
              <span class="ect-font-body ect-text-xs ect-text-charcoal/45">· {{ review.date }}</span>
            </div>
            <p class="ect-font-body ect-text-sm ect-leading-6 ect-text-charcoal/70 ect-m-0">{{ review.text }}</p>
          </li>
        </ul>
        <p v-else class="ect-bg-white ect-rounded-2xl ect-border ect-border-sand ect-shadow-card ect-px-6 ect-py-8 ect-font-body ect-text-sm ect-text-charcoal/50 ect-text-center">
          No reviews yet. Be the first to review this piece.
        </p>
      </section>

      <section v-if="relatedProducts.length" class="ect-mt-16 ect-pt-12 ect-border-t ect-border-sand">
        <header class="ect-mb-6 sm:ect-mb-8">
          <p class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">
            <span class="ect-w-6 ect-h-px ect-bg-gold-400" />
            Discover more
          </p>
          <h2 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-text-charcoal">You may also like</h2>
        </header>
        <ul class="ect-list-none ect-m-0 ect-p-0 ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6">
          <li v-for="related in relatedProducts" :key="related.slug" class="ect-h-full">
            <ProductCard
              :slug="related.slug"
              :title="related.title"
              :category="related.category"
              :material="related.material"
              :price="related.price"
              :images="related.images"
              :product="related"
            />
          </li>
        </ul>
      </section>
    </article>
  </section>

  <section v-else-if="loading" class="ect-pt-6 sm:ect-pt-14 ect-pb-28 ect-px-6 ect-bg-cream ect-min-h-screen ect-flex ect-flex-col ect-items-center ect-justify-center ect-text-center">
    <span class="ect-inline-block ect-w-10 ect-h-10 ect-rounded-full ect-border-2 ect-border-sand ect-border-t-charcoal ect-animate-spin ect-mb-5" aria-hidden="true" />
    <p class="ect-font-body ect-text-sm ect-uppercase ect-tracking-[0.15em] ect-text-charcoal/55">Loading product</p>
  </section>

  <section v-else class="ect-pt-6 sm:ect-pt-14 ect-pb-28 ect-px-6 ect-bg-cream ect-min-h-screen ect-flex ect-flex-col ect-items-center ect-justify-center ect-text-center">
    <span class="ect-w-20 ect-h-20 ect-rounded-full ect-bg-champagne ect-flex ect-items-center ect-justify-center ect-mb-6">
      <svg class="ect-w-9 ect-h-9 ect-text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    </span>
    <h1 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Product not found</h1>
    <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mb-7 ect-max-w-xs">The piece you're looking for doesn't exist or may have been removed.</p>
    <RouterLink
      to="/"
      class="ect-inline-flex ect-items-center ect-gap-2 ect-px-7 ect-py-3.5 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-full hover:ect-bg-noir ect-transition-colors"
    >
      <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
      Browse Collections
    </RouterLink>
  </section>
</template>

<style scoped>
.product-detail-stage--zooming {
  cursor: crosshair;
}

.product-detail-stage--zooming .product-detail-zoom-hint {
  opacity: 0;
}

.product-detail-zoom-hint {
  transition: opacity 0.2s ease;
}

@media (hover: none), (pointer: coarse) {
  .product-detail-zoom-hint {
    display: none;
  }
}

.product-detail-lens {
  position: absolute;
  width: 170px;
  height: 170px;
  border-radius: 9999px;
  pointer-events: none;
  background-repeat: no-repeat;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    0 0 0 1px rgba(201, 162, 39, 0.45),
    0 12px 30px rgba(28, 25, 23, 0.28);
  z-index: 5;
}

.product-detail-thumbs {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.product-detail-thumbs::-webkit-scrollbar {
  display: none;
}

.product-detail-gallery-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.product-detail-accordion-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.28s ease;
}

.product-detail-accordion-panel--open {
  grid-template-rows: 1fr;
}

.product-detail-accordion-chevron {
  background: rgba(241, 233, 218, 1);
  transition: transform 0.28s ease;
}

.product-detail-accordion-chevron--open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .product-detail-accordion-panel,
  .product-detail-accordion-chevron {
    transition: none;
  }
}

.customization-control {
  border: 1px solid rgba(235, 231, 226, 1);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: none;
}

.customization-control:hover {
  border-color: rgba(201, 162, 39, 0.55);
  background: rgba(255, 255, 255, 1);
}

.customization-control:focus {
  border-color: rgba(201, 162, 39, 0.85);
  box-shadow:
    0 0 0 3px rgba(201, 162, 39, 0.16);
}

.customization-chevron {
  background: rgba(241, 233, 218, 1);
  color: rgb(138 107 25 / 0.85);
}

select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: none;
  background-repeat: no-repeat;
}

select::-ms-expand {
  display: none;
}

.product-detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  align-items: start;
}

.product-detail-gallery {
  position: relative;
}

@media (min-width: 900px) {
  .product-detail-hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 3rem;
  }

  .product-detail-gallery {
    position: sticky;
    top: 8rem;
  }

  /* Thumbnails move to a vertical rail on the left of the stage. The rail is
     taken out of flow so a long list scrolls inside the stage's height instead
     of stretching the row; the stage stays first in the DOM, so reading and tab
     order are unchanged. */
  .product-detail-gallery-layout {
    display: block;
    position: relative;
  }

  .product-detail-gallery-layout--railed .product-detail-stage {
    width: auto;
    margin-left: 6.5rem;
  }

  /* 5rem thumb + room for the focus ring offset so it is not clipped. */
  .product-detail-thumbrail {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 5.5rem;
    flex-direction: column;
  }

  .product-detail-thumbs {
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    align-self: stretch;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .product-detail-thumbnav-icon {
    transform: rotate(90deg);
  }
}

@media (min-width: 1280px) {
  .product-detail-hero {
    gap: 4rem;
  }
}

.ect-line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
