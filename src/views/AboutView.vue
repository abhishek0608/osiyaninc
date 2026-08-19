<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useSiteConfig } from '../composables/useSiteConfig'

const { aboutContent, ensureSiteConfigLoaded } = useSiteConfig()

const activeTab = ref<'about' | 'contact'>('about')
const name = ref('')
const email = ref('')
const message = ref('')
const submitted = ref(false)

const values = [
  { n: '01', title: 'Precision', desc: 'Advanced CAD technology and state-of-the-art machinery for flawless execution in every piece.' },
  { n: '02', title: 'Craftsmanship', desc: 'A skilled workforce with years of expertise, finishing every creation to the highest standard.' },
  { n: '03', title: 'Sustainability', desc: 'A secure, efficient and sustainable manufacturing environment in the Jaipur SEZ.' },
]

// Bundled defaults, shown until real photos/copy are configured in the
// internal workspace (Internal → About page).
const defaultJourney = [
  {
    year: '2004',
    place: 'Mumbai',
    title: 'Grace Jewels',
    desc: 'Our journey begins in Mumbai with Grace Jewels — a workshop built on the belief that fine jewellery should be as precise as it is poetic. Here we learn the disciplines that still guide every piece we make.',
    imageUrl: '/pendant-1.jpg',
  },
  {
    year: '2010',
    place: 'New York',
    title: 'Osiyan Inc',
    desc: 'Expansion to New York with Osiyan Inc brings us face to face with the world’s most demanding retailers and brands — refining our craft, our standards, and our understanding of the evolving customer.',
    imageUrl: '/earring-1.jpg',
  },
  {
    year: '2024',
    place: 'Jaipur',
    title: 'Kiana Jewels',
    desc: 'Kiana Jewels Private Limited is established in the Sitapura SEZ, Jaipur — a state-of-the-art facility dedicated to semi-mount, fine, lab-grown diamond and colored stone jewellery for clients worldwide.',
    imageUrl: '/necklace-1.jpg',
  },
]

const heroEyebrow = computed(() => aboutContent.value.heroEyebrow || 'Kiana Jewels · Jaipur')
const heroHeadline = computed(() => aboutContent.value.heroHeadline || 'Brilliance by Design')
const heroSubheadline = computed(
  () =>
    aboutContent.value.heroSubheadline ||
    'Reinventing fine jewellery with precision, craftsmanship and stories told in every stone.',
)

// Configured milestones (with the team's own group/founder photos) replace the
// bundled defaults as soon as at least one active milestone exists.
const journey = computed(() => {
  const configured = aboutContent.value.journey.filter((step) => step.active)
  return configured.length ? configured : defaultJourney
})

// Founders & team portraits — the section only renders once members are
// configured in the internal workspace.
const team = computed(() => aboutContent.value.team.filter((member) => member.active))

// Animated counters (count up when scrolled into view, like the reference site)
const stats = [
  { target: 15, suffix: '+', label: 'Years of craft' },
  { target: 500, suffix: '+', label: 'Unique designs' },
  { target: 10, suffix: 'k+', label: 'Happy customers' },
  { target: null, text: 'BIS', label: 'Hallmarked gold' },
] as const

const counts = ref(stats.map(() => 0))
const statsEl = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let counted = false

function runCounters() {
  if (counted) return
  counted = true
  const duration = 1600
  const start = performance.now()
  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1)
    const ease = 1 - Math.pow(1 - t, 3)
    counts.value = stats.map(s => (s.target === null ? 0 : Math.round(s.target * ease)))
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  // rAF can be throttled (background tab) — guarantee final values
  setTimeout(() => { counts.value = stats.map(s => s.target ?? 0) }, duration + 200)
}

function observeStats() {
  if (observer || !statsEl.value) return
  observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) runCounters()
  }, { threshold: 0.3 })
  observer.observe(statsEl.value)
}

watch(activeTab, tab => {
  if (tab === 'about') nextTick(observeStats)
  else { observer?.disconnect(); observer = null }
})

function handleSubmit() {
  submitted.value = true
}

