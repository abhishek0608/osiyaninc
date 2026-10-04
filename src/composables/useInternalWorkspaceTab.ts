import { computed } from 'vue'
import { useRoute } from 'vue-router'

export type InternalWorkspaceTabId = 'orders' | 'memos' | 'users' | 'approvals' | 'products' | 'homepage' | 'about' | 'branding' | 'discounts' | 'new'

// The workspace sections, in menu order. Shared by the desktop tab bar and the
// header's mobile drawer so the two can't drift. `mobile` marks the sections the
// drawer offers; the site-content editors stay desktop-only for now.
export const INTERNAL_WORKSPACE_TABS: { id: InternalWorkspaceTabId; label: string; mobile: boolean }[] = [
  { id: 'orders', label: 'Orders', mobile: true },
  { id: 'memos', label: 'Memos', mobile: true },
  { id: 'users', label: 'Users', mobile: true },
  { id: 'approvals', label: 'Approvals', mobile: true },
  { id: 'products', label: 'Products', mobile: true },
  { id: 'homepage', label: 'Homepage', mobile: false },
  { id: 'about', label: 'About page', mobile: false },
  { id: 'branding', label: 'Branding', mobile: false },
  { id: 'discounts', label: 'Discounts', mobile: false },
]

export const INTERNAL_MOBILE_TABS = INTERNAL_WORKSPACE_TABS.filter((tab) => tab.mobile)

export function useInternalWorkspaceTab() {
  const route = useRoute()
  const activeTabId = computed<InternalWorkspaceTabId>(() => {
    if (route.name === 'internal-order') return 'orders'
    if (route.name === 'internal-memo') return 'memos'
    if (route.name === 'internal-user') return 'users'
    if (route.name === 'internal-signup-request') return 'approvals'
    if (route.name === 'internal-product' && String(route.params.slug || '') === 'new') return 'new'
    if (route.name === 'internal-product') return 'products'
    const raw = route.query.tab
    const s = Array.isArray(raw) ? raw[0] : raw
    if (s === 'orders' || s === 'memos' || s === 'users' || s === 'approvals' || s === 'products' || s === 'homepage' || s === 'about' || s === 'branding' || s === 'discounts') return s
    return 'orders'
  })
  return { activeTabId }
}
