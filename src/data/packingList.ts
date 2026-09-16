// The supplier's packing list is the file products are imported from and
// exported to. Its layout is one row per physical piece (one BAG NO) plus one
// continuation row per extra stone line, with the stone data in three parallel
// column groups: D* round diamonds, F* fancy cuts, C* the coloured stone.
//
//   Sr.No | BAG NO | Style No | Type | COLLECTION | Qty | Gross Wt | Kt/Col | Net Wt
//   | Gold Rate | Gold Value | DShape DQuality DPcs DCts | F… | C… | PRICE
//
// The storefront's own fields map onto it as: slug ← BAG NO (slugified),
// title ← Style No, category ← Type, and Kt/Col ← metal purity + colour
// (`14KTYG` = 14 karat, yellow gold). Both the import and the export go through
// this module so a file exported here re-imports without loss.

import { CATEGORIES, COLORS, METAL_PURITY_OPTIONS } from './products'

export const PACKING_LIST_COLUMNS = [
  'Sr.No', 'BAG NO', 'Style No', 'Type', 'COLLECTION', 'Qty', 'Gross Wt', 'Kt/Col', 'Net Wt',
  'Gold Rate', 'Gold Value',
  'DShape', 'DQuality', 'DPcs', 'DCts',
  'FShape', 'FQuality', 'FPcs', 'FCts',
  'CShape', 'CQuality', 'CPcs', 'CCts',
  'PRICE',
] as const

export type StoneGroup = 'D' | 'F' | 'C'
export const STONE_GROUPS: StoneGroup[] = ['D', 'F', 'C']

export interface StoneLine {
  group: StoneGroup
  shape: string
  quality: string
  pcs: string
  cts: string
}

/** One product as the bulk-import API expects it. */
export interface ImportRow {
  slug: string
  title: string
  category: string
  subtype?: string
  material: string
  color: string
  price?: string
  description?: string
  qty?: string
  bagNo: string
  styleNo: string
  grossWeight: string
  netWeight: string
  goldRate: string
  goldValue: string
  metalPurity: string
  centerStoneSize?: string
  stoneLines: StoneLine[]
  styleTags?: string[]
  stoneTags?: string[]
  isNewArrival?: string
  isBestSeller?: string
  active?: string
  rating?: string
  reviewCount?: string
  /** Sheet columns the row could not be built from, in the sheet's own words. */
  missing: string[]
  /** 1-based sheet row the piece starts on, for error messages. */
  sheetRow: number
}

// ------------------------------------------------------------- headers ---

const normKey = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Every spelling a column may arrive under. The packing list's own headers come
// first; the old CSV template's camelCase names are kept so those files still
// load. Matching ignores case, spaces and punctuation ("Gross Wt" == "grosswt").
const HEADER_ALIASES: Record<string, string[]> = {
  srNo: ['srno', 'sno', 'sr', 'serial'],
  bagNo: ['bagno', 'badge', 'bag', 'bagnumber'],
  slug: ['slug'],
  styleNo: ['styleno', 'style', 'stylenumber'],
  title: ['title'],
  category: ['type', 'category'],
  subtype: ['subtype'],
  collection: ['collection', 'styletags'],
  qty: ['qty', 'quantity'],
  grossWeight: ['grosswt', 'grossweight', 'gwt'],
  ktCol: ['ktcol', 'kt', 'ktcolour', 'ktcolor', 'metal'],
  material: ['material'],
  color: ['color', 'colour'],
  metalPurity: ['metalpurity', 'purity'],
  netWeight: ['netwt', 'netweight', 'nwt'],
  goldRate: ['goldrate', 'rate'],
  goldValue: ['goldvalue', 'goldval'],
  dShape: ['dshape'], dQuality: ['dquality', 'dqlty'], dPcs: ['dpcs'], dCts: ['dcts', 'dct'],
  fShape: ['fshape'], fQuality: ['fquality', 'fqlty'], fPcs: ['fpcs'], fCts: ['fcts', 'fct'],
  cShape: ['cshape'], cQuality: ['cquality', 'cqlty'], cPcs: ['cpcs'], cCts: ['ccts', 'cct'],
  price: ['price', 'amount', 'usd'],
  description: ['description'],
  centerStoneSize: ['centerstonesize', 'centrestonesize', 'stonesize'],
  stoneLines: ['stonelines'],
  stoneTags: ['stonetags'],
  isNewArrival: ['isnewarrival', 'newarrival'],
  isBestSeller: ['isbestseller', 'bestseller'],
  active: ['active'],
  rating: ['rating'],
  reviewCount: ['reviewcount'],
}

