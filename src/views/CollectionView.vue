<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CollectionGrid from '../components/CollectionGrid.vue'
import { findCollectionBySlug } from '../data/collections'
import { useCollectionPreset } from '../composables/useCollectionPreset'
import { setPageMeta } from '../composables/useSeo'

const route = useRoute()
const router = useRouter()
const { setPreset } = useCollectionPreset()

const collection = computed(() => findCollectionBySlug(String(route.params.slug || '')))

function applyForSlug() {
  const c = collection.value
  if (!c) {
    // Unknown collection slug → fall back to the homepage.
    router.replace('/')
    return
  }
  setPreset(c.preset)
  setPageMeta({ title: c.title, description: c.description })
}

// Set synchronously so the preset is in place before CollectionGrid mounts,
// and re-apply whenever the user switches between collection pages.
applyForSlug()
watch(() => route.params.slug, applyForSlug)
</script>

<template>
  <section v-if="collection" class="ect-pt-28">
    <!-- Compact page header (no banner) -->
    <header class="ect-px-6 ect-max-w-7xl ect-mx-auto">
      <nav class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mb-1.5" aria-label="Breadcrumb">
        <RouterLink to="/" class="hover:ect-text-charcoal ect-transition-colors">Home</RouterLink>
        <span class="ect-mx-1.5">/</span>
        <span class="ect-text-charcoal/70">{{ collection.title }}</span>
      </nav>
      <h1 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-leading-tight ect-text-charcoal">{{ collection.title }}</h1>
    </header>

    <!-- Product grid (header suppressed; this page provides its own) -->
    <CollectionGrid hide-header sidebar :guest-preview-limit="6" />
  </section>
</template>
