<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Category } from '../data/products'
import { SITE_SETTINGS } from '../config/site-settings'
import { useCollectionPreset } from '../composables/useCollectionPreset'
import { useHomepageSlides } from '../composables/useHomepageSlides'
import { useHeaderOffset } from '../composables/useHeaderOffset'

const router = useRouter()
const { setPresetAndScroll } = useCollectionPreset()
const { slides, loaded, ensureHomepageSlidesLoaded } = useHomepageSlides()

// A single refined chip treatment — quiet ivory with a gold hover — keeps the
// category row calm and luxurious rather than a row of coloured pills.
const CHIP_CLASS = 'ect-bg-pearl ect-border-sand ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 hover:ect-bg-gold-50'
const categories: { label: Category; color: string }[] = [
  { label: 'Rings', color: CHIP_CLASS },
  { label: 'Necklaces', color: CHIP_CLASS },
  { label: 'Bracelets', color: CHIP_CLASS },
  { label: 'Earrings', color: CHIP_CLASS },
]

const activeSlideIndex = ref(0)
let autoRotateHandle: number | null = null

// Matches the `max-width: 767px` breakpoint used to choose the mobile image below.
const MOBILE_QUERY = '(max-width: 767px)'
const isMobile = ref(false)
let mobileQuery: MediaQueryList | null = null

function syncIsMobile(event: MediaQueryList | MediaQueryListEvent) {
  isMobile.value = event.matches
}

// Offset the banner by the live header height so it's never hidden/clipped.
const { headerOffset, syncHeaderOffset } = useHeaderOffset()

// Resolve the image a slide should show on the current device. On mobile we
// only ever use a dedicated mobile asset — we never fall back to the desktop
// image. A mobile-only slide stores its asset in `imageUrl`, so that counts.
function resolveImageUrl(slide: { imageUrl?: string; mobileImageUrl?: string; device?: string } | null) {
  if (!slide) return ''
  if (isMobile.value) {
    if (String(slide.mobileImageUrl || '').trim()) return String(slide.mobileImageUrl)
    if ((slide.device || 'all') === 'mobile') return String(slide.imageUrl || '')
    return ''
  }
  return String(slide.imageUrl || '')
}

const activeSlides = computed(() =>
  slides.value
    .filter((slide) => {
      if (slide?.active === false) return false
      const device = slide?.device || 'all'
      if (device !== 'all' && (isMobile.value ? device !== 'mobile' : device !== 'desktop')) {
        return false
      }
      // Skip slides with no usable image for this device. On mobile this hides
      // any slide that lacks a mobile image instead of showing the desktop one.
      return Boolean(resolveImageUrl(slide).trim())
    })
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
)

const currentSlide = computed(() => activeSlides.value[activeSlideIndex.value] || null)

// Show a full-bleed skeleton until the first slides fetch settles, so the page
// doesn't flash the static fallback hero while the request is still in flight.
const showSkeleton = computed(() => !loaded.value)

// Pick the image src directly off isMobile rather than relying on a <source>
// srcset: stored images are base64 data URLs, and the comma in
// "data:image/webp;base64,…" is a candidate separator in srcset, which breaks
// the mobile source and falls back to the desktop image.
const currentImageUrl = computed(() => resolveImageUrl(currentSlide.value))

// Only overlay the text card when the slide actually has copy. Banners with
// text baked into the image show clean, with no redundant overlay on top.
const hasOverlayContent = computed(() => {
  const slide = currentSlide.value
  if (!slide) return false
  return Boolean(
    String(slide.headline || '').trim() ||
      String(slide.subheadline || '').trim() ||
      (String(slide.ctaLabel || '').trim() && String(slide.ctaHref || '').trim())
  )
})

function openCatalogWithCategory(cat: Category) {
  setPresetAndScroll(cat)
}

function goToSlide(index: number) {
  if (!activeSlides.value.length) {
    activeSlideIndex.value = 0
    return
  }
  const total = activeSlides.value.length
  activeSlideIndex.value = ((index % total) + total) % total
}

function showNextSlide() {
  goToSlide(activeSlideIndex.value + 1)
}

function showPreviousSlide() {
  goToSlide(activeSlideIndex.value - 1)
}

function stopAutoRotate() {
  if (autoRotateHandle != null) {
    window.clearInterval(autoRotateHandle)
    autoRotateHandle = null
  }
}

function startAutoRotate() {
  stopAutoRotate()
  if (activeSlides.value.length <= 1) return
  autoRotateHandle = window.setInterval(() => {
    showNextSlide()
  }, 5000)
}

function handleSlideCta() {
  const href = String(currentSlide.value?.ctaHref || '').trim()
  if (!href) return
  if (/^https?:\/\//i.test(href)) {
    window.location.href = href
    return
  }
  void router.push(href)
}