type ColumnIndex = Partial<Record<keyof typeof HEADER_ALIASES, number>>

function indexHeaders(headers: unknown[]): ColumnIndex {
  const keys = headers.map(normKey)
  const index: ColumnIndex = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const at = keys.indexOf(alias)
      if (at !== -1) { index[field as keyof ColumnIndex] = at; break }
    }
  }
  return index
}

/**
 * The header row is the first row naming a piece identifier (BAG NO / slug);
 * Numbers and Excel exports often put a title or blank row above it.
 */
export function findHeaderRow(grid: unknown[][]): number {
  const limit = Math.min(grid.length, 10)
  for (let i = 0; i < limit; i++) {
    const index = indexHeaders(grid[i] ?? [])
    if (index.bagNo !== undefined || index.slug !== undefined) return i
  }
  return -1
}

// --------------------------------------------------------------- Kt/Col ---

export interface KtCol {
  /** As `METAL_PURITY_OPTIONS` spells it, e.g. `14k Gold`. */
  metalPurity: string
  material: string
  color: string
}

const COLOUR_BY_CODE: Record<string, string> = {
  Y: 'yellow', YG: 'yellow', YL: 'yellow', YEL: 'yellow', YELLOW: 'yellow',
  W: 'white', WG: 'white', WH: 'white', WHT: 'white', WHITE: 'white',
  P: 'rose', PG: 'rose', PK: 'rose', PINK: 'rose', R: 'rose', RG: 'rose', RS: 'rose', ROSE: 'rose',
}

/**
 * `14KTYG` → 14k Gold, yellow. `18KTPG` → 18k Gold, rose (P = pink). `PT` →
 * Platinum. `SLV` / `925` → Sterling Silver (`SLVOX` oxidised). Returns null
 * when the cell cannot be read, so the row is flagged instead of guessed.
 */
export function parseKtCol(raw: unknown): KtCol | null {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!s) return null

  if (s.includes('PLAT') || /^PT/.test(s) || /PT$/.test(s)) {
    return { metalPurity: 'Platinum', material: 'platinum', color: 'white' }
  }
  if (s.includes('SILVER') || s.includes('SLV') || s.startsWith('SL') || s.includes('925')) {
    return { metalPurity: 'Sterling Silver', material: 'silver', color: s.includes('OX') ? 'oxidised' : 'white' }
  }

  const match = s.match(/^(\d{1,2})\s*(?:KT|K)?\s*([A-Z]*)$/)
  if (!match) return null
  const karat = match[1] as string
  const colourCode = match[2] || ''
  const purity = METAL_PURITY_OPTIONS.find((option) => option.startsWith(`${karat}k `))
  if (!purity) return null
  const color = COLOUR_BY_CODE[colourCode] || COLOUR_BY_CODE[colourCode.charAt(0)] || ''
  if (!color) return null
  return { metalPurity: purity, material: 'gold', color }
}

const COLOUR_CODE: Record<string, string> = { yellow: 'YG', white: 'WG', rose: 'PG', oxidised: 'OX' }

/** The inverse of `parseKtCol`: 14k Gold + yellow → `14KTYG`. */
export function formatKtCol(metalPurity: unknown, color: unknown): string {
  const purity = String(metalPurity ?? '').trim().toLowerCase()
  const colour = String(color ?? '').trim().toLowerCase()
  if (purity.includes('platinum')) return 'PT'
  if (purity.includes('silver') || purity.includes('sterling')) return colour === 'oxidised' ? 'SLVOX' : 'SLV'
  const karat = purity.match(/(\d{1,2})\s*k/)
  const code = COLOUR_CODE[colour] || ''
  if (!karat) return code
  return `${karat[1]}KT${code}`
}

