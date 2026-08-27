import type { Color } from './products'

/**
 * Storefront filter facets.
 *
 * `src/data/products.ts` holds what a piece *is*; this file holds what shoppers
 * can *narrow by*, because the two diverge. A shopper picks "18K Rose Gold" —
 * one choice — where the catalogue records purity and colour on separate
 * fields. A shopper picks "Tennis Bracelet" or "Dangle and drop" where the
 * catalogue may only know `subtype: 'chain-bracelet'`. Each facet below
 * therefore pairs the label the storefront shows with a matcher that resolves
 * it against whatever the record actually carries.
 *
 * Facets are per-collection, and so are their options and their order:
 * `CollectionLink.preset` names the facets a page offers, in the order it wants
 * them, plus which metals, stones and Types that page sells. Both the desktop
 * rail and the mobile panel render from that, so a page's filter list is a
 * merchandising edit rather than a component change. Bracelets & Bangles wants
 * Price, Metal, Stone, Type over five stones; Earrings wants Price, Stone,
 * Metal, Type over 24 stones and its own four Types; Rings wants only Price and
 * Type.
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

/** Section heading per facet, shared by the desktop rail and the mobile panel. */
export const FACET_HEADINGS: Record<FacetId, string> = {
  price: 'Price',
  metal: 'Metal',
  stone: 'Stone',
  type: 'Type',
  category: 'Category',
  material: 'Material',
  'stone-shape': 'Stone Shape',
  'stone-size': 'Stone Size',
}

/** A pickable value in one of the checkbox facets. */
export interface FacetOption {
  id: string
  label: string
}

/** Lower-cased title + copy, the fallback source when a field is unrecorded. */
function productText(product: any): string {
  const parts = [product?.title, product?.description, product?.aiDescription]
  if (Array.isArray(product?.details)) parts.push(...product.details)
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(text)
}

function normalizeTag(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
}

function tagList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeTag).filter(Boolean) : []
}

/** Keeps the caller's order, falling back to the whole registry. */
function pickOptions<T extends { id: string }>(registry: readonly T[], ids?: readonly string[]): T[] {
  if (!ids) return [...registry]
  return ids
    .map((id) => registry.find((option) => option.id === id))
    .filter((option): option is T => Boolean(option))
}

// ------------------------------------------------------------------ Metal ---

export type MetalId =
  | '14k-white'
  | '14k-yellow'
  | '14k-rose'
  | '18k-white'
  | '18k-yellow'
  | '18k-rose'
  | 'platinum'

export interface MetalOption extends FacetOption {
  id: MetalId
  /** Purity key as `normalizeMetalPurity` renders it. */
  purity: string
  /** Omitted for platinum, which the catalogue records with no colour axis. */
  color?: Color
}

export const METAL_OPTIONS: MetalOption[] = [
  { id: '14k-white', label: '14K White Gold', purity: '14k', color: 'white' },
  { id: '14k-yellow', label: '14K Yellow Gold', purity: '14k', color: 'yellow' },
  { id: '14k-rose', label: '14K Rose Gold', purity: '14k', color: 'rose' },
  { id: '18k-white', label: '18K White Gold', purity: '18k', color: 'white' },
  { id: '18k-yellow', label: '18K Yellow Gold', purity: '18k', color: 'yellow' },
  { id: '18k-rose', label: '18K Rose Gold', purity: '18k', color: 'rose' },
  { id: 'platinum', label: 'Platinum', purity: 'platinum' },
]

export const METAL_IDS: MetalId[] = METAL_OPTIONS.map((option) => option.id)

export function isMetalId(value: unknown): value is MetalId {
  return typeof value === 'string' && (METAL_IDS as string[]).includes(value)
}