watch(activeSlides, (nextSlides) => {
  if (!nextSlides.length) {
    activeSlideIndex.value = 0
    stopAutoRotate()
    return
  }
  if (activeSlideIndex.value >= nextSlides.length) activeSlideIndex.value = 0
  startAutoRotate()
})

// The header gains/loses its mobile search bar across the breakpoint, changing
// its height; re-measure once the new layout has painted.
watch(isMobile, () => {
  void nextTick(syncHeaderOffset)
})

onMounted(async () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mobileQuery = window.matchMedia(MOBILE_QUERY)
    syncIsMobile(mobileQuery)
    mobileQuery.addEventListener('change', syncIsMobile)
  }
  await ensureHomepageSlidesLoaded()
  startAutoRotate()
})

onUnmounted(() => {
  stopAutoRotate()
  mobileQuery?.removeEventListener('change', syncIsMobile)
})
</script>

<template>
  <!-- Loading skeleton: mirrors the banner frame so layout doesn't shift when
       the real slide swaps in. Shown until the first fetch settles. -->
  <section
    v-if="showSkeleton"
    class="ect-relative ect-overflow-hidden ect-bg-charcoal"
    :style="{ paddingTop: headerOffset + 'px' }"
    aria-busy="true"
    aria-label="Loading homepage banner"
  >
    <div
      class="ect-relative ect-animate-pulse ect-bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.10)_45%,rgba(255,255,255,0.04)_90%)]"
      :style="{ height: 'calc(100svh - ' + (headerOffset + 100) + 'px)' }"
    />
  </section>

  <section
    v-else-if="activeSlides.length && currentSlide"
    class="ect-relative ect-overflow-hidden ect-bg-charcoal ect-text-white"
    :style="{ paddingTop: headerOffset + 'px' }"
  >
    <!-- Fixed-height banner frame: full viewport minus the live header height.
         The image is stretched to fill the whole frame (object-fill) so there
         are no letterbox bands and nothing is cropped. -->
    <div class="ect-relative" :style="{ height: 'calc(100svh - ' + (headerOffset + 100) + 'px)' }">
      <img
        :src="currentImageUrl"
        :alt="currentSlide.headline || 'Homepage campaign image'"
        fetchpriority="high"
        decoding="async"
        class="ect-block ect-h-full ect-w-full ect-object-fill"
      />

      <!-- Text overlay only for slides that provide copy. -->
      <template v-if="hasOverlayContent">
        <div class="ect-pointer-events-none ect-absolute ect-inset-0 ect-bg-[linear-gradient(90deg,rgba(18,13,12,0.62)_0%,rgba(18,13,12,0.30)_42%,rgba(18,13,12,0.10)_72%,transparent_100%)]" />
        <div class="ect-pointer-events-none ect-absolute ect-inset-x-0 ect-bottom-0 ect-h-1/2 ect-bg-[linear-gradient(180deg,transparent,rgba(18,13,12,0.45))]" />
        <div class="ect-absolute ect-inset-0 ect-flex ect-flex-col ect-justify-end">
          <div class="ect-mx-auto ect-w-full ect-max-w-7xl ect-px-5 sm:ect-px-6 lg:ect-px-8 ect-pb-10 sm:ect-pb-14 lg:ect-pb-16">
            <div class="ect-max-w-3xl ect-rounded-[2rem] ect-border ect-border-white/12 ect-bg-[linear-gradient(135deg,rgba(18,13,12,0.40),rgba(18,13,12,0.18))] ect-p-6 sm:ect-p-8 lg:ect-p-10 ect-shadow-[0_24px_80px_-28px_rgba(0,0,0,0.65)] ect-backdrop-blur-md">
              <p class="ect-mb-4 ect-inline-flex ect-items-center ect-gap-2 ect-rounded-full ect-border ect-border-white/15 ect-bg-white/10 ect-px-3 ect-py-1 ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.18em] ect-text-white/85">
                <span class="ect-h-1.5 ect-w-1.5 ect-rounded-full ect-bg-gold-300" />
                Curated Campaign
              </p>
              <h1
                v-if="currentSlide.headline"
                class="ect-font-display ect-text-4xl ect-font-light ect-leading-[0.98] sm:ect-text-6xl lg:ect-text-[5.25rem]"
              >
                {{ currentSlide.headline }}
              </h1>
              <p
                v-if="currentSlide.subheadline"
                class="ect-mt-5 ect-max-w-2xl ect-font-body ect-text-base ect-leading-7 ect-text-white/78 sm:ect-text-lg"
              >
                {{ currentSlide.subheadline }}
              </p>

              <div class="ect-mt-8 ect-flex ect-flex-wrap ect-gap-3">
                <button
                  v-if="currentSlide.ctaLabel && currentSlide.ctaHref"
                  type="button"
                  class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-white ect-px-6 ect-py-3 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-shadow-lg ect-shadow-black/10 ect-transition-all hover:-ect-translate-y-0.5 hover:ect-bg-champagne/60"
                  @click="handleSlideCta"
                >
                  {{ currentSlide.ctaLabel }}
                </button>
                <a
                  href="#collections"
                  class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-white/20 ect-bg-white/10 ect-px-6 ect-py-3 ect-font-body ect-text-sm ect-font-semibold ect-text-white ect-transition-all hover:-ect-translate-y-0.5 hover:ect-bg-white/18"
                >
                  Explore Collections
                </a>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Prev / next arrows -->
      <div
        v-if="activeSlides.length > 1"
        class="ect-pointer-events-none ect-absolute ect-inset-y-0 ect-left-0 ect-right-0 ect-z-[3]"
      >
        <button
          type="button"
          aria-label="Show previous homepage image"
          class="ect-pointer-events-auto ect-absolute ect-left-3 sm:ect-left-4 lg:ect-left-6 ect-top-1/2 -ect-translate-y-1/2 ect-inline-flex ect-h-11 ect-w-11 sm:ect-h-12 sm:ect-w-12 ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-white/15 ect-bg-black/30 ect-text-white ect-shadow-[0_12px_32px_-18px_rgba(0,0,0,0.7)] ect-backdrop-blur-md ect-transition-all hover:-ect-translate-y-[calc(50%+2px)] hover:ect-bg-white/18"
          @click="showPreviousSlide"
        >
          <svg class="ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Show next homepage image"
          class="ect-pointer-events-auto ect-absolute ect-right-3 sm:ect-right-4 lg:ect-right-6 ect-top-1/2 -ect-translate-y-1/2 ect-inline-flex ect-h-11 ect-w-11 sm:ect-h-12 sm:ect-w-12 ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-white/15 ect-bg-black/30 ect-text-white ect-shadow-[0_12px_32px_-18px_rgba(0,0,0,0.7)] ect-backdrop-blur-md ect-transition-all hover:-ect-translate-y-[calc(50%+2px)] hover:ect-bg-white/18"
          @click="showNextSlide"
        >
          <svg class="ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      <!-- Slide indicator dots -->
      <div
        v-if="activeSlides.length > 1"
        class="ect-absolute ect-bottom-4 sm:ect-bottom-6 ect-left-1/2 -ect-translate-x-1/2 ect-z-[3] ect-flex ect-flex-wrap ect-items-center ect-gap-2 ect-rounded-full ect-border ect-border-white/10 ect-bg-black/30 ect-px-3 ect-py-2 ect-backdrop-blur-md"
      >
        <button
          v-for="(slide, index) in activeSlides"
          :key="slide.id || `${slide.imageUrl}-${index}`"
          type="button"
          class="ect-h-2.5 ect-rounded-full ect-transition-all"
          :class="activeSlideIndex === index ? 'ect-w-10 ect-bg-white' : 'ect-w-2.5 ect-bg-white/35 hover:ect-bg-white/65'"
          :aria-label="`Show slide ${index + 1}`"
          @click="goToSlide(index)"
        />
      </div>
    </div>
  </section>

  <section v-else class="ect-relative ect-overflow-hidden ect-text-ink ect-pt-32 sm:ect-pt-40 ect-pb-12 sm:ect-pb-16 ect-px-6">
    <span class="ect-absolute ect-inset-0 ect-bg-gradient-to-br ect-from-cream ect-via-pearl ect-to-champagne/50" />
    <span class="ect-absolute ect-inset-0 ect-bg-[radial-gradient(ellipse_60%_40%_at_80%_-10%,_rgba(201,162,39,0.10),transparent)]" />
    <span class="ect-absolute ect-inset-x-0 ect-top-0 ect-h-px ect-bg-[linear-gradient(90deg,transparent,rgba(201,162,39,0.4),transparent)]" />

    <article class="ect-relative ect-max-w-7xl ect-mx-auto ect-grid ect-grid-cols-1 lg:ect-grid-cols-2 ect-gap-10 ect-items-center ect-fade-up">
      <section>
        <p class="ect-inline-flex ect-items-center ect-gap-2.5 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.22em] ect-text-gold-700 ect-mb-5">
          <span class="ect-w-8 ect-h-px ect-bg-gold-400" />
          Handcrafted in Jaipur
        </p>
        <h1 class="ect-font-display ect-text-4xl sm:ect-text-6xl ect-font-light ect-tracking-[0.01em] ect-mb-5 ect-leading-[1.05] ect-text-charcoal">
          Crafted for<br /><span class="ect-italic ect-text-gold-600">the moment</span> that matters
        </h1>
        <p class="ect-font-body ect-text-base sm:ect-text-lg ect-text-ink/70 ect-max-w-lg ect-mb-6 ect-leading-relaxed">Timeless jewellery that tells your story — hand-finished by master artisans using conflict-free stones and BIS-hallmarked gold.</p>
        <p class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-sm ect-text-charcoal/60 ect-mb-7">
          <span class="ect-h-1 ect-w-1 ect-rounded-full ect-bg-gold-400" />
          Explore our designs in <span class="ect-font-semibold ect-text-gold-700">9 carat gold</span>
        </p>
        <nav class="ect-flex ect-flex-wrap ect-gap-2 ect-mb-8" aria-label="Shop by category">
          <button
            v-for="cat in categories"
            :key="cat.label"
            type="button"
            class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-4 ect-py-2 ect-border ect-rounded-full ect-font-body ect-text-xs ect-transition-all ect-duration-200"
            :class="cat.color"
            @click="openCatalogWithCategory(cat.label)"
          >
            <svg v-if="cat.label === 'Rings'" class="ect-w-3.5 ect-h-3.5 ect-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" />
            </svg>
            <svg v-else-if="cat.label === 'Necklaces'" class="ect-w-3.5 ect-h-3.5 ect-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" d="M4 5Q5 16 12 18Q19 16 20 5" />
              <circle cx="12" cy="19.5" r="1.8" fill="currentColor" stroke="none" />
            </svg>
            <svg v-else-if="cat.label === 'Bracelets'" class="ect-w-3.5 ect-h-3.5 ect-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" d="M7.5 19.5A9 9 0 1 1 16.5 19.5" />
            </svg>
            <svg v-else-if="cat.label === 'Earrings'" class="ect-w-3.5 ect-h-3.5 ect-shrink-0" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="4.5" r="2" />
              <path d="M12 7C9.5 9.5 9.5 17 12 20C14.5 17 14.5 9.5 12 7Z" />
            </svg>
            <svg v-else-if="cat.label === 'Mangal Sutra'" class="ect-w-3.5 ect-h-3.5 ect-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 4L12 18L19 4" />
              <circle cx="8.5" cy="9" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="10.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="9" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="13.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            {{ cat.label }}
          </button>
        </nav>
        <a href="#collections" class="ect-group ect-inline-flex ect-items-center ect-gap-2.5 ect-px-7 ect-py-3.5 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-full hover:ect-bg-noir ect-transition-colors">
          Explore Collections
          <svg class="ect-w-4 ect-h-4 ect-transition-transform ect-duration-200 group-hover:ect-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </a>
      </section>

      <figure v-if="SITE_SETTINGS.enableOffers" class="ect-rounded-2xl ect-overflow-hidden ect-ring-1 ect-ring-gold-200/60 ect-shadow-luxe">
        <img src="/offer-banner.webp" alt="Special offers on fine jewellery" loading="lazy" decoding="async" class="ect-w-full ect-h-auto ect-object-cover" />
      </figure>
    </article>

    <ul class="ect-relative ect-max-w-7xl ect-mx-auto ect-mt-12 ect-pt-8 ect-border-t ect-border-sand ect-grid ect-grid-cols-2 sm:ect-grid-cols-4 ect-gap-4 ect-list-none ect-m-0 ect-p-0">
      <li class="ect-text-center">
        <p class="ect-font-display ect-text-3xl ect-text-charcoal">500+</p>
        <p class="ect-font-body ect-text-[11px] ect-text-ink/45 ect-uppercase ect-tracking-[0.18em] ect-mt-1">Unique Designs</p>
      </li>
      <li class="ect-text-center">
        <p class="ect-font-display ect-text-3xl ect-text-charcoal">9ct</p>
        <p class="ect-font-body ect-text-[11px] ect-text-ink/45 ect-uppercase ect-tracking-[0.18em] ect-mt-1">Gold Designs</p>
      </li>
      <li class="ect-text-center">
        <p class="ect-font-display ect-text-3xl ect-text-charcoal">BIS</p>
        <p class="ect-font-body ect-text-[11px] ect-text-ink/45 ect-uppercase ect-tracking-[0.18em] ect-mt-1">Hallmarked</p>
      </li>
      <li class="ect-text-center">
        <p class="ect-font-display ect-text-3xl ect-text-charcoal">Free</p>
        <p class="ect-font-body ect-text-[11px] ect-text-ink/45 ect-uppercase ect-tracking-[0.18em] ect-mt-1">Pan-India Shipping</p>
      </li>
    </ul>
  </section>
</template>
