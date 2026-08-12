import { ref } from 'vue'
import type { Product } from '../data/products'
import { API_BASE } from '../config-api'

const products = ref<Product[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

const CACHE_KEY = 'osiyan:catalog-products:v1'
const CACHE_TTL_MS = 5 * 60 * 1000

function readCachedProducts() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    const items = Array.isArray(cached?.products) ? cached.products : []
    const savedAt = Number(cached?.savedAt || 0)
    if (!items.length || Date.now() - savedAt > CACHE_TTL_MS) return null
    return items as Product[]
  } catch {
    return null
  }
}

function writeCachedProducts(items: Product[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ products: items, savedAt: Date.now() }))
  } catch {
    // Ignore storage limits/private mode. Network fetch remains the source of truth.
  }
}

export function invalidateProductsCache() {
  products.value = []
  loaded.value = false
  error.value = null
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {
    // Storage may be unavailable; in-memory state was already cleared.
  }
}

export async function ensureProductsLoaded() {
  if (loaded.value || loading.value) return
  const cachedProducts = readCachedProducts()
  if (cachedProducts) {
    products.value = cachedProducts
    loaded.value = true
    return
  }

  loading.value = true
  error.value = null
  try {
    const res = await fetch(`${API_BASE}/api/products`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.message || 'Unable to load products.')
    }
    const incoming = Array.isArray(data?.products) ? data.products : []
    products.value = incoming as Product[]
    writeCachedProducts(products.value)
    loaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load products.'
  } finally {
    loading.value = false
  }
}

export function useProductsApi() {
  return { products, loading, loaded, error, ensureProductsLoaded, invalidateProductsCache }
}
