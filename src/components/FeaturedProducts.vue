<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import ProductCard from './ProductCard.vue'
import { useProductsApi } from '../composables/useProductsApi'

const LIMIT = 8

const { products, ensureProductsLoaded, loading, loaded } = useProductsApi()

onMounted(() => {
  void ensureProductsLoaded()
})

// Curated teaser: lead with best sellers, then new arrivals, then fill with the
// rest — capped at LIMIT. The full filterable catalogue lives at /collections.
const featured = computed(() => {
  const all = products.value
  const seen = new Set<string>()
  const picks: typeof all = []
  const add = (list: typeof all) => {
    for (const p of list) {
      if (picks.length >= LIMIT) break
      if (seen.has(p.slug)) continue
      seen.add(p.slug)
      picks.push(p)
    }
  }
  add(all.filter((p) => p.isBestSeller))
  add(all.filter((p) => p.isNewArrival))
  add(all)
  return picks.slice(0, LIMIT)
})

const showSkeleton = computed(() => (loading.value || !loaded.value) && !featured.value.length)
</script>

<template>
  <section id="collections" class="ect-px-6 ect-max-w-7xl ect-mx-auto ect-pt-16 sm:ect-pt-24 ect-pb-16 sm:ect-pb-24">
    <header class="ect-flex ect-flex-col sm:ect-flex-row sm:ect-items-end sm:ect-justify-between ect-gap-2 ect-mb-8">
      <section>
        <p class="ect-inline-flex ect-items-center ect-gap-2.5 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.22em] ect-text-gold-700 ect-mb-3">
          <span class="ect-w-8 ect-h-px ect-bg-gold-400" />
          The Collection
        </p>
        <h2 class="ect-font-display ect-text-3xl sm:ect-text-[2.75rem] ect-font-light ect-leading-tight ect-text-charcoal">Discover Our Pieces</h2>
      </section>
      <RouterLink
        to="/collections"
        class="ect-shrink-0 ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-charcoal/55 hover:ect-text-gold-700 ect-transition-colors"
      >
        View all
        <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
      </RouterLink>
    </header>

    <!-- Skeleton -->
    <ul v-if="showSkeleton" class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0">
      <li v-for="n in 8" :key="`skeleton-${n}`" class="ect-animate-pulse">
        <section class="ect-aspect-square ect-rounded-2xl ect-bg-champagne ect-mb-3" />
        <section class="ect-h-4 ect-w-3/4 ect-rounded ect-bg-sand ect-mb-2" />
        <section class="ect-h-3 ect-w-1/3 ect-rounded ect-bg-sand" />
      </li>
    </ul>

    <!-- Curated grid -->
    <ul v-else class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0">
      <li v-for="piece in featured" :key="piece.slug" class="ect-h-full">
        <ProductCard :slug="piece.slug" :title="piece.title" :category="piece.category" :material="piece.material" :price="piece.price" :images="piece.images" :product="piece" />
      </li>
    </ul>
  </section>
</template>
