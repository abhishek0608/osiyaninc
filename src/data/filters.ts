import type { Color } from './products'

/**
 * Storefront filter facets.
 *
 * `src/data/products.ts` holds what a piece *is*; this file holds what shoppers
 * can *narrow by*, because the two diverge. A shopper picks "18K Rose Gold" —
 * one choice — where the catalogue records purity and colour on separate
 * fields. A shopper picks "Tennis Bracelet" where the catalogue may only know
 * `subtype: 'chain-bracelet'`. Each facet below therefore pairs the label the
 * storefront shows with a matcher that resolves it against whatever the record
 * actually carries.
 *
 * Facets are per-collection: `CollectionLink.preset.facets` names the ones a
 * page offers, and both the desktop sidebar and the mobile filter panel show
 * exactly that set, so a page's filter list is a merchandising edit rather than
 * a component change. The order they appear in is fixed by the components.
 */

export type FacetId =
  | 'price'
  | 'metal'
  | 'stone'
  | 'type'
  | 'category'
  | 'material'
  | 'stone-shape'
  | 'stone-size'

/** What a collection page offers when its preset names no facet set. */
export const DEFAULT_FACETS: FacetId[] = ['category', 'material', 'stone-shape', 'stone-size']

/** The order facets render in, whichever subset a page offers. */
export const FACET_ORDER: FacetId[] = [
  'price',
  'metal',
  'stone',
  'type',
  'category',
  'material',
  'stone-shape',
  'stone-size',
]

/** Lower-cased title + copy, the fallback source when a field is unrecorded. */
function productText(product: any): string {
  const parts = [product?.title, product?.description, product?.aiDescription]
  if (Array.isArray(product?.details)) parts.push(...product.details)
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(text)
}

// ------------------------------------------------------------------ Metal ---

export type MetalId = '14k-white' | '14k-yellow' | '18k-white' | '18k-yellow' | '18k-rose' | 'platinum'

export interface MetalOption {
  id: MetalId
  label: string
  /** Purity key as `normalizeMetalPurity` renders it. */
  purity: string
  /** Omitted for platinum, which the catalogue records with no colour axis. */
  color?: Color
}

export const METAL_OPTIONS: MetalOption[] = [
  { id: '14k-white', label: '14K White Gold', purity: '14k', color: 'white' },
  { id: '14k-yellow', label: '14K Yellow Gold', purity: '14k', color: 'yellow' },
  { id: '18k-white', label: '18K White Gold', purity: '18k', color: 'white' },
  { id: '18k-yellow', label: '18K Yellow Gold', purity: '18k', color: 'yellow' },
  { id: '18k-rose', label: '18K Rose Gold', purity: '18k', color: 'rose' },
  { id: 'platinum', label: 'Platinum', purity: 'platinum' },
]

export const METAL_IDS: MetalId[] = METAL_OPTIONS.map((option) => option.id)

export function isMetalId(value: unknown): value is MetalId {
  return typeof value === 'string' && (METAL_IDS as string[]).includes(value)
}

export function metalLabel(id: MetalId): string {
  return METAL_OPTIONS.find((option) => option.id === id)?.label ?? id
}

/**
 * Collapses the many spellings of a purity — "18k Gold", "18K", "18kt",
 * "Platinum", "Sterling Silver" — onto one key.
 */
export function normalizeMetalPurity(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('platinum') || /^pt\b/.test(raw)) return 'platinum'
  if (raw.includes('silver') || raw.includes('sterling')) return 'silver'
  const karat = raw.match(/(\d{1,2})\s*k/)
  return karat ? `${karat[1]}k` : ''
}

/**
 * The purities a piece is recorded in. `customizationOptions.metalPurities` is
 * the merchandised field; where it is empty the copy is read instead, so a
 * legacy record described as "18k yellow gold" still files under 18K.
 */
export function productMetalPurities(product: any): string[] {
  const recorded: unknown[] = Array.isArray(product?.customizationOptions?.metalPurities)
    ? product.customizationOptions.metalPurities
    : []
  const keys = new Set<string>(recorded.map(normalizeMetalPurity).filter(Boolean))
  if (keys.size) return [...keys]

  const text = productText(product)
  for (const match of text.matchAll(/(\d{1,2})\s*k(?:t|arat)?\b/g)) keys.add(`${match[1]}k`)
  if (hasWord(text, 'platinum')) keys.add('platinum')
  if (hasWord(text, 'silver') || hasWord(text, 'sterling')) keys.add('silver')
  return [...keys]
}

export function productHasMetal(product: any, id: MetalId): boolean {
  const option = METAL_OPTIONS.find((o) => o.id === id)
  if (!option) return false
  if (!productMetalPurities(product).includes(option.purity)) return false
  // Platinum carries no colour, so purity alone decides it.
  return !option.color || String(product?.color || '') === option.color
}

// ------------------------------------------------------------------ Stone ---

export type StoneId = 'amethyst' | 'sapphire' | 'diamond' | 'tourmaline' | 'ruby'

export const STONE_OPTIONS: { id: StoneId; label: string }[] = [
  { id: 'amethyst', label: 'Amethyst' },
  { id: 'sapphire', label: 'Sapphire' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'tourmaline', label: 'Tourmaline' },
  { id: 'ruby', label: 'Ruby' },
]

export const STONE_IDS: StoneId[] = STONE_OPTIONS.map((option) => option.id)

