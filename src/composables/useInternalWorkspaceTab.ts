import { computed } from 'vue'
import { useRoute } from 'vue-router'

export type InternalWorkspaceTabId = 'orders' | 'memos' | 'users' | 'approvals' | 'products' | 'homepage' | 'about' | 'branding' | 'discounts' | 'new'

// The workspace sections, in menu order. Shared by the desktop tab bar and the
// header's mobile drawer so the two can't drift.
export const INTERNAL_WORKSPACE_TABS: { id: InternalWorkspaceTabId; label: string }[] = [
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
