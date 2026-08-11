<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useInternalWorkspaceTab, type InternalWorkspaceTabId } from '../composables/useInternalWorkspaceTab'

const { isAdminUser } = useAuth()
const { activeTabId } = useInternalWorkspaceTab()

const tabs: { id: InternalWorkspaceTabId; label: string }[] = [
  { id: 'orders', label: 'Orders' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'services', label: 'Services' },
  { id: 'users', label: 'Users' },
  { id: 'products', label: 'Products' },
  { id: 'homepage', label: 'Homepage' },
  { id: 'about', label: 'About page' },
  { id: 'branding', label: 'Branding' },
  { id: 'discounts', label: 'Discounts' },
]
</script>

<template>
  <!-- Workspace tab buttons are reserved for Full Admins; other internal
       users land on the default (orders) section without the switcher. -->
  <nav
    v-if="isAdminUser"
    class="ect-flex ect-gap-1 ect-overflow-x-auto ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-1 ect-mb-5"
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