export function isStoneId(value: unknown): value is StoneId {
  return typeof value === 'string' && (STONE_IDS as string[]).includes(value)
}

export function stoneLabel(id: StoneId): string {
  return STONE_OPTIONS.find((option) => option.id === id)?.label ?? id
}

/**
 * `stoneTags` is the merchandised field. `customizationOptions.stoneTypes`
 * catches pieces recorded through the customisation picker instead ("Natural
 * Diamond"), and the copy catches the rest.
 */
export function productHasStone(product: any, id: StoneId): boolean {
  const tags = Array.isArray(product?.stoneTags) ? product.stoneTags : []
  if (tags.some((tag: unknown) => String(tag || '').trim().toLowerCase() === id)) return true

  const types = Array.isArray(product?.customizationOptions?.stoneTypes)
    ? product.customizationOptions.stoneTypes
    : []
  if (types.some((type: unknown) => String(type || '').toLowerCase().includes(id))) return true

  return hasWord(productText(product), id)
}

// ------------------------------------------------ Type (bangle/bracelet) ---

export type BangleBraceletTypeId = 'bangle' | 'gemstone-bracelet' | 'tennis-bracelet' | 'chain'

export const BANGLE_BRACELET_TYPE_OPTIONS: { id: BangleBraceletTypeId; label: string }[] = [
  { id: 'bangle', label: 'Bangle' },
  { id: 'gemstone-bracelet', label: 'Gemstone Bracelet' },
  { id: 'tennis-bracelet', label: 'Tennis Bracelet' },
  { id: 'chain', label: 'Chain' },
]

export const BANGLE_BRACELET_TYPE_IDS: BangleBraceletTypeId[] = BANGLE_BRACELET_TYPE_OPTIONS.map((option) => option.id)

export function isBangleBraceletTypeId(value: unknown): value is BangleBraceletTypeId {
  return typeof value === 'string' && (BANGLE_BRACELET_TYPE_IDS as string[]).includes(value)
}

export function bangleBraceletTypeLabel(id: BangleBraceletTypeId): string {
  return BANGLE_BRACELET_TYPE_OPTIONS.find((option) => option.id === id)?.label ?? id
}

/** Coloured stones — what separates a gemstone bracelet from a diamond one. */
const GEMSTONE_TAGS = ['emerald', 'ruby', 'sapphire', 'amethyst', 'tourmaline', 'topaz', 'garnet', 'pearl', 'kundan', 'polki']

/**
 * The Type a bangle or bracelet files under. The facet spans both categories —
 * the collection page they share is "Bracelets & Bangles" — so a Bangle is one
 * Type alongside the three bracelet ones rather than a category above them.
 *
 * The four ids are real `ProductSubtype` values, so merchandising can set them
 * exactly on the product record and this reads them straight off. Until it has,
 * the older `cuff` / `chain-bracelet` records are classified from category,
 * stones and copy — which keeps the facet and the mega-menu's Shop-by-style
 * links populated today, and makes them exact for free as records are filled in.
 *
 * Returns null outside Bangles and Bracelets: "Chain" means something different
 * on a necklace, and this facet is not offered there.
 */
export function bangleBraceletTypeOf(product: any): BangleBraceletTypeId | null {
  const category = String(product?.category || '').toLowerCase()
  if (category !== 'bracelets' && category !== 'bracelet' && category !== 'bangles' && category !== 'bangle') {
    return null
  }

  const subtype = String(product?.subtype || '')
  if (isBangleBraceletTypeId(subtype)) return subtype

  const text = productText(product)
  // Tennis first: a tennis bracelet is a diamond line that would otherwise read
  // as a plain chain.
  if (hasWord(text, 'tennis')) return 'tennis-bracelet'
  if (category.startsWith('bangle') || subtype === 'cuff' || hasWord(text, 'bangle') || hasWord(text, 'kada')) {
    return 'bangle'
  }

  const tags = (Array.isArray(product?.stoneTags) ? product.stoneTags : []).map((tag: unknown) =>
    String(tag || '').trim().toLowerCase(),
  )
  if (GEMSTONE_TAGS.some((gem) => tags.includes(gem) || hasWord(text, gem))) return 'gemstone-bracelet'
  if (subtype === 'chain-bracelet' || hasWord(text, 'chain') || hasWord(text, 'link')) return 'chain'
  return null
}

export function productHasBangleBraceletType(product: any, id: BangleBraceletTypeId): boolean {
  return bangleBraceletTypeOf(product) === id
}

// ------------------------------------------------------------------ Price ---

export interface PriceBounds {
  min: number
  max: number
}

/** Whole-dollar list price, however the payload happened to carry it. */
export function productPriceValue(product: any): number {
  const value = Number(product?.priceValue)
  if (Number.isFinite(value) && value > 0) return value
  const parsed = Number(String(product?.price || '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The slider's ends, taken from the pieces actually in scope — so the Bracelets
 * page opens on the bracelet catalogue's own span rather than the whole site's.
 * Null when nothing in scope is priced, which leaves the facet hidden.
 */
export function priceBoundsFor(products: any[]): PriceBounds | null {
  const values = (Array.isArray(products) ? products : []).map(productPriceValue).filter((v) => v > 0)
  if (!values.length) return null
  const min = Math.floor(Math.min(...values))
  const max = Math.ceil(Math.max(...values))
  return min === max ? { min, max: max + 1 } : { min, max }
}

export function formatPrice(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`
}
