<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CollectionGrid from '../components/CollectionGrid.vue'
import { findCollectionBySlug } from '../data/collections'
import { useCollectionPreset } from '../composables/useCollectionPreset'
import { parseCollectionQuery } from '../data/nav-menu'
import { pieceTypeForStyle } from '../data/filters'
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
  // The header's mega menu carries filter intent in the URL (?style=stud,
  // ?metal=yellow, ?tab=new), so those links deep-link into a filtered grid and
  // stay shareable. Anything the query doesn't name falls back to the
  // collection's own preset.
  //
  // ?style= carries a subtype, but where that subtype has become a Type the
  // page filters on, it goes to the Type facet instead: the facet also resolves
  // records still filed under the old subtype, and the shopper lands with the
  // matching box ticked rather than with a filter the page shows no control for.
  const q = parseCollectionQuery(route.query)
  const styleType = q.style ? pieceTypeForStyle(q.style) : null
  const styleFilter = !q.style ? {} : styleType ? { types: [styleType] } : { subtypes: [q.style] }
  setPreset({
    ...c.preset,
    ...styleFilter,
    ...(q.metal ? { color: q.metal } : {}),
    ...(q.material ? { material: q.material } : {}),
    ...(q.tab ? { tab: q.tab } : {}),
  })
  setPageMeta({ title: c.title, description: c.description })
}

// Set synchronously so the preset is in place before CollectionGrid mounts, and
// re-apply whenever the slug or the filter query changes.
applyForSlug()
watch(() => route.fullPath, applyForSlug)
</script>

<template>
  <section v-if="collection" class="ect-pt-6">
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
