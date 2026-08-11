import { computed } from 'vue'
import { useRoute } from 'vue-router'

export type InternalWorkspaceTabId = 'orders' | 'quotes' | 'services' | 'users' | 'products' | 'homepage' | 'about' | 'branding' | 'discounts' | 'new'

export function useInternalWorkspaceTab() {
  const route = useRoute()
  const activeTabId = computed<InternalWorkspaceTabId>(() => {
    if (route.name === 'internal-order') return 'orders'
    if (route.name === 'internal-quote') return 'quotes'
    if (route.name === 'internal-user') return 'users'
    if (route.name === 'internal-service') return 'services'
    if (route.name === 'internal-product' && String(route.params.slug || '') === 'new') return 'new'
    if (route.name === 'internal-product') return 'products'
    const raw = route.query.tab
    const s = Array.isArray(raw) ? raw[0] : raw
    if (s === 'orders' || s === 'quotes' || s === 'services' || s === 'users' || s === 'products' || s === 'homepage' || s === 'about' || s === 'branding' || s === 'discounts') return s
    return 'orders'
  })
  return { activeTabId }
}
