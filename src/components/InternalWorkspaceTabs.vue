<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useInternalWorkspaceTab, type InternalWorkspaceTabId } from '../composables/useInternalWorkspaceTab'

const { isAdminUser } = useAuth()
const { activeTabId } = useInternalWorkspaceTab()

// On a phone the bar scrolls sideways; keep the selected tab in view.
const nav = ref<HTMLElement | null>(null)
watch(
  activeTabId,
  async () => {
    await nextTick()
    const active = nav.value?.querySelector<HTMLElement>('[data-active="true"]')
    if (!nav.value || !active) return
    const navBox = nav.value.getBoundingClientRect()
    const tabBox = active.getBoundingClientRect()
    nav.value.scrollTo({
      left: nav.value.scrollLeft + tabBox.left - navBox.left - (navBox.width - tabBox.width) / 2,
      behavior: 'smooth',
    })
  },
  { immediate: true },
)

const tabs: { id: InternalWorkspaceTabId; label: string }[] = [
  { id: 'orders', label: 'Orders' },
  { id: 'memos', label: 'Memos' },
  { id: 'users', label: 'Users' },
  { id: 'approvals', label: 'Approvals' },
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
    ref="nav"
    class="ect-flex ect-gap-1 ect-overflow-x-auto ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-1 ect-mb-5"
    aria-label="Workspace sections"
  >
    <RouterLink
      v-for="t in tabs"
      :key="t.id"
      :to="{ path: '/internal', query: { tab: t.id } }"
      :data-active="activeTabId === t.id"
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
