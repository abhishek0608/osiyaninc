import { reactive, computed, watch } from 'vue'
import type { Product } from '../data/products'
import { useAuth } from './useAuth'
import { API_BASE } from '../config-api'

const LEGACY_WISHLIST_STORAGE_KEY = 'kiana-demo-wishlist'

function clearLegacyWishlistStorage() {
  try {
    localStorage.removeItem(LEGACY_WISHLIST_STORAGE_KEY)
  } catch {
    // ignore storage errors
  }
}

type WishlistProduct = Product & { wishlistGroup?: string | null }

clearLegacyWishlistStorage()
const slugs = reactive<string[]>([])
const wishlistProducts = reactive<Product[]>([])
const groupBySlug = reactive<Record<string, string>>({})
// Groups created this session that have no items assigned yet. They live only
// in memory until an item is assigned (which persists them server-side).
const pendingGroups = reactive<string[]>([])
let wishlistSyncBound = false

function normalizeGroupName(input: string | null | undefined) {
  const name = String(input ?? '').trim()
  return name ? name.slice(0, 60) : null
}

function applyServerProducts(products: WishlistProduct[]) {
  const nextSlugs = products
    .map((p) => p?.slug)
    .filter((s): s is string => typeof s === 'string')
  slugs.splice(0, slugs.length, ...nextSlugs)
  wishlistProducts.splice(0, wishlistProducts.length, ...products)
  for (const key of Object.keys(groupBySlug)) delete groupBySlug[key]
  for (const p of products) {
    const group = normalizeGroupName(p?.wishlistGroup)
    if (p?.slug && group) groupBySlug[p.slug] = group
  }
  // Drop pending groups that now exist with items assigned.
  const active = new Set(Object.values(groupBySlug))
  for (let i = pendingGroups.length - 1; i >= 0; i--) {
    const name = pendingGroups[i]
    if (name && active.has(name)) pendingGroups.splice(i, 1)
  }
}

export function useWishlist() {
  const { user } = useAuth()
  const items = computed(() => wishlistProducts)

  const count = computed(() => items.value.length)

  const groups = computed(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const name of pendingGroups) {
      if (!seen.has(name)) {
        seen.add(name)
        ordered.push(name)
      }
    }
    for (const product of wishlistProducts) {
      const name = groupBySlug[product.slug]
      if (name && !seen.has(name)) {
        seen.add(name)
        ordered.push(name)
      }
    }
    return ordered
  })

  function isWishlisted(slug: string) {
    return slugs.includes(slug)
  }

  function groupOf(slug: string): string | null {
    return groupBySlug[slug] ?? null
  }

  async function syncFromServer() {
    if (!user.value?.id) return
    const res = await fetch(
      `${API_BASE}/api/account?mode=wishlist&userId=${encodeURIComponent(user.value.id)}`,
      {
        method: 'GET',
      }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to load wishlist.')
    const products = Array.isArray(data?.products) ? data.products : []
    applyServerProducts(products)
  }

  async function mutateServerWishlist(payload: Record<string, unknown>) {
    if (!user.value?.id) return
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'wishlist', userId: user.value.id, ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Unable to update wishlist.')
    const products = Array.isArray(data?.products) ? data.products : []
    applyServerProducts(products)
  }

  async function toggle(product: Product) {
    const idx = slugs.indexOf(product.slug)
    if (idx === -1) slugs.push(product.slug)
    else slugs.splice(idx, 1)
    const localIdx = wishlistProducts.findIndex((p) => p.slug === product.slug)
    if (localIdx === -1) wishlistProducts.unshift(product)
    else {
      wishlistProducts.splice(localIdx, 1)
      delete groupBySlug[product.slug]
    }
    if (user.value?.id) {
      try {
        await mutateServerWishlist({ action: 'toggle', slug: product.slug })
      } catch (err) {
        console.error('Wishlist toggle sync failed:', err)
      }
    }
  }

  async function add(product: Product) {
    if (!slugs.includes(product.slug)) {
      slugs.push(product.slug)
      wishlistProducts.unshift(product)
    }
    if (user.value?.id) {
      try {
        await mutateServerWishlist({ action: 'add', slug: product.slug })
      } catch (err) {
        console.error('Wishlist add sync failed:', err)
      }
    }
  }

  async function remove(slug: string) {
    const idx = slugs.indexOf(slug)
    if (idx !== -1) {
      slugs.splice(idx, 1)
      const localIdx = wishlistProducts.findIndex((p) => p.slug === slug)
      if (localIdx !== -1) wishlistProducts.splice(localIdx, 1)
      delete groupBySlug[slug]
    }
    if (user.value?.id) {
      try {
        await mutateServerWishlist({ action: 'remove', slug })
      } catch (err) {
        console.error('Wishlist remove sync failed:', err)
      }
    }
  }

  function createGroup(name: string): string | null {
    const normalized = normalizeGroupName(name)
    if (!normalized) return null
    if (!groups.value.includes(normalized)) pendingGroups.push(normalized)
    return normalized
  }

  async function setGroup(slug: string, group: string | null) {
    if (!slugs.includes(slug)) return
    const normalized = normalizeGroupName(group)
    if (normalized) groupBySlug[slug] = normalized
    else delete groupBySlug[slug]
    if (user.value?.id) {
      try {
        await mutateServerWishlist({ action: 'set-group', slug, group: normalized })
      } catch (err) {
        console.error('Wishlist group sync failed:', err)
      }
    }
  }

  async function renameGroup(from: string, to: string) {
    const fromName = normalizeGroupName(from)
    const toName = normalizeGroupName(to)
    if (!fromName || !toName || fromName === toName) return
    for (const slug of Object.keys(groupBySlug)) {
      if (groupBySlug[slug] === fromName) groupBySlug[slug] = toName
    }
    const pendingIdx = pendingGroups.indexOf(fromName)
    if (pendingIdx !== -1) pendingGroups.splice(pendingIdx, 1, toName)
    if (user.value?.id) {
      try {
        await mutateServerWishlist({ action: 'rename-group', from: fromName, to: toName })
      } catch (err) {
        console.error('Wishlist group rename sync failed:', err)
      }
    }
  }

  async function deleteGroup(name: string) {
    const groupName = normalizeGroupName(name)
    if (!groupName) return
    for (const slug of Object.keys(groupBySlug)) {
      if (groupBySlug[slug] === groupName) delete groupBySlug[slug]
    }
    const pendingIdx = pendingGroups.indexOf(groupName)
    if (pendingIdx !== -1) pendingGroups.splice(pendingIdx, 1)
    if (user.value?.id) {
      try {
        await mutateServerWishlist({ action: 'rename-group', from: groupName, to: null })
      } catch (err) {
        console.error('Wishlist group delete sync failed:', err)
      }
    }
  }

  if (!wishlistSyncBound) {
    wishlistSyncBound = true
    watch(
      () => user.value?.id || null,
      async (userId) => {
        if (!userId) {
          slugs.splice(0, slugs.length)
          wishlistProducts.splice(0, wishlistProducts.length)
          for (const key of Object.keys(groupBySlug)) delete groupBySlug[key]
          pendingGroups.splice(0, pendingGroups.length)
          return
        }
        try {
          await syncFromServer()
        } catch (err) {
          console.error('Wishlist initial sync failed:', err)
        }
      },
      { immediate: true }
    )
  }

  return {
    items,
    count,
    groups,
    isWishlisted,
    groupOf,
    toggle,
    add,
    remove,
    createGroup,
    setGroup,
    renameGroup,
    deleteGroup,
  }
}
