import { prisma } from './db.js'

// There is only ever one SiteConfig row, keyed by this fixed id.
export const SITE_CONFIG_ID = 'default'

// Coerce arbitrary stored/incoming JSON into a clean, sorted list of
// { minQty, percent } tiers. Invalid entries are dropped rather than throwing
// so a bad row can never break price rendering on the storefront.
function normalizeVolumeDiscountTiers(raw) {
  if (!Array.isArray(raw)) return []
  const tiers = []
  for (const entry of raw) {
    const minQty = Math.floor(Number(entry?.minQty))
    const percent = Number(entry?.percent)
    if (!Number.isFinite(minQty) || minQty < 1) continue
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) continue
    tiers.push({ minQty, percent: Math.round(percent * 100) / 100 })
  }
  // Highest threshold first so the best applicable tier is easy to pick, and
  // collapse duplicate thresholds (keep the largest discount).
  tiers.sort((a, b) => b.minQty - a.minQty)
  const seen = new Set()
  return tiers.filter((t) => {
    if (seen.has(t.minQty)) return false
    seen.add(t.minQty)
    return true
  })
}

// Coerce the stored/incoming collection-image map into a clean object of
// { slug: imageUrl } with trimmed, non-empty string values. Anything malformed
// is dropped so a bad entry can never break the storefront grid. A defensive
// cap keeps a single SiteConfig row from growing unbounded.
function normalizeCollectionImages(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const images = {}
  for (const [key, value] of Object.entries(raw)) {
    const slug = String(key || '').trim()
    const url = typeof value === 'string' ? value.trim() : ''
    if (!slug || !url) continue
    images[slug] = url
    if (Object.keys(images).length >= 50) break
  }
  return images
}

// Coerce the stored/incoming About Us page content into a clean shape:
// { heroEyebrow, heroHeadline, heroSubheadline, journey: [...], team: [...] }.
// Malformed entries are dropped rather than throwing, and defensive caps keep
// the single SiteConfig row from growing unbounded. Empty strings / lists mean
// "use the bundled storefront defaults".
function normalizeAboutContent(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const str = (value, max = 500) =>
    typeof value === 'string' ? value.trim().slice(0, max) : ''

  const journey = []
  if (Array.isArray(src.journey)) {
    for (const entry of src.journey) {
      if (!entry || typeof entry !== 'object') continue
      const item = {
        year: str(entry.year, 20),
        place: str(entry.place, 80),
        title: str(entry.title, 120),
        desc: str(entry.desc, 2000),
        imageUrl: str(entry.imageUrl, 2_000_000),
        active: entry.active !== false,
      }
      // A milestone needs at least a title to be renderable.
      if (!item.title) continue
      journey.push(item)
      if (journey.length >= 10) break
    }
  }

  const team = []
  if (Array.isArray(src.team)) {
    for (const entry of src.team) {
      if (!entry || typeof entry !== 'object') continue
      const member = {
        name: str(entry.name, 120),
        role: str(entry.role, 120),
        imageUrl: str(entry.imageUrl, 2_000_000),
        active: entry.active !== false,
      }
      // A member needs a name or a photo to be renderable.
      if (!member.name && !member.imageUrl) continue
      team.push(member)
      if (team.length >= 24) break
    }
  }

  return {
    heroEyebrow: str(src.heroEyebrow, 120),
    heroHeadline: str(src.heroHeadline, 200),
    heroSubheadline: str(src.heroSubheadline, 500),
    journey,
    team,
  }
}

function normalizeSiteConfig(row) {
  return {
    logoUrl: row?.logoUrl || '',
    volumeDiscountEnabled: Boolean(row?.volumeDiscountEnabled),
    volumeDiscountTiers: normalizeVolumeDiscountTiers(row?.volumeDiscountTiers),
    collectionImages: normalizeCollectionImages(row?.collectionImages),
    aboutContent: normalizeAboutContent(row?.aboutContent),
    updatedAt: row?.updatedAt || null,
  }
}

export async function getSiteConfig() {
  const row = await prisma.siteConfig.findUnique({ where: { id: SITE_CONFIG_ID } })
  return normalizeSiteConfig(row)
}

// Partial update: only the fields actually supplied are written, so the
// branding tab (logo only) and the discounts tab (volume fields only) can each
// save without clobbering the other's settings.
export async function saveSiteConfig(patch = {}) {
  const update = {}
  if ('logoUrl' in patch) {
    update.logoUrl = typeof patch.logoUrl === 'string' ? patch.logoUrl.trim() || null : null
  }
  if ('volumeDiscountEnabled' in patch) {
    update.volumeDiscountEnabled = Boolean(patch.volumeDiscountEnabled)
  }
  if ('volumeDiscountTiers' in patch) {
    update.volumeDiscountTiers = normalizeVolumeDiscountTiers(patch.volumeDiscountTiers)
  }
  if ('collectionImages' in patch) {
    update.collectionImages = normalizeCollectionImages(patch.collectionImages)
  }
  if ('aboutContent' in patch) {
    update.aboutContent = normalizeAboutContent(patch.aboutContent)
  }
  const row = await prisma.siteConfig.upsert({
    where: { id: SITE_CONFIG_ID },
    update,
    create: { id: SITE_CONFIG_ID, ...update },
  })
  return normalizeSiteConfig(row)
}
