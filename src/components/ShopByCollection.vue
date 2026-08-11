<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { COLLECTION_LINKS } from '../data/collections'
import { useSiteConfig } from '../composables/useSiteConfig'

const router = useRouter()
const collections = COLLECTION_LINKS

const { collectionImages, ensureSiteConfigLoaded } = useSiteConfig()

onMounted(() => {
  void ensureSiteConfigLoaded()
})

// Muted brushed-gold placeholder for each collection tile — a touch lighter and
// warmer than the hero so the grid reads as a distinct row of cards. Always
// painted as the tile background; the configured image (if any) sits above it
// as a real <img>, so the placeholder shows through until the image loads.
const cardBg =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 2px, transparent 2px, transparent 13px), linear-gradient(135deg, #d4cab2 0%, #c2b596 60%, #ab9d7e 100%)'

// The configured image for a collection (if any). Rendered via an <img> element
// rather than a CSS background-image: iOS/mobile Safari silently refuses to
// paint background-images whose decoded area exceeds a memory threshold (large
// uploaded photos easily hit it), leaving only the gradient on mobile while
// desktop renders fine. <img> decodes progressively and has no such limit.
const collectionImage = (slug: string) => collectionImages.value[slug] || ''

// With an odd number of collections the final tile spans the full row so the
// grid never leaves a lone half-width card.
const isLastSpanning = (index: number) =>
  collections.length % 2 === 1 && index === collections.length - 1

// Desktop grid is 6 units wide: full rows hold three tiles (span 2 each), and
// leftover tiles widen to fill the last row(s) — e.g. 5 tiles render as 3 + 2
// half-width cards instead of leaving an empty slot.
const isWideOnDesktop = (index: number) => {
  const count = collections.length
  const remainder = count % 3
  if (remainder === 2) return index >= count - 2
  if (remainder === 1 && count > 3) return index >= count - 4
  return false
}

// Wide tiles stretch their aspect so both rows keep the same height.
const desktopClasses = (index: number) =>
  isWideOnDesktop(index)
    ? 'lg:ect-col-span-3 lg:ect-aspect-[32/15]'
    : 'lg:ect-col-span-2 lg:ect-aspect-[7/5]'

function goToCollection(slug: string) {
  void router.push(`/collections/${slug}`)
}

function viewAll() {
  void router.push('/collections')
}
</script>

<template>
  <section class="ect-bg-cream ect-pt-10 sm:ect-pt-14">
    <div class="ect-max-w-7xl ect-mx-auto ect-px-4 sm:ect-px-6 lg:ect-px-8">
      <header class="ect-flex ect-items-end ect-justify-between ect-gap-4 ect-mb-5">
        <h2 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-text-charcoal">
          Shop by Collection
        </h2>
        <button
          type="button"
          class="ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.18em] ect-text-charcoal/55 hover:ect-text-gold-700 ect-transition-colors ect-shrink-0"
          @click="viewAll"
        >
          View all
        </button>
      </header>

      <div class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-6 ect-gap-3 sm:ect-gap-4">
        <button
          v-for="(item, index) in collections"
          :key="item.slug"
          type="button"
          class="ect-relative ect-overflow-hidden ect-rounded-2xl ect-shadow-card hover:ect-shadow-luxe-sm hover:-ect-translate-y-0.5 ect-transition-all ect-duration-200 ect-aspect-[7/5] ect-flex ect-items-end ect-p-4 ect-text-left"
          :class="[isLastSpanning(index) ? 'ect-col-span-2' : '', desktopClasses(index)]"
          :style="{ backgroundImage: cardBg }"
          @click="goToCollection(item.slug)"
        >
          <img
            v-if="collectionImage(item.slug)"
            :src="collectionImage(item.slug)"
            :alt="item.title"
            loading="lazy"
            decoding="async"
            class="ect-pointer-events-none ect-absolute ect-inset-0 ect-w-full ect-h-full ect-object-cover"
          />
          <span
            class="ect-pointer-events-none ect-absolute ect-inset-0 ect-bg-[linear-gradient(180deg,transparent_45%,rgba(20,17,15,0.35)_100%)]"
          />
          <span
            class="ect-relative ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-leading-tight ect-text-cream [text-shadow:0_1px_4px_rgba(20,17,15,0.4)]"
          >
            {{ item.title }}
          </span>
        </button>
      </div>
    </div>
  </section>
</template>
