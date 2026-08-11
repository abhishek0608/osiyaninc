<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useHeaderOffset } from '../composables/useHeaderOffset'
import { useHomepageSlides } from '../composables/useHomepageSlides'

const router = useRouter()
// The header is fixed; offset the first section by its live height so the hero
// card is never clipped behind it.
const { headerOffset } = useHeaderOffset()
const { slides, ensureHomepageSlidesLoaded } = useHomepageSlides()

const MOBILE_QUERY = '(max-width: 767px)'
const isMobile = ref(false)
let mobileQuery: MediaQueryList | null = null
function syncIsMobile(event: MediaQueryList | MediaQueryListEvent) {
  isMobile.value = event.matches
}

// Resolve the image a slide should show on the current device. On mobile we use
// the dedicated mobile asset (a mobile-only slide stores it in `imageUrl`); we
// never fall back to the desktop image there.
function resolveImageUrl(slide: { imageUrl?: string; mobileImageUrl?: string; device?: string } | null) {
  if (!slide) return ''
  if (isMobile.value) {
    if (String(slide.mobileImageUrl || '').trim()) return String(slide.mobileImageUrl)
    if ((slide.device || 'all') === 'mobile') return String(slide.imageUrl || '')
    return ''
  }
  return String(slide.imageUrl || '')
}

// Every active slide that has a usable image for the current device, in order.
const activeSlides = computed(() =>
  slides.value
    .filter((slide) => {
      if (slide?.active === false) return false
      const device = slide?.device || 'all'
      if (device !== 'all' && (isMobile.value ? device !== 'mobile' : device !== 'desktop')) {
        return false
      }
      return Boolean(resolveImageUrl(slide).trim())
    })
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
)

const activeSlideIndex = ref(0)
let autoRotateHandle: number | null = null

const currentSlide = computed(() => activeSlides.value[activeSlideIndex.value] || null)
const currentImageUrl = computed(() => resolveImageUrl(currentSlide.value))

// Overlay copy per slide. A slide with no copy shows its image clean (so banners
// with text baked in aren't doubled up); the editorial placeholder copy is only
// used when there are no slides at all.
const hasOverlayContent = computed(() => {
  const s = currentSlide.value
  if (!s) return false
  return Boolean(
    String(s.headline || '').trim() ||
      String(s.subheadline || '').trim() ||
      (String(s.ctaLabel || '').trim() && String(s.ctaHref || '').trim()),
  )
})