// --------------------------------------------------------------- Type ---

const TYPE_TO_CATEGORY: Record<string, string> = {
  ring: 'Rings', rings: 'Rings',
  earring: 'Earrings', earrings: 'Earrings', ear: 'Earrings',
  necklace: 'Necklaces', necklaces: 'Necklaces', pendant: 'Necklaces', pendants: 'Necklaces', neckpiece: 'Necklaces',
  bracelet: 'Bracelets', bracelets: 'Bracelets',
  bangle: 'Bangles', bangles: 'Bangles', kada: 'Bangles',
  mangalsutra: 'Mangal Sutra', mangalsutras: 'Mangal Sutra',
}

/** `RING` → `Rings`. Unknown types are kept as typed so nothing is silently dropped. */
export function typeToCategory(raw: unknown): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  const key = normKey(text)
  if (TYPE_TO_CATEGORY[key]) return TYPE_TO_CATEGORY[key]
  const exact = CATEGORIES.find((category) => normKey(category) === key)
  return exact || text
}

/** `Rings` → `RING`, the singular upper-case spelling the packing list uses. */
export function categoryToType(category: unknown): string {
  const text = String(category ?? '').trim()
  if (!text) return ''
  const singular = text.endsWith('s') && !/sutra$/i.test(text) ? text.slice(0, -1) : text
  return singular.toUpperCase()
}

// ------------------------------------------------------------ pieces in ---

const cell = (row: unknown[], at: number | undefined) => (at === undefined ? '' : String(row[at] ?? '').trim())

const STONE_COLUMNS: Record<StoneGroup, [keyof ColumnIndex, keyof ColumnIndex, keyof ColumnIndex, keyof ColumnIndex]> = {
  D: ['dShape', 'dQuality', 'dPcs', 'dCts'],
  F: ['fShape', 'fQuality', 'fPcs', 'fCts'],
  C: ['cShape', 'cQuality', 'cPcs', 'cCts'],
}

function stoneLinesFromRow(row: unknown[], index: ColumnIndex): StoneLine[] {
  const lines: StoneLine[] = []
  for (const group of STONE_GROUPS) {
    const [shapeAt, qualityAt, pcsAt, ctsAt] = STONE_COLUMNS[group]
    const line: StoneLine = {
      group,
      shape: cell(row, index[shapeAt]),
      quality: cell(row, index[qualityAt]),
      pcs: cell(row, index[pcsAt]),
      cts: cell(row, index[ctsAt]),
    }
    if (line.shape || line.quality || line.pcs || line.cts) lines.push(line)
  }
  return lines
}

// The old template packs stone lines into one cell: lines split on `|`, the
// five fields inside a line on `:`, in the order group:shape:quality:pcs:cts.
export function parseStoneLinesCell(raw: unknown): StoneLine[] {
  return String(raw ?? '')
    .split('|')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [group, shape, quality, pcs, cts] = chunk.split(':').map((v) => v.trim())
      const upper = String(group || '').toUpperCase() as StoneGroup
      return {
        group: STONE_GROUPS.includes(upper) ? upper : 'D',
        shape: shape || '',
        quality: quality || '',
        pcs: pcs || '',
        cts: cts || '',
      }
    })
    .filter((line) => line.shape || line.quality || line.pcs || line.cts)
}