function setTab(tab: 'about' | 'contact') {
  activeTab.value = tab
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToStory() {
  document.getElementById('about-tabs')?.scrollIntoView({ behavior: 'smooth' })
}

onMounted(() => {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'contact') activeTab.value = hash
  observeStats()
  void ensureSiteConfigLoaded()
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <main class="ect-min-h-screen ect-bg-pearl ect-pt-6">

    <!-- ── FULL-BLEED HERO (Our Story) ── -->
    <section
      v-if="activeTab === 'about'"
      class="ect-relative ect-overflow-hidden ect-bg-noir ect-text-cream ect-flex ect-flex-col ect-items-center ect-justify-center ect-text-center ect-px-6 ect-h-[calc(100vh-7rem)] ect-min-h-[540px]"
    >
      <span class="ect-absolute ect-inset-0 ect-bg-[radial-gradient(ellipse_75%_65%_at_50%_35%,rgba(201,162,39,0.14),transparent)]" />
      <span class="ect-absolute ect-inset-0 ect-bg-[radial-gradient(ellipse_45%_40%_at_85%_90%,rgba(241,233,218,0.05),transparent)]" />
      <!-- faint line-art diamond -->
      <svg class="ect-absolute ect-w-[520px] ect-h-[520px] ect-text-cream/[0.045] ect-left-1/2 ect-top-1/2 -ect-translate-x-1/2 -ect-translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.35">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 3h12l4 6-10 12L2 9l4-6zM2 9h20M9.5 3L7 9l5 12M14.5 3L17 9l-5 12" />
      </svg>

      <div class="ect-relative">
        <p class="ect-font-display ect-italic ect-text-lg sm:ect-text-xl ect-text-gold-300 ect-mb-6">{{ heroEyebrow }}</p>
        <h1 class="ect-font-display ect-font-light ect-text-5xl sm:ect-text-7xl ect-leading-[1.08] ect-tracking-display-tight ect-mb-7">
          {{ heroHeadline }}
        </h1>
        <p class="ect-font-body ect-text-sm sm:ect-text-base ect-text-cream/60 ect-max-w-md ect-mx-auto ect-leading-relaxed">
          {{ heroSubheadline }}
        </p>
      </div>

      <!-- scroll cue -->
      <span class="ect-absolute ect-bottom-8 ect-inset-x-0 ect-flex ect-justify-center">
        <button
          @click="scrollToStory"
          aria-label="Scroll to our story"
          class="ect-w-10 ect-h-10 ect-rounded-full ect-border ect-border-cream/20 ect-flex ect-items-center ect-justify-center ect-text-cream/60 hover:ect-text-cream hover:ect-border-cream/50 ect-transition-colors ect-animate-bounce ect-bg-transparent"
        >
          <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        </button>
      </span>
    </section>

    <!-- Compact hero strip for contact -->
    <section
      v-else
      class="ect-relative ect-overflow-hidden ect-bg-noir ect-text-cream ect-py-20 sm:ect-py-24 ect-px-6 ect-text-center"
    >
      <span class="ect-absolute ect-inset-0 ect-bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(201,162,39,0.13),transparent)]" />
      <div class="ect-relative">
        <p class="ect-font-display ect-italic ect-text-lg ect-text-gold-300 ect-mb-4">Get in touch</p>
        <h1 class="ect-font-display ect-font-light ect-text-4xl sm:ect-text-6xl ect-tracking-display-tight">Let's talk.</h1>
      </div>
    </section>

    <!-- Sticky tab bar -->
    <nav id="about-tabs" class="ect-sticky ect-top-[calc(theme(spacing.16)+theme(spacing.8))] sm:ect-top-16 ect-z-40 ect-bg-pearl/95 ect-backdrop-blur-md ect-border-b ect-border-charcoal/[0.08]">
      <ul class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-flex ect-justify-center ect-gap-2 sm:ect-gap-10 ect-list-none ect-m-0 ect-p-0">
        <li v-for="tab in (['about', 'contact'] as const)" :key="tab">
          <button
            @click="setTab(tab)"
            class="ect-relative ect-px-4 sm:ect-px-1 ect-py-5 ect-font-body ect-text-[12px] ect-font-medium ect-uppercase ect-tracking-[0.18em] ect-transition-colors ect-duration-200 ect-bg-transparent"
            :class="activeTab === tab ? 'ect-text-charcoal' : 'ect-text-charcoal/35 hover:ect-text-charcoal/70'"
          >
            {{ tab === 'about' ? 'Our Story' : 'Contact' }}
            <span
              class="ect-absolute ect-bottom-0 ect-left-0 ect-right-0 ect-h-px ect-transition-all ect-duration-200"
              :class="activeTab === tab ? 'ect-bg-gold-400' : 'ect-bg-transparent'"
            />
          </button>
        </li>
      </ul>
    </nav>

    <!-- ── ABOUT ── -->
    <template v-if="activeTab === 'about'">

      <!-- Who we are — centered editorial statement -->
      <section class="ect-max-w-3xl ect-mx-auto ect-px-6 ect-py-24 sm:ect-py-32 ect-text-center">
        <p class="ect-font-display ect-italic ect-text-xl ect-text-gold-700 ect-mb-8">Who we are</p>
        <p class="ect-font-display ect-font-light ect-text-2xl sm:ect-text-[2rem] ect-leading-display-relaxed ect-text-charcoal">
          We are a modern jewellery manufacturing house specializing in semi-mount, fine, lab-grown diamond
          and colored stone jewellery. With advanced technology, skilled craftsmanship and deep industry
          expertise, we transform creative ideas into exceptional collections for clients and brands worldwide.
        </p>
        <span class="ect-inline-block ect-w-12 ect-h-px ect-bg-gold-400 ect-mt-10" />
      </section>

      <!-- Journey — alternating editorial rows -->
      <section class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-pb-8">
        <p class="ect-font-display ect-italic ect-text-xl ect-text-gold-700 ect-text-center ect-mb-16">Our journey</p>

        <article
          v-for="(step, i) in journey"
          :key="`${step.title}-${i}`"
          class="ect-grid ect-grid-cols-1 lg:ect-grid-cols-2 ect-gap-10 lg:ect-gap-20 ect-items-center ect-mb-24 sm:ect-mb-28"
        >
          <figure
            class="ect-relative ect-overflow-hidden ect-aspect-[4/3] ect-bg-cream ect-m-0"
            :class="i % 2 === 1 ? 'lg:ect-order-2' : ''"
          >
            <img
              v-if="step.imageUrl"
              :src="step.imageUrl"
              :alt="`${step.title}${step.place ? ', ' + step.place : ''}`"
              class="ect-w-full ect-h-full ect-object-cover ect-grayscale hover:ect-grayscale-0 ect-transition-all ect-duration-700"
              loading="lazy"
            />
            <div v-else class="ect-w-full ect-h-full ect-bg-gradient-to-br ect-from-champagne ect-via-cream ect-to-gold-50 ect-flex ect-items-center ect-justify-center">
              <svg class="ect-w-14 ect-h-14 ect-text-gold-300/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="0.6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 3h12l4 6-10 12L2 9l4-6zM2 9h20M9.5 3L7 9l5 12M14.5 3L17 9l-5 12" />
              </svg>
            </div>
            <figcaption v-if="step.year" class="ect-absolute ect-bottom-0 ect-left-0 ect-bg-noir ect-text-cream ect-font-display ect-text-2xl ect-font-light ect-px-6 ect-py-3">
              {{ step.year }}
            </figcaption>
          </figure>

          <div :class="i % 2 === 1 ? 'lg:ect-order-1' : ''">
            <p v-if="step.place" class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.22em] ect-text-charcoal/40 ect-mb-4">{{ step.place }}</p>
            <h2 class="ect-font-display ect-font-light ect-text-3xl sm:ect-text-4xl ect-text-charcoal ect-mb-6">{{ step.title }}</h2>
            <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-leading-body-relaxed ect-mb-8">{{ step.desc }}</p>
            <RouterLink
              to="/collections"
              class="ect-inline-flex ect-items-center ect-gap-3 ect-font-body ect-text-[12px] ect-font-semibold ect-uppercase ect-tracking-[0.2em] ect-text-charcoal hover:ect-text-gold-700 ect-transition-colors"
            >
              Explore
              <span class="ect-w-10 ect-h-px ect-bg-charcoal/40" />
            </RouterLink>
          </div>
        </article>
      </section>

      <!-- Stats — dark band with count-up -->
      <section ref="statsEl" class="ect-bg-noir ect-text-cream ect-py-20 sm:ect-py-24 ect-px-6 ect-relative ect-overflow-hidden">
        <span class="ect-absolute ect-inset-0 ect-bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,rgba(201,162,39,0.1),transparent)]" />
        <div class="ect-relative ect-max-w-5xl ect-mx-auto">
          <p class="ect-font-display ect-italic ect-text-xl ect-text-gold-300 ect-text-center ect-mb-14">A collective of creators</p>
          <ul class="ect-grid ect-grid-cols-2 sm:ect-grid-cols-4 ect-gap-y-12 ect-list-none ect-m-0 ect-p-0">
            <li v-for="(s, i) in stats" :key="s.label" class="ect-text-center">
              <p class="ect-font-display ect-font-light ect-text-5xl sm:ect-text-6xl ect-mb-3">
                <template v-if="s.target !== null">{{ counts[i] }}{{ s.suffix }}</template>
                <template v-else>{{ s.text }}</template>
              </p>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.22em] ect-text-cream/40">{{ s.label }}</p>
            </li>
          </ul>
        </div>
      </section>

      <!-- Founders & team — portraits, only when configured in the internal workspace -->
      <section v-if="team.length" class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-pt-24 sm:ect-pt-28">
        <p class="ect-font-display ect-italic ect-text-xl ect-text-gold-700 ect-text-center ect-mb-4">Our story</p>
        <h2 class="ect-font-display ect-font-light ect-text-3xl sm:ect-text-4xl ect-text-charcoal ect-text-center ect-mb-16">The people behind Kiana</h2>
        <ul class="ect-grid ect-grid-cols-2 sm:ect-grid-cols-3 lg:ect-grid-cols-4 ect-gap-x-6 ect-gap-y-12 ect-justify-center ect-list-none ect-m-0 ect-p-0">
          <li v-for="(member, i) in team" :key="`${member.name}-${i}`" class="ect-text-center">
            <figure class="ect-relative ect-overflow-hidden ect-aspect-[3/4] ect-bg-cream ect-m-0 ect-mb-5">
              <img
                v-if="member.imageUrl"
                :src="member.imageUrl"
                :alt="member.name || 'Team member'"
                class="ect-w-full ect-h-full ect-object-cover ect-grayscale hover:ect-grayscale-0 ect-transition-all ect-duration-700"
                loading="lazy"
              />
              <div v-else class="ect-w-full ect-h-full ect-bg-gradient-to-br ect-from-champagne ect-via-cream ect-to-gold-50 ect-flex ect-items-center ect-justify-center">
                <span class="ect-font-display ect-text-4xl ect-font-light ect-text-gold-400/70">{{ (member.name || '?').charAt(0) }}</span>
              </div>
            </figure>
            <h3 class="ect-font-display ect-text-xl ect-font-light ect-text-charcoal ect-mb-1">{{ member.name }}</h3>
            <p v-if="member.role" class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-charcoal/45">{{ member.role }}</p>
          </li>
        </ul>
      </section>

      <!-- Values — numbered editorial columns -->
      <section class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-py-24 sm:ect-py-28">
        <p class="ect-font-display ect-italic ect-text-xl ect-text-gold-700 ect-text-center ect-mb-4">What we stand for</p>
        <h2 class="ect-font-display ect-font-light ect-text-3xl sm:ect-text-4xl ect-text-charcoal ect-text-center ect-mb-16">Keeping the wearer at the heart</h2>
        <ul class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-3 ect-gap-10 sm:ect-gap-12 ect-list-none ect-m-0 ect-p-0">
          <li v-for="v in values" :key="v.title" class="ect-border-t ect-border-charcoal/15 ect-pt-8">
            <p class="ect-font-body ect-text-[11px] ect-tracking-[0.22em] ect-text-gold-700 ect-mb-5">{{ v.n }}</p>
            <h3 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-3">{{ v.title }}</h3>
            <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-leading-body-relaxed">{{ v.desc }}</p>
          </li>
        </ul>
      </section>

      <!-- Process CTA band -->
      <section class="ect-relative ect-overflow-hidden ect-bg-charcoal ect-text-cream ect-py-24 sm:ect-py-28 ect-px-6 ect-text-center">
        <span class="ect-absolute ect-inset-0 ect-bg-[radial-gradient(ellipse_70%_70%_at_50%_0%,rgba(201,162,39,0.12),transparent)]" />
        <div class="ect-relative ect-max-w-2xl ect-mx-auto">
          <p class="ect-font-display ect-italic ect-text-xl ect-text-gold-300 ect-mb-6">Our process</p>
          <h2 class="ect-font-display ect-font-light ect-text-3xl sm:ect-text-5xl ect-leading-display ect-mb-7">From insight to heirloom.</h2>
          <p class="ect-font-body ect-text-sm sm:ect-text-base ect-text-cream/55 ect-leading-body-relaxed ect-mb-10">
            As an insight-led design house, everything we do — from ideation to creation — centres on today's
            ever-evolving customer. Turning their essence into precious jewellery is what we do best.
          </p>
          <RouterLink
            to="/services"
            class="ect-inline-flex ect-items-center ect-gap-2.5 ect-px-8 ect-py-4 ect-bg-cream ect-text-charcoal ect-font-body ect-text-[12px] ect-font-semibold ect-uppercase ect-tracking-[0.18em] hover:ect-bg-champagne ect-transition-colors"
          >
            Discover our services
            <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>
          </RouterLink>
        </div>
      </section>
    </template>

    <!-- ── CONTACT ── -->
    <section v-else-if="activeTab === 'contact'" class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-py-16 sm:ect-py-20">
      <section class="ect-grid ect-grid-cols-1 lg:ect-grid-cols-[1fr_1.4fr] ect-gap-10">
        <!-- Info -->
        <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
          <li class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-charcoal/[0.06] ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-10 ect-h-10 ect-rounded-xl ect-bg-charcoal ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-4 ect-h-4 ect-text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
            </span>
            <div>
              <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-mb-1">Visit us</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal ect-leading-relaxed">SEZ-2, Sitapura Industrial Area<br />Jaipur, Rajasthan 302022, India</p>
            </div>
          </li>
          <li class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-charcoal/[0.06] ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-10 ect-h-10 ect-rounded-xl ect-bg-charcoal ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-4 ect-h-4 ect-text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
            </span>
            <div>
              <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-mb-1">Email</p>
              <a href="mailto:sales@kianajewels.in" class="ect-font-body ect-text-sm ect-text-charcoal hover:ect-text-gold-700 ect-transition-colors">sales@kianajewels.in</a>
            </div>
          </li>
          <li class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-charcoal/[0.06] ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-10 ect-h-10 ect-rounded-xl ect-bg-charcoal ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-4 ect-h-4 ect-text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a11.285 11.285 0 01-3.256-3.137c-.111-.184-.006-.418.19-.6l1.13-.936c.32-.266.475-.714.407-1.146l-.382-2.26a1.125 1.125 0 00-1.09-.932H2.25z"/></svg>
            </span>
            <div>
              <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-mb-1">Phone</p>
              <a href="tel:+919216399116" class="ect-font-body ect-text-sm ect-text-charcoal hover:ect-text-gold-700 ect-transition-colors">+91 92163 99116</a>
            </div>
          </li>
        </ul>

        <!-- Form -->
        <div class="ect-bg-white ect-rounded-3xl ect-p-8 sm:ect-p-10 ect-border ect-border-charcoal/[0.06] ect-shadow-sm">
          <template v-if="!submitted">
            <h3 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-7">Send a message</h3>
            <form @submit.prevent="handleSubmit" class="ect-space-y-5">
              <label class="ect-block">
                <span class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.15em] ect-font-semibold ect-text-charcoal/40 ect-block ect-mb-2">Name</span>
                <input v-model="name" type="text" required placeholder="Your full name"
                  class="ect-w-full ect-px-4 ect-py-3.5 ect-rounded-xl ect-bg-cream/60 ect-border ect-border-charcoal/[0.08] ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/25 focus:ect-outline-none focus:ect-border-charcoal/30 focus:ect-ring-2 focus:ect-ring-charcoal/[0.06] ect-transition-all" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.15em] ect-font-semibold ect-text-charcoal/40 ect-block ect-mb-2">Email</span>
                <input v-model="email" type="email" required placeholder="you@example.com"
                  class="ect-w-full ect-px-4 ect-py-3.5 ect-rounded-xl ect-bg-cream/60 ect-border ect-border-charcoal/[0.08] ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/25 focus:ect-outline-none focus:ect-border-charcoal/30 focus:ect-ring-2 focus:ect-ring-charcoal/[0.06] ect-transition-all" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.15em] ect-font-semibold ect-text-charcoal/40 ect-block ect-mb-2">Message</span>
                <textarea v-model="message" required rows="5" placeholder="How can we help?"
                  class="ect-w-full ect-px-4 ect-py-3.5 ect-rounded-xl ect-bg-cream/60 ect-border ect-border-charcoal/[0.08] ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/25 focus:ect-outline-none focus:ect-border-charcoal/30 focus:ect-ring-2 focus:ect-ring-charcoal/[0.06] ect-transition-all ect-resize-none" />
              </label>
              <button type="submit"
                class="ect-w-full ect-py-4 ect-rounded-xl ect-bg-charcoal ect-text-cream ect-font-body ect-text-sm ect-font-semibold ect-tracking-wide hover:ect-bg-noir ect-transition-colors">
                Send message →
              </button>
            </form>
          </template>
          <template v-else>
            <div class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-min-h-[320px] ect-text-center">
              <span class="ect-w-16 ect-h-16 ect-rounded-2xl ect-bg-emerald-50 ect-flex ect-items-center ect-justify-center ect-mb-5">
                <svg class="ect-w-7 ect-h-7 ect-text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </span>
              <h3 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Message sent!</h3>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/50">We'll get back to you within 24 hours.</p>
            </div>
          </template>
        </div>
      </section>
    </section>

  </main>
</template>
