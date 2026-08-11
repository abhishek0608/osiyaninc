import { prisma } from './db.js'

// Short in-memory cache so the public read (folded into /api/site-config) stays
// cheap under load. Invalidated whenever the registry changes via sync or the
// internal workspace, so curated edits appear within a request or two.
let cache = null
let cacheExpiry = 0
const CACHE_TTL_MS = 30_000

export function invalidateStoneSizesCache() {
  cache = null
  cacheExpiry = 0
}

function normalizeStoneSize(row) {
  return {
    id: row.id,
    value: row.value,
    label: row.label || '',
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    active: row.active !== false,
  }
}

// The set of stone sizes currently offered, ordered for display. The storefront
// shows `label` when present, otherwise the raw `value`.
export async function getStoneSizesInUse() {
  const now = Date.now()
  if (cache && now < cacheExpiry) return cache
  const rows = await prisma.stoneSize.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
  })
  cache = rows.map(normalizeStoneSize)
  cacheExpiry = now + CACHE_TTL_MS
  return cache
}

// Every distinct size, regardless of active state — for the internal workspace.
export async function getAllStoneSizes() {
  const rows = await prisma.stoneSize.findMany({
    orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
  })
  return rows.map(normalizeStoneSize)
}

// Additively register every size value a product uses, refreshing `lastSeenAt`.
// This NEVER restricts input — it only records what was used — and is wrapped so
// a failure here can never fail the product save that triggered it.
export async function syncStoneSizesInUse(values) {
  try {
    const list = Array.isArray(values) ? values : []
    const seen = new Set()
    const clean = []
    for (const raw of list) {
      const value = String(raw || '').trim()
      if (!value || seen.has(value)) continue
      seen.add(value)
      clean.push(value)
    }
    if (!clean.length) return

    await Promise.all(
      clean.map((value) =>
        prisma.stoneSize.upsert({
          where: { value },
          // Only touch lastSeenAt on re-sight; leave any curated label / order /
          // active flag the workspace set in place.
          update: { lastSeenAt: new Date() },
          create: { value },
        }),
      ),
    )
    invalidateStoneSizesCache()
  } catch (error) {
    console.error('[stone-size] sync failed (non-fatal):', error)
  }
}
