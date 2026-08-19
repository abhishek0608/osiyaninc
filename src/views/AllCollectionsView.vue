<script setup lang="ts">
import CollectionGrid from '../components/CollectionGrid.vue'
import { useCollectionPreset } from '../composables/useCollectionPreset'

const { setPreset } = useCollectionPreset()

// No category lock — show the full catalogue across every collection. Set
// synchronously so the preset is in place before CollectionGrid mounts.
setPreset({ tab: 'all' })
</script>

<template>
  <section class="ect-pt-10">
    <!-- Compact page header (no banner) -->
    <header class="ect-px-6 ect-max-w-7xl ect-mx-auto">
      <nav class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mb-1.5" aria-label="Breadcrumb">
        <RouterLink to="/" class="hover:ect-text-charcoal ect-transition-colors">Home</RouterLink>
        <span class="ect-mx-1.5">/</span>
        <span class="ect-text-charcoal/70">All Jewellery</span>
      </nav>
      <h1 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-leading-tight ect-text-charcoal">
        All Jewellery
      </h1>
    </header>

    <!-- Full product grid (header suppressed; this page provides its own) -->
    <CollectionGrid hide-header sidebar :guest-preview-limit="6" />
  </section>
</template>