export function toSlug(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const splitList = (raw: string) => raw.split(/[|,]/).map((v) => v.trim()).filter(Boolean)

const TOTAL_ROW = /^(grand\s*)?total$/i

/**
 * Turns the parsed sheet (header row + data rows) into one row per piece.
 * Continuation rows (no BAG NO, only stone cells) attach their stone lines to
 * the piece above; `Total` / `Grand Total` footers and blank rows are skipped.
 * Returns null when no header row can be found.
 */
export function gridToImportRows(grid: unknown[][]): { rows: ImportRow[]; headerRow: number } | null {
  const headerRow = findHeaderRow(grid)
  if (headerRow === -1) return null
  const index = indexHeaders(grid[headerRow] ?? [])

  const rows: ImportRow[] = []
  let current: ImportRow | null = null

  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? []
    const bagNo = cell(row, index.bagNo)
    const slugCell = cell(row, index.slug)
    const styleNo = cell(row, index.styleNo)
    const titleCell = cell(row, index.title)
    const stoneLines = [...stoneLinesFromRow(row, index), ...parseStoneLinesCell(cell(row, index.stoneLines))]

    if (TOTAL_ROW.test(styleNo) || TOTAL_ROW.test(bagNo) || TOTAL_ROW.test(titleCell)) { current = null; continue }

    const startsPiece = Boolean(bagNo || slugCell || styleNo || titleCell)
    if (!startsPiece) {
      // A row with only stone cells continues the piece above it.
      if (current && stoneLines.length) current.stoneLines.push(...stoneLines)
      continue
    }

    const ktCol = parseKtCol(cell(row, index.ktCol))
    const material = cell(row, index.material) || ktCol?.material || ''
    const color = cell(row, index.color) || ktCol?.color || ''
    const metalPurity = cell(row, index.metalPurity) || ktCol?.metalPurity || ''
    const slug = slugCell || toSlug(bagNo)
    const title = titleCell || styleNo
    const category = typeToCategory(cell(row, index.category))

    const missing: string[] = []
    if (!slug) missing.push(index.bagNo !== undefined || index.slug === undefined ? 'BAG NO' : 'slug')
    if (!title) missing.push(index.styleNo !== undefined || index.title === undefined ? 'Style No' : 'title')
    if (!category) missing.push('Type')
    if (!material || !color) missing.push('Kt/Col')

    const collection = cell(row, index.collection)
    const stoneTags = cell(row, index.stoneTags)

    current = {
      slug,
      title,
      category,
      subtype: index.subtype === undefined ? undefined : cell(row, index.subtype),
      material,
      color,
      price: index.price === undefined ? undefined : cell(row, index.price),
      description: index.description === undefined ? undefined : cell(row, index.description),
      qty: index.qty === undefined ? undefined : cell(row, index.qty),
      bagNo: bagNo || slug,
      styleNo: styleNo || title,
      grossWeight: cell(row, index.grossWeight),
      netWeight: cell(row, index.netWeight),
      goldRate: cell(row, index.goldRate),
      goldValue: cell(row, index.goldValue),
      metalPurity,
      centerStoneSize: index.centerStoneSize === undefined ? undefined : cell(row, index.centerStoneSize),
      stoneLines,
      styleTags: index.collection === undefined ? undefined : splitList(collection),
      stoneTags: index.stoneTags === undefined ? undefined : splitList(stoneTags),
      isNewArrival: index.isNewArrival === undefined ? undefined : cell(row, index.isNewArrival),
      isBestSeller: index.isBestSeller === undefined ? undefined : cell(row, index.isBestSeller),
      active: index.active === undefined ? undefined : cell(row, index.active),
      rating: index.rating === undefined ? undefined : cell(row, index.rating),
      reviewCount: index.reviewCount === undefined ? undefined : cell(row, index.reviewCount),
      missing,
      sheetRow: i + 1,
    }
    rows.push(current)
  }

  return { rows, headerRow }
}

// ----------------------------------------------------------- pieces out ---

/** What the export needs to know about a product to write its packing-list rows. */
export interface ExportPiece {
  bagNo?: string
  slug: string
  styleNo?: string
  title: string
  category: string
  styleTags?: string[] | string
  qty?: string | number | null
  grossWeight?: string
  metalPurity?: string
  color?: string
  netWeight?: string
  goldRate?: string
  goldValue?: string
  stoneLines?: StoneLine[] | string
  price?: string | number | null
}

type Cell = string | number