export function metalOptionsFor(ids?: readonly MetalId[]): MetalOption[] {
  return pickOptions(METAL_OPTIONS, ids)
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

export type StoneId =
  | 'tourmaline'
  | 'aquamarine'
  | 'lemon-quartz'
  | 'amethyst'
  | 'multi-sapphire'
  | 'ruby'
  | 'pink-sapphire'
  | 'mexican-fire-opal'
  | 'rubellite'
  | 'blue-topaz'
  | 'sapphire'
  | 'diamond'
  | 'ethiopian-opal'
  | 'tanzanite'
  | 'sunstone'
  | 'moonstone'
  | 'green-sapphire'
  | 'coral'
  | 'citrine'
  | 'peridot'
  | 'prehnite'
  | 'spinel'
  | 'morganite'
  | 'turquoise'

export interface StoneOption extends FacetOption {
  id: StoneId
  /**
   * Spellings that count as this stone. Covers how the catalogue and the
   * merchandising sheet each write it, so the storefront's "Ethopian Opal"
   * still matches a record tagged "ethiopian opal".
   */
  aliases: string[]
  /**
   * Words that disqualify a copy match. Plain Sapphire must not swallow the
   * pink, green and multi variants the merchandiser listed separately.
   */
  notWhen?: string[]
}

const SAPPHIRE_QUALIFIERS = ['pink', 'green', 'multi']

/** Labels are the merchandiser's own, including their spellings. */
export const STONE_OPTIONS: StoneOption[] = [
  { id: 'tourmaline', label: 'Tourmaline', aliases: ['tourmaline'] },
  { id: 'aquamarine', label: 'Aquamarine', aliases: ['aquamarine'] },
  { id: 'lemon-quartz', label: 'Lemon Quartz', aliases: ['lemon quartz'] },
  { id: 'amethyst', label: 'Amethyst', aliases: ['amethyst'] },
  {
    id: 'multi-sapphire',
    label: 'Multi Sapphire',
    aliases: ['multi sapphire', 'multi colour sapphire', 'multi color sapphire'],
  },
  { id: 'ruby', label: 'Ruby', aliases: ['ruby', 'rubies'] },
  { id: 'pink-sapphire', label: 'Pink Sapphire', aliases: ['pink sapphire'] },
  {
    id: 'mexican-fire-opal',
    label: 'Mexican Fire Opals',
    aliases: ['mexican fire opals', 'mexican fire opal', 'fire opal'],
  },
  { id: 'rubellite', label: 'Rubellite', aliases: ['rubellite'] },
  { id: 'blue-topaz', label: 'Blue Topaz', aliases: ['blue topaz'] },
  { id: 'sapphire', label: 'Sapphire', aliases: ['sapphire'], notWhen: SAPPHIRE_QUALIFIERS },
  { id: 'diamond', label: 'Diamond', aliases: ['diamond', 'diamonds'] },
  { id: 'ethiopian-opal', label: 'Ethopian Opal', aliases: ['ethopian opal', 'ethiopian opal'] },
  { id: 'tanzanite', label: 'Tanzanite', aliases: ['tanzanite'] },
  { id: 'sunstone', label: 'Sun stone', aliases: ['sun stone', 'sunstone'] },
  { id: 'moonstone', label: 'Moon stone', aliases: ['moon stone', 'moonstone'] },
  { id: 'green-sapphire', label: 'Green Sapphire', aliases: ['green sapphire'] },
  { id: 'coral', label: 'Coral', aliases: ['coral'] },
  { id: 'citrine', label: 'Citrine', aliases: ['citrine'] },
  { id: 'peridot', label: 'Peridot', aliases: ['peridot'] },
  { id: 'prehnite', label: 'Prenhite', aliases: ['prenhite', 'prehnite'] },
  { id: 'spinel', label: 'Spinel', aliases: ['spinel'] },
  { id: 'morganite', label: 'Morganite', aliases: ['morganite'] },
  { id: 'turquoise', label: 'Turquoise', aliases: ['turquoise'] },
]

export const STONE_IDS: StoneId[] = STONE_OPTIONS.map((option) => option.id)

export function isStoneId(value: unknown): value is StoneId {
  return typeof value === 'string' && (STONE_IDS as string[]).includes(value)
}

export function stoneOptionsFor(ids?: readonly StoneId[]): StoneOption[] {
  return pickOptions(STONE_OPTIONS, ids)
}

export function stoneLabel(id: StoneId): string {
  return STONE_OPTIONS.find((option) => option.id === id)?.label ?? id
}

/**
 * Does `phrase` appear in `text` without one of `notWhen` in front of it? Used
 * so "pink sapphire" in a description does not also register as a Sapphire.
 */
function phraseHit(text: string, phrase: string, notWhen: readonly string[] = []): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:(\\w+)\\s+)?\\b${escaped}\\b`, 'g')
  for (const match of text.matchAll(re)) {
    if (!notWhen.includes((match[1] || '').toLowerCase())) return true
  }
  return false
}

/**
 * `stoneTags` is the merchandised field and is matched exactly, so a piece
 * tagged "pink sapphire" files under Pink Sapphire only.
 * `customizationOptions.stoneTypes` and the copy are phrase-matched, which
 * catches "Natural Diamond" and a description that names the stone.
 */
export function productHasStone(product: any, id: StoneId): boolean {
  const option = STONE_OPTIONS.find((o) => o.id === id)
  if (!option) return false

  const tags = tagList(product?.stoneTags)
  if (tags.some((tag) => option.aliases.includes(tag))) return true

  const types = tagList(product?.customizationOptions?.stoneTypes)
  if (types.some((type) => option.aliases.some((alias) => phraseHit(type, alias, option.notWhen)))) return true

  // Only fall through to the copy when the piece carries no stone tags at all.
  // A tagged record has already given its answer, and re-reading its prose
  // would let a passing mention overrule the merchandiser.
  if (tags.length) return false
  const text = productText(product)
  return option.aliases.some((alias) => phraseHit(text, alias, option.notWhen))
}

// ------------------------------------------------------------------- Type ---

export type PieceTypeId =
  // Bracelets & Bangles
  | 'bangle'
  | 'gemstone-bracelet'
  | 'tennis-bracelet'
  | 'chain'
  // Earrings
  | 'hoops'
  | 'studs'
  | 'dangle-drop'
  | 'statement-earring'
  // Rings
  | 'stackable'
  | 'statement-ring'
  | 'bridal'
  | 'gemstone-ring'

interface TypeContext {
  category: string
  subtype: string
  /** Title alone. Some words only mean the silhouette when they name the piece:
   *  a solitaire's prose can mention its "delicate band" without being one. */
  title: string
  text: string
  stones: string[]
  styles: string[]
}

export interface PieceTypeOption extends FacetOption {
  id: PieceTypeId
  /**
   * How a record that doesn't name this Type outright is still read as it.
   *
   * Every legacy subtype is read here rather than in a short-circuit above,
   * because the exclusions live here: a tennis bracelet is still filed as
   * `chain-bracelet`, and matching that subtype before the `!isTennis` guard
   * would file it under Chain as well.
   */
  infer: (ctx: TypeContext) => boolean
}

/** Coloured stones — what separates a gemstone bracelet from a diamond one. */
const COLOURED_STONES = [
  'emerald', 'ruby', 'sapphire', 'amethyst', 'tourmaline', 'topaz', 'garnet', 'pearl',
  'kundan', 'polki', 'aquamarine', 'citrine', 'peridot', 'tanzanite', 'turquoise',
  'coral', 'opal', 'spinel', 'morganite', 'moonstone', 'sunstone', 'rubellite',
]

const isBangleish = (c: TypeContext) =>
  c.category.startsWith('bangle') || c.subtype === 'cuff' || hasWord(c.text, 'bangle') || hasWord(c.text, 'kada')
const isTennis = (c: TypeContext) => hasWord(c.text, 'tennis')
const isBraceletCategory = (c: TypeContext) => c.category.startsWith('bracelet')
const hasColouredStone = (c: TypeContext) =>
  COLOURED_STONES.some((gem) => c.stones.includes(gem) || hasWord(c.text, gem))

const isStatementish = (c: TypeContext) => c.styles.includes('statement') || hasWord(c.text, 'statement')
const isHoopish = (c: TypeContext) => hasWord(c.text, 'hoops?') || hasWord(c.text, 'huggies?') || hasWord(c.text, 'creoles?')
const isDangleish = (c: TypeContext) =>
  hasWord(c.text, 'drops?') || hasWord(c.text, 'dangles?') || hasWord(c.text, 'chandeliers?') || hasWord(c.text, 'jhumkas?')

/**
 * Every Type the storefront can filter by, across categories. A collection
 * names the ones it sells via `preset.typeOptions`, which is also the order they
 * render in — there is no sensible default, since Chain means one thing on a
 * bracelet and nothing on an earring.
 *
 * Each id is a real `ProductSubtype`, so merchandising can set it exactly on the
 * record and `productHasPieceType` reads it straight off. `infer` covers the
 * records that predate the Type — a bracelet still filed as `chain-bracelet`, an
 * earring as `drop` — which keeps the facet and the mega menu's Shop-by-style
 * links populated today and makes them exact as records are refiled.
 *
 * Bracelet Types are written to stay mutually exclusive: a tennis bracelet is a
 * diamond line that would otherwise read as a plain chain, and a bangle is not
 * a gemstone bracelet even when it is set with emeralds. Earring Types are
 * deliberately allowed to overlap — a chandelier is both a drop and a statement
 * piece, and a shopper who ticks either should find it.
 */
export const PIECE_TYPE_OPTIONS: PieceTypeOption[] = [
  {
    id: 'bangle',
    label: 'Bangle',
    infer: (c) => isBangleish(c) && !isTennis(c),
  },
  {
    id: 'gemstone-bracelet',
    label: 'Gemstone Bracelet',
    infer: (c) => isBraceletCategory(c) && hasColouredStone(c) && !isBangleish(c) && !isTennis(c),
  },
  {
    id: 'tennis-bracelet',
    label: 'Tennis Bracelet',
    infer: isTennis,
  },
  {
    id: 'chain',
    label: 'Chain',
    infer: (c) =>
      isBraceletCategory(c) &&
      (c.subtype === 'chain-bracelet' || hasWord(c.text, 'chain') || hasWord(c.text, 'link')) &&
      !isBangleish(c) &&
      !isTennis(c),
  },
  {
    id: 'hoops',
    label: 'Hoops',
    infer: isHoopish,
  },
  {
    // `stud` was the old taxonomy's catch-all for any earring that wasn't a
    // drop — it had no `hoops` value — so a record filed as `stud` whose copy
    // says "hoops" is a hoop. The copy outranks that subtype; the subtype is
    // only believed when the copy names no silhouette of its own.
    id: 'studs',
    label: 'Studs',
    infer: (c) => hasWord(c.text, 'studs?') || (c.subtype === 'stud' && !isHoopish(c) && !isDangleish(c)),
  },
  {
    id: 'dangle-drop',
    label: 'Dangle and drop',
    infer: (c) => c.subtype === 'drop' || c.subtype === 'jhumka' || isDangleish(c),
  },
  {
    id: 'statement-earring',
    label: 'Statement Earring',
    infer: isStatementish,
  },
  {
    // "Band" is read off the title only: a solitaire's description can mention
    // its delicate band without the ring being one to stack.
    id: 'stackable',
    label: 'Stackable',
    infer: (c) =>
      hasWord(c.text, 'stackable') || hasWord(c.text, 'stacking') ||
      hasWord(c.title, 'bands?') || hasWord(c.text, 'eternity'),
  },
  {
    id: 'statement-ring',
    label: 'Statement',
    infer: isStatementish,
  },
  {
    // Solitaires count even untagged: the house sells them as the engagement
    // ring, which is what this Type is for.
    id: 'bridal',
    label: 'Bridal',
    infer: (c) =>
      c.styles.includes('bridal') || c.subtype === 'solitaire' ||
      hasWord(c.text, 'bridal') || hasWord(c.text, 'engagement') || hasWord(c.text, 'wedding'),
  },
  {
    id: 'gemstone-ring',
    label: 'Gemstone',
    infer: hasColouredStone,
  },
]

/** Types are only offered on the categories that have them. */
const TYPE_CATEGORIES: Record<PieceTypeId, string[]> = {
  bangle: ['bracelet', 'bracelets', 'bangle', 'bangles'],
  'gemstone-bracelet': ['bracelet', 'bracelets', 'bangle', 'bangles'],
  'tennis-bracelet': ['bracelet', 'bracelets', 'bangle', 'bangles'],
  chain: ['bracelet', 'bracelets', 'bangle', 'bangles'],
  hoops: ['earring', 'earrings'],
  studs: ['earring', 'earrings'],
  'dangle-drop': ['earring', 'earrings'],
  'statement-earring': ['earring', 'earrings'],
  stackable: ['ring', 'rings'],
  'statement-ring': ['ring', 'rings'],
  bridal: ['ring', 'rings'],
  'gemstone-ring': ['ring', 'rings'],
}

export const PIECE_TYPE_IDS: PieceTypeId[] = PIECE_TYPE_OPTIONS.map((option) => option.id)

export function isPieceTypeId(value: unknown): value is PieceTypeId {
  return typeof value === 'string' && (PIECE_TYPE_IDS as string[]).includes(value)
}

/** No default: a page must name the Types it sells, or the facet is hidden. */
export function pieceTypeOptionsFor(ids?: readonly PieceTypeId[]): PieceTypeOption[] {
  return ids ? pickOptions(PIECE_TYPE_OPTIONS, ids) : []
}

export function pieceTypeLabel(id: PieceTypeId): string {
  return PIECE_TYPE_OPTIONS.find((option) => option.id === id)?.label ?? id
}

/**
 * Subtypes a mega-menu link may carry that *mean* one of the Types.
 *
 * Deliberately narrower than `PieceTypeOption.subtypes`: a jhumka counts as a
 * Dangle and drop when matching a product, but `?style=jhumka` must keep
 * filtering to jhumkas rather than widening to every dangle on the page.
 */
const STYLE_TO_TYPE: Record<string, PieceTypeId> = {
  stud: 'studs',
  drop: 'dangle-drop',
  cuff: 'bangle',
  'chain-bracelet': 'chain',
}

/**
 * Mega-menu links predate the Type facet and still carry a subtype
 * (`?style=stud`). Mapping those onto the Type they became lets an existing link
 * land with the matching box ticked instead of applying a filter the page shows
 * no control for.
 */
export function pieceTypeForStyle(style: string): PieceTypeId | null {
  if (isPieceTypeId(style)) return style
  return STYLE_TO_TYPE[style] ?? null
}

export function productHasPieceType(product: any, id: PieceTypeId): boolean {
  const option = PIECE_TYPE_OPTIONS.find((o) => o.id === id)
  if (!option) return false

  const category = String(product?.category || '').trim().toLowerCase()
  if (!TYPE_CATEGORIES[id].includes(category)) return false

  // An explicitly set Type wins; everything else goes through the guards.
  const subtype = String(product?.subtype || '')
  if (subtype === id) return true

  return option.infer({
    category,
    subtype,
    title: String(product?.title || '').toLowerCase(),
    text: productText(product),
    stones: tagList(product?.stoneTags),
    styles: tagList(product?.styleTags),
  })
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
 * The slider's ends, taken from the pieces actually in scope — so the Earrings
 * page opens on the earring catalogue's own span rather than the whole site's.
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
