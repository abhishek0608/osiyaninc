function parsePriceFromString(price) {
  if (typeof price !== 'string') return NaN
  const numeric = price.replace(/[^0-9.]/g, '')
  return numeric ? Number(numeric) : NaN
}

export function parseProductPrice(product) {
  if (typeof product?.priceValue === 'number' && Number.isFinite(product.priceValue)) {
    return product.priceValue
  }
  return parsePriceFromString(String(product?.price || ''))
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : []
}

const CATEGORY_ALIASES = {
  ring: 'rings',
  rings: 'rings',
  earring: 'earrings',
  earrings: 'earrings',
  necklace: 'necklaces',
  necklaces: 'necklaces',
  bracelet: 'bracelets',
  bracelets: 'bracelets',
  braclet: 'bracelets',
  braclets: 'bracelets',
  bangle: 'bangles',
  bangles: 'bangles',
  mangalsutra: 'mangal sutra',
  'mangal sutra': 'mangal sutra',
}

const MATERIAL_ALIASES = {
  gold: 'gold',
  'yellow gold': 'gold',
  'white gold': 'gold',
  'rose gold': 'gold',
  silver: 'silver',
  sterling: 'silver',
  'sterling silver': 'silver',
  oxidised: 'silver',
  oxidized: 'silver',
}

function normalizeCategory(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
  return CATEGORY_ALIASES[key] || key
}

function normalizeMaterial(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
  return MATERIAL_ALIASES[key] || key
}

function normalizeSubtype(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

export function normalizeFilterCriteria(criteria = {}) {
  const categories = toSafeArray(criteria.categories).map(normalizeCategory)
  const materials = toSafeArray(criteria.materials).map(normalizeMaterial)
  const colors = toSafeArray(criteria.colors).map((v) => String(v).toLowerCase())
  const stoneTags = [
    ...new Set(
      toSafeArray(criteria.stoneTags)
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  const subtypes = [...new Set(toSafeArray(criteria.subtypes).map(normalizeSubtype).filter(Boolean))]
  const range = criteria?.priceRange || {}
  const rawMin =
    criteria?.priceMin ?? criteria?.minPrice ?? (typeof range?.min === 'number' ? range.min : null)
  const rawMax =
    criteria?.priceMax ?? criteria?.maxPrice ?? (typeof range?.max === 'number' ? range.max : null)
  const priceMin = typeof rawMin === 'number' && Number.isFinite(rawMin) ? rawMin : null
  const priceMax = typeof rawMax === 'number' && Number.isFinite(rawMax) ? rawMax : null
  const tab = typeof criteria.tab === 'string' ? criteria.tab : 'all'
  return { categories, materials, colors, stoneTags, subtypes, priceMin, priceMax, tab }
}

const STONE_KEYWORDS = ['diamond', 'kundan', 'polki', 'pearl', 'emerald', 'ruby', 'black-beads', 'stone']

function inferStoneTagsFromText(p) {
  const text = [p?.title, p?.description, p?.aiDescription, ...(toSafeArray(p?.details))]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return STONE_KEYWORDS.filter((tag) => {
    if (tag === 'black-beads') return /\bblack[\s-]+beads?\b/.test(text)
    return new RegExp(`\\b${tag}\\b`).test(text)
  })
}

function productStoneTagsLower(p) {
  const explicit = toSafeArray(p?.stoneTags).map((t) => String(t || '').trim().toLowerCase()).filter(Boolean)
  if (explicit.length) return explicit
  return inferStoneTagsFromText(p)
}

export function filterProductsByCriteria(products, criteria = {}) {
  const { categories, materials, colors, stoneTags, subtypes, priceMin, priceMax, tab } =
    normalizeFilterCriteria(criteria)

  let list = Array.isArray(products) ? products : []
  if (tab === 'new') list = list.filter((p) => Boolean(p?.isNewArrival))
  if (tab === 'bestseller') list = list.filter((p) => Boolean(p?.isBestSeller))

  return list.filter((p) => {
    const category = normalizeCategory(p?.category)
    const material = normalizeMaterial(p?.material)
    const color = String(p?.color || '').toLowerCase()
    const subtype = normalizeSubtype(p?.subtype)
    const priceValue = parseProductPrice(p)
    const pStones = productStoneTagsLower(p)

    const categoryMatch = !categories.length || categories.includes(category)
    const materialMatch = !materials.length || materials.includes(material)
    const colorMatch = !colors.length || colors.includes(color)
    const subtypeMatch = !subtypes.length || subtypes.includes(subtype)
    const minMatch = priceMin == null || (!Number.isNaN(priceValue) && priceValue >= priceMin)
    const maxMatch = priceMax == null || (!Number.isNaN(priceValue) && priceValue <= priceMax)
    const stoneMatch =
      !stoneTags.length || stoneTags.every((tag) => pStones.includes(tag))

    return categoryMatch && materialMatch && colorMatch && subtypeMatch && stoneMatch && minMatch && maxMatch
  })
}
