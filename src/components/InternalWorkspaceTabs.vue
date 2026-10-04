<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { INTERNAL_WORKSPACE_TABS, useInternalWorkspaceTab } from '../composables/useInternalWorkspaceTab'

const { isAdminUser } = useAuth()
const { activeTabId } = useInternalWorkspaceTab()
const route = useRoute()

const tabs = INTERNAL_WORKSPACE_TABS
const activeLabel = computed(() => tabs.find((t) => t.id === activeTabId.value)?.label ?? '')
</script>

<template>
  <!-- Below 1151px the header's hamburger drawer switches sections (the same
       breakpoint where the header collapses), so this spot just names the
       current one. Detail pages carry their own heading. -->
  <h1
    v-if="route.name === 'internal' && activeLabel"
    class="min-[1151px]:ect-hidden ect-mb-4 ect-font-display ect-text-3xl ect-font-light ect-text-charcoal"
  >
    {{ activeLabel }}
  </h1>

  <!-- Workspace tab buttons are reserved for Full Admins; other internal
       users land on the default (orders) section without the switcher. -->
  <nav
    v-if="isAdminUser"
    class="max-[1150px]:ect-hidden ect-flex ect-gap-1 ect-overflow-x-auto ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-1 ect-mb-5"
    aria-label="Workspace sections"
  >
    <RouterLink
      v-for="t in tabs"
      :key="t.id"
      :to="{ path: '/internal', query: { tab: t.id } }"
      class="ect-shrink-0 ect-rounded-md ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-transition-colors"
      :class="
        activeTabId === t.id
          ? 'ect-bg-charcoal ect-text-white'
          : 'ect-text-charcoal/55 hover:ect-bg-champagne/40 hover:ect-text-charcoal'
      "
    >
      {{ t.label }}
    </RouterLink>
  </nav>
</template>