// Muted brushed-gold placeholder used when no campaign slides exist — diagonal
// stripes over a warm greige gradient, matching the design spec.
const placeholderBg =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 2px, transparent 2px, transparent 14px), linear-gradient(135deg, #c9bfa9 0%, #b3a890 55%, #9c8f76 100%)'

function goToSlide(index: number) {
  const total = activeSlides.value.length
  if (!total) {
    activeSlideIndex.value = 0
    return
  }
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
  autoRotateHandle = window.setInterval(showNextSlide, 5000)
}

function navigateTo(href: string) {
  const target = href.trim()
  if (!target) return
  if (target.startsWith('#')) {
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' })
    return
  }
  if (/^https?:\/\//i.test(target)) {
    window.location.href = target
    return
  }
  void router.push(target)
}

function handleSlideCta() {
  navigateTo(String(currentSlide.value?.ctaHref || ''))
}

watch(activeSlides, (next) => {
  if (!next.length) {
    activeSlideIndex.value = 0
    stopAutoRotate()
    return
  }
  if (activeSlideIndex.value >= next.length) activeSlideIndex.value = 0
  startAutoRotate()
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
  <section class="ect-bg-cream" :style="{ paddingTop: headerOffset + 16 + 'px' }">
    <div class="ect-max-w-7xl ect-mx-auto ect-px-4 sm:ect-px-6 lg:ect-px-8">
      <article
        class="ect-relative ect-overflow-hidden ect-rounded-3xl ect-shadow-card ect-bg-charcoal ect-aspect-[4/5] sm:ect-aspect-[16/9] lg:ect-aspect-[21/9]"
      >
        <!-- Carousel of campaign images -->
        <template v-if="activeSlides.length && currentSlide">
          <img
            :src="currentImageUrl"
            :alt="currentSlide.headline || 'Homepage campaign image'"
            fetchpriority="high"
            decoding="async"
            class="ect-absolute ect-inset-0 ect-h-full ect-w-full ect-object-cover"
          />

          <!-- Legibility scrim + editorial copy, only when the slide has copy -->
          <template v-if="hasOverlayContent">
            <div
              class="ect-pointer-events-none ect-absolute ect-inset-0 ect-bg-[linear-gradient(180deg,rgba(20,17,15,0.05)_0%,rgba(20,17,15,0.10)_45%,rgba(20,17,15,0.55)_100%)]"
            />
            <div class="ect-absolute ect-inset-x-0 ect-bottom-0 ect-p-6 sm:ect-p-8 lg:ect-p-10">
              <p
                v-if="currentSlide.subheadline"
                class="ect-font-body ect-text-[11px] ect-font-medium ect-uppercase ect-tracking-[0.22em] ect-text-cream/80"
              >
                {{ currentSlide.subheadline }}
              </p>
              <h1
                v-if="currentSlide.headline"
                class="ect-mt-2 ect-font-display ect-text-4xl sm:ect-text-5xl lg:ect-text-6xl ect-font-light ect-leading-[1.05] ect-text-cream [text-shadow:0_2px_12px_rgba(20,17,15,0.35)]"
              >
                {{ currentSlide.headline }}
              </h1>
              <button
                v-if="currentSlide.ctaLabel && currentSlide.ctaHref"
                type="button"
                class="ect-group ect-mt-4 ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-[12px] ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-cream ect-border-b ect-border-cream/50 ect-pb-1 hover:ect-border-cream ect-transition-colors"
                @click="handleSlideCta"
              >
                {{ currentSlide.ctaLabel }}
                <svg class="ect-w-3.5 ect-h-3.5 ect-transition-transform ect-duration-200 group-hover:ect-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </template>

          <!-- Prev / next arrows -->
          <template v-if="activeSlides.length > 1">
            <button
              type="button"
              aria-label="Show previous slide"
              class="ect-absolute ect-left-3 ect-top-1/2 -ect-translate-y-1/2 ect-z-[2] ect-inline-flex ect-h-9 ect-w-9 ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-white/15 ect-bg-black/30 ect-text-white ect-backdrop-blur-md ect-transition-all hover:ect-bg-white/20"
              @click="showPreviousSlide"
            >
              <svg class="ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Show next slide"
              class="ect-absolute ect-right-3 ect-top-1/2 -ect-translate-y-1/2 ect-z-[2] ect-inline-flex ect-h-9 ect-w-9 ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-white/15 ect-bg-black/30 ect-text-white ect-backdrop-blur-md ect-transition-all hover:ect-bg-white/20"
              @click="showNextSlide"
            >
              <svg class="ect-h-4 ect-w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </template>

          <!-- Slide indicator dots -->
          <div
            v-if="activeSlides.length > 1"
            class="ect-absolute ect-bottom-3 ect-left-1/2 -ect-translate-x-1/2 ect-z-[2] ect-flex ect-items-center ect-gap-2 ect-rounded-full ect-border ect-border-white/10 ect-bg-black/30 ect-px-2.5 ect-py-1.5 ect-backdrop-blur-md"
          >
            <button
              v-for="(slide, index) in activeSlides"
              :key="slide.id || `${slide.imageUrl}-${index}`"
              type="button"
              class="ect-h-2 ect-rounded-full ect-transition-all"
              :class="activeSlideIndex === index ? 'ect-w-7 ect-bg-white' : 'ect-w-2 ect-bg-white/40 hover:ect-bg-white/70'"
              :aria-label="`Show slide ${index + 1}`"
              @click="goToSlide(index)"
            />
          </div>
        </template>

        <!-- Editorial placeholder when no campaign slides are configured -->
        <template v-else>
          <div class="ect-absolute ect-inset-0" :style="{ background: placeholderBg }" />
          <span
            class="ect-absolute ect-left-5 ect-top-5 ect-inline-flex ect-items-center ect-gap-2 ect-rounded-md ect-bg-charcoal/15 ect-px-2.5 ect-py-1 ect-font-body ect-text-[10px] ect-uppercase ect-tracking-[0.16em] ect-text-cream/80"
          >
            Campaign image
          </span>
          <div
            class="ect-pointer-events-none ect-absolute ect-inset-0 ect-bg-[linear-gradient(180deg,rgba(20,17,15,0.05)_0%,rgba(20,17,15,0.10)_45%,rgba(20,17,15,0.55)_100%)]"
          />
          <div class="ect-absolute ect-inset-x-0 ect-bottom-0 ect-p-6 sm:ect-p-8 lg:ect-p-10">
            <p class="ect-font-body ect-text-[11px] ect-font-medium ect-uppercase ect-tracking-[0.22em] ect-text-cream/80">
              The Meenakari Edit
            </p>
            <h1 class="ect-mt-2 ect-font-display ect-text-4xl sm:ect-text-5xl lg:ect-text-6xl ect-font-light ect-leading-[1.05] ect-text-cream [text-shadow:0_2px_12px_rgba(20,17,15,0.35)]">
              Colour, set in gold
            </h1>
            <button
              type="button"
              class="ect-group ect-mt-4 ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-[12px] ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-cream ect-border-b ect-border-cream/50 ect-pb-1 hover:ect-border-cream ect-transition-colors"
              @click="navigateTo('#collections')"
            >
              Discover
              <svg class="ect-w-3.5 ect-h-3.5 ect-transition-transform ect-duration-200 group-hover:ect-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </template>
      </article>
    </div>
  </section>
</template>
