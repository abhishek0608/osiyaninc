<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { SERVICE_OFFERINGS as services, getServiceOfferingById } from '../data/services-catalog'
import { useServiceBooking } from '../composables/useServiceBooking'

const route = useRoute()
const { openBookingForService } = useServiceBooking()

// ─── Scroll tracking ──────────────────────────────────────────────────────────
const activeId = ref('cad')
/** While set, ignore scroll-driven activeId updates (stops nav hash + smooth scroll fighting onScroll). */
let ignoreScrollSectionSyncUntil = 0

function onScroll() {
  if (Date.now() < ignoreScrollSectionSyncUntil) return
  for (const svc of [...services].reverse()) {
    const el = document.getElementById(svc.id)
    if (el && el.getBoundingClientRect().top <= 120) {
      activeId.value = svc.id
      return
    }
  }
  activeId.value = 'cad'
}

function scrollTo(id: string) {
  activeId.value = id
  ignoreScrollSectionSyncUntil = Math.max(ignoreScrollSectionSyncUntil, Date.now() + 900)
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function focusServiceFromRoute() {
  const requested = String(route.query.service || route.hash.replace(/^#/, '') || '').trim()
  // getServiceOfferingById also maps aliases like "full-pipeline" (used by
  // chat deep-links) onto the matching catalog entry.
  const service = getServiceOfferingById(requested)
  if (!service) return
  await nextTick()
  requestAnimationFrame(() => scrollTo(service.id))
  if (route.query.book === '1') openBookingForService(service)
}

watch(
  () => route.fullPath,
  () => {
    void focusServiceFromRoute()
  }
)

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  void focusServiceFromRoute()
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <main class="ect-min-h-screen ect-bg-cream ect-pt-28">

    <!-- ── Hero ─────────────────────────────────────────────────────────────── -->
    <section class="ect-relative ect-overflow-hidden ect-bg-charcoal ect-text-cream ect-py-16 sm:ect-py-24 ect-px-6">
      <div class="ect-absolute ect-inset-0 ect-opacity-[0.035]" style="background-image:repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%);background-size:24px 24px" />
      <div class="ect-relative ect-max-w-4xl ect-mx-auto">
        <p class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.22em] ect-text-gold-400 ect-mb-5">
          <span class="ect-w-6 ect-h-px ect-bg-gold-400" />
          Must Have
        </p>
        <h1 class="ect-font-display ect-text-4xl sm:ect-text-5xl lg:ect-text-6xl ect-font-light ect-leading-tight ect-mb-6">
          Our Craft,<br class="ect-hidden sm:ect-block" /> Our Process
        </h1>
        <p class="ect-font-body ect-text-base ect-text-cream/60 ect-max-w-xl ect-mb-10">
          From a spark of inspiration to the finished piece on your finger — every stage is handled in-house by our craftspeople in Jaipur.
        </p>
        <ol class="ect-flex ect-flex-wrap ect-items-center ect-gap-0 ect-list-none ect-m-0 ect-p-0">
          <li v-for="(svc, i) in services" :key="svc.id" class="ect-flex ect-items-center">
            <button @click="scrollTo(svc.id)" class="ect-flex ect-items-center ect-gap-2 ect-px-4 ect-py-2 ect-rounded-full ect-border ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.1em] ect-transition-all ect-duration-200"
              :class="activeId === svc.id ? 'ect-border-gold-400 ect-bg-gold-400/15 ect-text-gold-200' : 'ect-border-white/10 ect-text-cream/50 hover:ect-border-white/30 hover:ect-text-cream/80'">
              <span class="ect-opacity-50 ect-text-[10px]">{{ svc.no }}</span>{{ svc.title }}
            </button>
            <span v-if="i < services.length - 1" class="ect-w-5 ect-h-px ect-bg-white/10 ect-mx-1 ect-shrink-0" />
          </li>
        </ol>
      </div>
    </section>

    <!-- ── Sticky nav ────────────────────────────────────────────────────────── -->
    <nav class="ect-sticky ect-top-16 ect-z-40 ect-bg-white/95 ect-backdrop-blur-md ect-border-b ect-border-sand">
      <ul class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-flex ect-list-none ect-m-0 ect-p-0 ect-overflow-x-auto">
        <li v-for="svc in services" :key="svc.id">
          <button @click="scrollTo(svc.id)" class="ect-relative ect-px-4 sm:ect-px-6 ect-py-4 ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.1em] ect-whitespace-nowrap ect-transition-colors ect-duration-200 after:ect-absolute after:ect-bottom-0 after:ect-left-0 after:ect-right-0 after:ect-h-0.5 after:ect-transition-all after:ect-duration-200"
            :class="activeId === svc.id ? 'ect-text-charcoal after:ect-bg-gold-500' : 'ect-text-charcoal/45 hover:ect-text-charcoal after:ect-bg-transparent'">
            <span class="ect-hidden sm:ect-inline ect-text-[10px] ect-font-normal ect-opacity-50 ect-mr-1">{{ svc.no }}</span>{{ svc.title }}
          </button>
        </li>
      </ul>
    </nav>

    <!-- ── Service sections ──────────────────────────────────────────────────── -->
    <template v-for="(svc, idx) in services" :key="svc.id">
      <article :id="svc.id" class="ect-scroll-mt-32" :class="idx % 2 === 0 ? 'ect-bg-cream' : 'ect-bg-white'">
        <div class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-py-16 sm:ect-py-20 ect-grid ect-grid-cols-1 lg:ect-grid-cols-[1fr_1.1fr] ect-gap-10 lg:ect-gap-16 ect-items-start">

          <!-- Left: info + book CTA -->
          <div class="lg:ect-sticky lg:ect-top-36">
            <p class="ect-font-display ect-text-[80px] sm:ect-text-[100px] ect-font-light ect-leading-none ect-text-gold-200 ect-select-none ect--ml-1">{{ svc.no }}</p>
            <h2 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect--mt-4 ect-mb-1">{{ svc.title }}</h2>
            <p class="ect-font-body ect-text-sm ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-5">{{ svc.subtitle }}</p>
            <p class="ect-font-body ect-text-[15px] ect-leading-relaxed ect-text-charcoal/65 ect-mb-6">{{ svc.desc }}</p>
            <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-3">
              <span class="ect-inline-flex ect-items-center ect-gap-2 ect-px-4 ect-py-2 ect-rounded-full ect-bg-champagne/50 ect-border ect-border-sand ect-font-body ect-text-xs ect-font-semibold ect-text-gold-800">
                <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {{ svc.duration }}
              </span>
              <button
                type="button"
                @click="openBookingForService(svc)"
                class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-2.5 ect-rounded-full ect-bg-charcoal ect-text-cream ect-font-body ect-text-sm ect-font-semibold hover:ect-bg-noir ect-transition-colors ect-duration-200"
              >
                <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5"/></svg>
                Book this Service
              </button>
            </div>
          </div>

          <!-- Right: step flow timeline -->
          <div>
            <ol class="ect-list-none ect-m-0 ect-p-0 ect-relative">
              <span class="ect-absolute ect-left-[18px] ect-top-8 ect-bottom-8 ect-w-px ect-bg-sand" aria-hidden="true" />
              <li v-for="(step, j) in svc.steps" :key="step.label" class="ect-relative ect-flex ect-gap-5 ect-pb-8 last:ect-pb-0">
                <span class="ect-relative ect-z-10 ect-shrink-0 ect-flex ect-items-center ect-justify-center ect-w-9 ect-h-9 ect-rounded-full ect-bg-white ect-ring-2 ect-ring-gold-300 ect-font-body ect-text-xs ect-font-bold ect-text-gold-700">{{ j + 1 }}</span>
                <div class="ect-pt-1.5">
                  <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-1">{{ step.label }}</p>
                  <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-leading-relaxed">{{ step.desc }}</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </article>
      <div v-if="idx < services.length - 1" class="ect-h-px ect-bg-sand" />
    </template>

    <!-- ── Bottom CTA ────────────────────────────────────────────────────────── -->
    <section class="ect-bg-charcoal ect-text-cream ect-py-16 sm:ect-py-20 ect-px-6">
      <div class="ect-max-w-3xl ect-mx-auto ect-text-center">
        <h2 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-mb-4">Start your journey with us</h2>
        <p class="ect-font-body ect-text-sm ect-text-cream/55 ect-mb-8 ect-max-w-lg ect-mx-auto">Whether you want a custom creation from scratch or need help with CAD, wax, casting, and finishing — book a service above or chat with Priya.</p>
        <RouterLink to="/chat" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-7 ect-py-3.5 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold hover:ect-bg-noir ect-transition-colors">
          <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
          Chat with Priya
        </RouterLink>
      </div>
    </section>

  </main>
</template>