/** Numeric-looking text becomes a number so Excel can sum it; anything else stays text. */
function numeric(value: unknown): Cell {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) && /^-?[\d,]*\.?\d+$/.test(text) ? n : text
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/**
 * Builds the packing-list grid: the header row, one row per piece with its
 * first D/F/C stone lines, one continuation row per further stone line, and a
 * Total footer. The output loads back through `gridToImportRows` unchanged.
 */
export function piecesToGrid(pieces: ExportPiece[]): Cell[][] {
  const grid: Cell[][] = [[...PACKING_LIST_COLUMNS]]
  const width = PACKING_LIST_COLUMNS.length
  const col = (name: (typeof PACKING_LIST_COLUMNS)[number]) => PACKING_LIST_COLUMNS.indexOf(name)
  const blank = () => Array.from({ length: width }, () => '' as Cell)
  const totals = { qty: 0, gross: 0, net: 0, goldValue: 0, pcs: { D: 0, F: 0, C: 0 }, cts: { D: 0, F: 0, C: 0 } }

  pieces.forEach((piece, n) => {
    const lines = Array.isArray(piece.stoneLines) ? piece.stoneLines : parseStoneLinesCell(piece.stoneLines)
    const byGroup: Record<StoneGroup, StoneLine[]> = { D: [], F: [], C: [] }
    for (const line of lines) byGroup[STONE_GROUPS.includes(line.group) ? line.group : 'D'].push(line)
    const depth = Math.max(1, byGroup.D.length, byGroup.F.length, byGroup.C.length)

    for (let r = 0; r < depth; r++) {
      const row = blank()
      if (r === 0) {
        const qty = numeric(piece.qty)
        const gross = numeric(piece.grossWeight)
        const net = numeric(piece.netWeight)
        const goldValue = numeric(piece.goldValue)
        row[col('Sr.No')] = n + 1
        row[col('BAG NO')] = piece.bagNo || piece.slug
        row[col('Style No')] = piece.styleNo || piece.title
        row[col('Type')] = categoryToType(piece.category)
        row[col('COLLECTION')] = Array.isArray(piece.styleTags) ? piece.styleTags.join('|') : String(piece.styleTags ?? '')
        row[col('Qty')] = qty
        row[col('Gross Wt')] = gross
        row[col('Kt/Col')] = formatKtCol(piece.metalPurity, piece.color)
        row[col('Net Wt')] = net
        row[col('Gold Rate')] = numeric(piece.goldRate)
        row[col('Gold Value')] = goldValue
        row[col('PRICE')] = numeric(piece.price)
        totals.qty += typeof qty === 'number' ? qty : 0
        totals.gross += typeof gross === 'number' ? gross : 0
        totals.net += typeof net === 'number' ? net : 0
        totals.goldValue += typeof goldValue === 'number' ? goldValue : 0
      }
      for (const group of STONE_GROUPS) {
        const line = byGroup[group][r]
        if (!line) continue
        const pcs = numeric(line.pcs)
        const cts = numeric(line.cts)
        row[col(`${group}Shape`)] = line.shape
        row[col(`${group}Quality`)] = line.quality
        row[col(`${group}Pcs`)] = pcs
        row[col(`${group}Cts`)] = cts
        totals.pcs[group] += typeof pcs === 'number' ? pcs : 0
        totals.cts[group] += typeof cts === 'number' ? cts : 0
      }
      grid.push(row)
    }
  })

  if (pieces.length) {
    const total = blank()
    total[col('Style No')] = 'Total'
    total[col('Qty')] = totals.qty
    total[col('Gross Wt')] = round(totals.gross, 3)
    total[col('Net Wt')] = round(totals.net, 3)
    total[col('Gold Value')] = round(totals.goldValue, 2)
    for (const group of STONE_GROUPS) {
      total[col(`${group}Pcs`)] = totals.pcs[group]
      total[col(`${group}Cts`)] = round(totals.cts[group], 3)
    }
    grid.push(total)
  }
  return grid
}

/** Human labels for the storefront's colour ids, for previews. */
export function colorLabel(color: unknown): string {
  return COLORS.find((option) => option.id === color)?.label || String(color ?? '')
}
