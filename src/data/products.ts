export interface PriceBreakup {
  goldWeight: string
  goldValue: string
  stoneWeight: string
  stoneValue: string
  labour: string
  total: string
}

export interface ProductCustomizationOptions {
  diamondQualities?: string[]
  metalPurities?: string[]
  centerShapes?: string[]
  centerStoneSizes?: string[]
  allowCustomCenterStoneSize?: boolean
  stoneTypes?: string[]
  allowCustomStoneType?: boolean
  ringSizes?: string[]
  bangleSizes?: string[]
  necklaceSizes?: string[]
}

// A piece's independent lab certification. `fileUrl` is the uploaded report;
// it can be empty while the certificate is still being scanned, and the tag
// still shows — `lab` alone is what marks a piece as certified.
export interface ProductCertification {
  lab: string
  number?: string
  fileUrl?: string
  /** ISO date the report was issued; empty until the grading date is recorded. */
  certifiedAt?: string
}

export interface ProductAttributes {
  grossWeight?: string
  diamondCarats?: string
  diamondQuantity?: string
}

export type Material = 'gold' | 'silver'
export type Color = 'yellow' | 'white' | 'rose' | 'oxidised'
export type ProductSubtype =
  | 'solitaire'
  | 'cluster'
  | 'multi-stone'
  | 'open-ring'
  | 'pendant'
  | 'statement-necklace'
  | 'cuff'
  | 'chain-bracelet'
  | 'drop'
  | 'stud'
  | 'mangal-sutra'
  | 'jhumka'

export const CATEGORIES = ['Rings', 'Earrings', 'Mangal Sutra', 'Necklaces', 'Bracelets', 'Bangles'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATALOG_CATEGORIES: Category[] = CATEGORIES.filter((category) => category !== 'Mangal Sutra')

export const COLORS: { id: Color; label: string; hex: string }[] = [
  { id: 'yellow', label: 'Yellow Gold', hex: '#D4AF37' },
  { id: 'white', label: 'White Gold', hex: '#E8E8E8' },
  { id: 'rose', label: 'Rose Gold', hex: '#B76E79' },
  { id: 'oxidised', label: 'Oxidised Silver', hex: '#808080' },
]

export const DIAMOND_QUALITY_OPTIONS = [
  'VVS-VS / GH',
  'VS / GH',
  'VS-SI / GH',
  'SI-I / GH',
  'I2-I3 / GH',
] as const

export const METAL_PURITY_OPTIONS = [
  '9k Gold',
  '10k Gold',
  '14k Gold',
  '18k Gold',
  '22k Gold',
  'Platinum',
  'Sterling Silver',
] as const

// Grading houses whose reports we attach to a piece. Stored as free text on the
// product so a lab outside this list never blocks a save; the list is only what
// the workspace dropdown offers, and whatever is stored is what the storefront
// tag reads ("GIA Certified").
export const CERT_LAB_OPTIONS = ['GIA', 'IGI', 'SGL', 'GSI', 'HRD', 'AGS', 'In-house'] as const

export const CENTER_SHAPE_OPTIONS = ['Cushion', 'Emerald', 'Heart', 'Long Cushion', 'Marquise', 'Oval', 'Pear', 'Princess', 'Round', 'Trillion'] as const

const ELONGATED_CENTER_STONE_SIZES = ['5×3', '6×4', '7×5', '8×6', '9×7', '10×8', '11×9', '12×10'] as const
const SQUARE_CENTER_STONE_SIZES = ['5×5', '5.5×5.5', '6×6', '6.5×6.5', '7×7', '7.5×7.5', '8×8', '8.5×8.5', '9×9', '9.5×9.5', '10×10', '11×11', '12×12'] as const
const MARQUISE_CENTER_STONE_SIZES = ['5×2.5', '6×3', '7.5×3.5', '8×4', '8.5×4', '9×7', '10×5', '12×6'] as const

// Shape-to-size combinations supplied by the merchandising workbook. Values
// stay unitless internally so they also match older product records such as
// "6", "6X6", or "8x6"; labels add millimetres at render time.
export const CENTER_STONE_SIZES_BY_SHAPE: Record<string, readonly string[]> = {
  Cushion: SQUARE_CENTER_STONE_SIZES,
  Emerald: ELONGATED_CENTER_STONE_SIZES,
  Heart: SQUARE_CENTER_STONE_SIZES,
  'Long Cushion': ELONGATED_CENTER_STONE_SIZES,
  Marquise: MARQUISE_CENTER_STONE_SIZES,
  Oval: ELONGATED_CENTER_STONE_SIZES,
  Pear: ELONGATED_CENTER_STONE_SIZES,
  Princess: SQUARE_CENTER_STONE_SIZES,
  Round: SQUARE_CENTER_STONE_SIZES,
  Trillion: SQUARE_CENTER_STONE_SIZES,
}

export const CENTER_STONE_SIZE_OPTIONS = [...new Set(Object.values(CENTER_STONE_SIZES_BY_SHAPE).flat())]

export function normalizeCenterShape(value: unknown): string {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const aliases: Record<string, string> = {
    mq: 'Marquise',
    emraled: 'Emerald',
    emerlad: 'Emerald',
    emrald: 'Emerald',
  }
  if (aliases[key]) return aliases[key]
  return CENTER_SHAPE_OPTIONS.find((shape) => shape.toLowerCase() === key) || String(value || '').trim()
}

export function normalizeCenterStoneSize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/millimet(?:er|re)s?|mm/g, '')
    .replace(/[x*×]/g, '×')
    .replace(/\s+/g, '')
    .replace(/(\d+)\.0(?=×|$)/g, '$1')
}

export function formatCenterStoneSize(value: unknown): string {
  const normalized = normalizeCenterStoneSize(value)
  return normalized ? `${normalized.replace(/×/g, ' × ')} mm` : ''
}

export function centerStoneSizeMatches(productSize: unknown, selectedSize: unknown): boolean {
  const productValue = normalizeCenterStoneSize(productSize)
  const selectedValue = normalizeCenterStoneSize(selectedSize)
  if (!productValue || !selectedValue) return false
  if (productValue === selectedValue) return true
  const asSquare = (value: string) => value.includes('×') ? value : `${value}×${value}`
  return asSquare(productValue) === asSquare(selectedValue)
}

export function productHasCenterShape(productShapes: unknown, selectedShape: unknown): boolean {
  if (!Array.isArray(productShapes)) return false
  const expected = normalizeCenterShape(selectedShape).toLowerCase()
  return productShapes.some((shape) => normalizeCenterShape(shape).toLowerCase() === expected)
}

export function productHasCenterStoneSize(productSizes: unknown, selectedSize: unknown): boolean {
  return Array.isArray(productSizes) && productSizes.some((size) => centerStoneSizeMatches(size, selectedSize))
}

export function centerStoneSizesForShapes(shapes: readonly string[]): string[] {
  const values = new Set<string>()
  for (const rawShape of shapes) {
    const shape = normalizeCenterShape(rawShape)
    for (const size of CENTER_STONE_SIZES_BY_SHAPE[shape] || []) values.add(size)
  }
  return [...values]
}

// Stone type (the kind of center stone) for product customization. Fallback
// defaults for the picker; each product can offer its own subset via
// customizationOptions.stoneTypes.
export const CENTER_STONE_TYPE_OPTIONS = ['Natural Diamond', 'Lab-Grown Diamond', 'Moissanite', 'Ruby', 'Sapphire', 'Emerald'] as const

export const RING_SIZE_OPTIONS = ['8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'] as const

export const BANGLE_SIZE_OPTIONS = ['2.2', '2.4', '2.6', '2.8', '2.10'] as const

export const NECKLACE_SIZE_OPTIONS = ['14"', '16"', '18"', '20"', '22"', '24"'] as const

export interface Product {
  id?: string
  slug: string
  title: string
  category: Category
  subtype?: ProductSubtype
  material: Material
  color: Color
  price: string
  priceValue: number
  description: string
  aiDescription?: string
  details: string[]
  styleTags?: string[]
  stoneTags?: string[]
  breakup: PriceBreakup
  images?: string[]
  isNewArrival?: boolean
  isBestSeller?: boolean
  rating?: number
  reviewCount?: number
  customizationOptions?: ProductCustomizationOptions
  productAttributes?: ProductAttributes
  certification?: ProductCertification
}

interface PriceFields {
  price?: string
  priceValue?: number | null
}

// Label for a priced piece: the formatted string the API sends, falling back to
// the numeric value because chat and search payloads sometimes carry only one
// of the two.
export function formatProductPrice(product: PriceFields) {
  const label = String(product.price || '').trim()
  if (label) return label
  const value = Number(product.priceValue)
  return Number.isFinite(value) ? `$${Math.round(value).toLocaleString('en-US')}` : ''
}

export interface Review {
  id: string
  author: string
  rating: number
  date: string
  text: string
}

export const products: Product[] = [
  {
    slug: 'etoile-ring',
    title: 'Étoile Ring',
    category: 'Rings',
    subtype: 'multi-stone',
    material: 'gold',
    color: 'yellow',
    price: '$1,831',
    priceValue: 1831,
    isBestSeller: true,
    description: 'A luminous diamond ring inspired by starlight, featuring a brilliant-cut center stone with shimmering accent diamonds set in 18k gold. The delicate band catches light from every angle, making it a timeless statement piece.',
    details: ['18k Yellow Gold', 'Brilliant-cut Diamond (0.5ct)', 'Handcrafted in Jaipur', 'Certificate of Authenticity'],
    styleTags: ['bridal', 'classic', 'minimal'],
    stoneTags: ['diamond'],
    breakup: { goldWeight: '4.2 g', goldValue: '$1,113', stoneWeight: '0.5 ct', stoneValue: '$506', labour: '$212', total: '$1,831' },
    images: ['/ring-1.jpg', '/ring-2.jpg'],
    rating: 4.8,
    reviewCount: 124,
  },
  {
    slug: 'celeste-solitaire-ring',
    title: 'Celeste Solitaire Ring',
    category: 'Rings',
    subtype: 'solitaire',
    material: 'gold',
    color: 'white',
    price: '$2,277',
    priceValue: 2277,
    isNewArrival: true,
    description: 'Classic solitaire ring with a single dominant round-cut center diamond in a clean white-gold setting. Designed for engagement and timeless everyday elegance.',
    details: ['18k White Gold', 'Round Solitaire Diamond (0.9ct)', 'Four-Prong Setting', 'Handcrafted in Jaipur'],
    styleTags: ['bridal', 'classic', 'minimal'],
    stoneTags: ['diamond'],
    breakup: { goldWeight: '4.6 g', goldValue: '$1,181', stoneWeight: '0.9 ct', stoneValue: '$819', labour: '$277', total: '$2,277' },
    images: ['/celeste-solitaire-ring-1.webp', '/celeste-solitaire-ring-2.webp'],
    rating: 4.9,
    reviewCount: 76,
  },
  {
    slug: 'auric-openwork-ring',
    title: 'Auric Openwork Ring',
    category: 'Rings',
    subtype: 'open-ring',
    material: 'gold',
    color: 'yellow',
    price: '$699',
    priceValue: 699,
    isNewArrival: true,
    description: 'Modern gold ring with an airy openwork design, parallel bands, and intricate cutout detailing. Crafted as a statement everyday ring without visible stones.',
    details: ['18k Yellow Gold', 'Openwork Multi-Band Design', 'Cutout Detailing', 'Handcrafted in Jaipur'],
    styleTags: ['modern', 'statement'],
    stoneTags: [],
    breakup: { goldWeight: '5.1 g', goldValue: '$470', stoneWeight: '—', stoneValue: '—', labour: '$229', total: '$699' },
    images: ['/ring-1.jpg'],
    rating: 4.6,
    reviewCount: 18,
  },
  {
    slug: 'verde-duet-bypass-ring',
    title: 'Verde Duet Bypass Ring',
    category: 'Rings',
    subtype: 'open-ring',
    material: 'gold',
    color: 'yellow',
    price: '$2,145',
    priceValue: 2145,
    isNewArrival: true,
    description:
      'A contemporary bypass (“toi et moi”) ring in polished yellow gold, set with two emerald-cut green emeralds at the open ends and a ribbon of pavé diamonds along the shoulders. Airy, modern, and vivid.',
    details: ['18k Yellow Gold', 'Twin Emerald-cut Emeralds', 'Pavé Diamond Shoulders', 'Four-Prong Settings', 'Handcrafted in Jaipur'],
    styleTags: ['modern', 'minimal', 'statement'],
    stoneTags: ['emerald', 'diamond'],
    breakup: {
      goldWeight: '2.2 g',
      goldValue: '$557',
      stoneWeight: '1.1 ct combined',
      stoneValue: '$1,181',
      labour: '$407',
      total: '$2,145',
    },
    images: ['/verde-duet-ring-1.png', '/verde-duet-ring-2.png'],
    rating: 4.9,
    reviewCount: 31,
  },
  {
    slug: 'lune-pendant',
    title: 'Lune Pendant',
    category: 'Necklaces',
    subtype: 'pendant',
    material: 'gold',
    color: 'white',
    price: '$2,120',
    priceValue: 2120,
    isNewArrival: true,
    isBestSeller: true,
    description: 'A crescent-shaped pendant suspended on a fine chain, adorned with pavé-set diamonds. Inspired by moonlit nights in Rajasthan, this piece blends tradition with modern elegance.',
    details: ['22k Gold with Rhodium Finish', 'Pavé Diamonds (0.3ct total)', '18-inch Chain', 'Handcrafted in Jaipur'],
    styleTags: ['modern', 'minimal'],
    stoneTags: ['diamond'],
    breakup: { goldWeight: '6.8 g', goldValue: '$1,393', stoneWeight: '0.3 ct', stoneValue: '$422', labour: '$306', total: '$2,120' },
    images: ['/pendant-1.jpg', '/pendant-2.jpg'],
    rating: 4.6,
    reviewCount: 89,
  },
  {
    slug: 'soleil-bracelet',
    title: 'Soleil Bracelet',
    category: 'Bracelets',
    subtype: 'chain-bracelet',
    material: 'gold',
    color: 'yellow',
    price: '$1,639',
    priceValue: 1639,
    isNewArrival: true,
    description:
      'Delicate yellow-gold chain bracelet with a polished nameplate pendant showcasing personalized initials in a modern serif font. Lobster clasp; minimal everyday piece with optional custom letters.',
    details: ['22k Gold', 'Personalized Initials', 'Rolo Chain', 'Lobster Clasp', 'Handcrafted in Jaipur'],
    styleTags: ['modern', 'minimal', 'everyday'],
    stoneTags: [],
    breakup: { goldWeight: '—', goldValue: '—', stoneWeight: '—', stoneValue: '—', labour: '$1,639', total: '$1,639' },
    images: ['/bracelet-1.jpg'],
    rating: 4.5,
    reviewCount: 56,
  },
  {
    slug: 'nuit-earrings',
    title: 'Nuit Earrings',
    category: 'Earrings',
    subtype: 'drop',
    material: 'gold',
    color: 'yellow',
    price: '$988',
    priceValue: 988,
    isBestSeller: true,
    description:
      'Minimal yellow-gold earrings with a sculptural J-hoop silhouette: a slim vertical bar and twin curved wires, each set with two round brilliant diamonds. Post backs; modern architectural everyday pair.',
    details: ['18k Yellow Gold', 'Brilliant-cut Diamonds', 'Post with Comfort Backs', 'Handcrafted in Jaipur'],
    styleTags: ['minimal', 'modern', 'everyday'],
    stoneTags: ['diamond'],
    breakup: { goldWeight: '3.6 g', goldValue: '$607', stoneWeight: '0.4 ct', stoneValue: '$193', labour: '$188', total: '$988' },
    images: ['/earring-1.jpg', '/earring-2.jpg'],
    rating: 4.9,
    reviewCount: 203,
  },
  {
    slug: 'padma-mangalsutra',
    title: 'Padma Mangal Sutra',
    category: 'Mangal Sutra',
    subtype: 'mangal-sutra',
    material: 'gold',
    color: 'yellow',
    price: '$867',
    priceValue: 867,
    isNewArrival: true,
    isBestSeller: true,
    description: 'A traditional 22k gold mangal sutra featuring a lotus pendant with vibrant pink enamel and a cascading tassel. The dual chain with classic black beads honours Indian bridal heritage.',
    details: ['22k Yellow Gold', 'Pink Meenakari Enamel', 'Black Bead Chain', 'Lotus & Tassel Pendant', 'Handcrafted in Jaipur'],
    styleTags: ['traditional', 'bridal'],
    stoneTags: [],
    breakup: { goldWeight: '3.8 g', goldValue: '$721', stoneWeight: '—', stoneValue: '—', labour: '$146', total: '$867' },
    images: ['/necklace-1.jpg'],
    rating: 4.8,
    reviewCount: 38,
  },
  {
    slug: 'knot-mangalsutra',
    title: 'Knot Mangal Sutra',
    category: 'Mangal Sutra',
    subtype: 'mangal-sutra',
    material: 'gold',
    color: 'yellow',
    price: '$819',
    priceValue: 819,
    isNewArrival: true,
    description: 'A contemporary mangal sutra with a delicate knot motif in 22k gold and black beads. Symbolises eternal bond and modern elegance.',
    details: ['22k Gold', 'Black Beads', 'Adjustable Length', 'Handcrafted in Jaipur'],
    styleTags: ['modern', 'bridal'],
    stoneTags: ['black-beads'],
    breakup: { goldWeight: '3.2 g', goldValue: '$636', stoneWeight: '—', stoneValue: '—', labour: '$183', total: '$819' },
    images: ['https://www.giva.co/cdn/shop/files/PD0753_1.jpg?v=1713439409&width=990'],
    rating: 4.7,
    reviewCount: 42,
  },
  {
    slug: 'luna-silver-ring',
    title: 'Luna Silver Ring',
    category: 'Rings',
    subtype: 'open-ring',
    material: 'silver',
    color: 'oxidised',
    price: '$51',
    priceValue: 51,
    description: 'Minimal sterling silver ring with a subtle moon phase design. Perfect for everyday wear.',
    details: ['925 Sterling Silver', 'Oxidation-resistant', 'Handcrafted'],
    styleTags: ['minimal', 'everyday'],
    stoneTags: [],
    breakup: { goldWeight: '—', goldValue: '—', stoneWeight: '—', stoneValue: '—', labour: '$51', total: '$51' },
    images: ['https://www.giva.co/cdn/shop/files/R042_1.jpg?v=1712926930&width=990'],
    rating: 4.4,
    reviewCount: 31,
  },
  {
    slug: 'meera-silver-earrings',
    title: 'Meera Silver Earrings',
    category: 'Earrings',
    subtype: 'jhumka',
    material: 'silver',
    color: 'oxidised',
    price: '$46',
    priceValue: 46,
    isBestSeller: true,
    description: 'Lightweight sterling silver jhumkas with traditional filigree. A timeless choice for both ethnic and casual wear.',
    details: ['925 Sterling Silver', 'Filigree Work', 'Handcrafted'],
    styleTags: ['traditional', 'everyday'],
    stoneTags: [],
    breakup: { goldWeight: '—', goldValue: '—', stoneWeight: '—', stoneValue: '—', labour: '$46', total: '$46' },
    images: ['https://www.giva.co/cdn/shop/files/ER0150_1.jpg?v=1713248262&width=990'],
    rating: 4.6,
    reviewCount: 67,
  },
  {
    slug: 'sita-silver-necklace',
    title: 'Sita Silver Necklace',
    category: 'Necklaces',
    subtype: 'pendant',
    material: 'silver',
    color: 'white',
    price: '$78',
    priceValue: 78,
    description: 'Elegant sterling silver necklace with a pendant. Ideal for occasions and daily wear.',
    details: ['925 Sterling Silver', '18-inch Chain', 'Handcrafted'],
    styleTags: ['minimal', 'everyday'],
    stoneTags: [],
    breakup: { goldWeight: '—', goldValue: '—', stoneWeight: '—', stoneValue: '—', labour: '$78', total: '$78' },
    images: ['https://www.giva.co/cdn/shop/files/PD02027_1.jpg?v=1697115316&width=990'],
    rating: 4.3,
    reviewCount: 28,
  },
]

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}

const reviewsBySlug: Record<string, Review[]> = {
  'etoile-ring': [
    { id: '1', author: 'Priya M.', rating: 5, date: '2 weeks ago', text: 'Stunning ring! The craftsmanship is exceptional. Got so many compliments on my engagement.' },
    { id: '2', author: 'Rahul K.', rating: 5, date: '1 month ago', text: 'Perfect solitaire. BIS hallmarked and exactly as described. Delivery was secure and on time.' },
    { id: '3', author: 'Anita S.', rating: 4, date: '2 months ago', text: 'Beautiful piece. Slightly smaller than I expected but quality is top-notch. Very happy.' },
  ],
  'lune-pendant': [
    { id: '4', author: 'Neha R.', rating: 5, date: '3 weeks ago', text: 'Elegant and timeless. The chain is delicate but sturdy. Love it for everyday wear.' },
    { id: '5', author: 'Vikram D.', rating: 4, date: '1 month ago', text: 'Gifted to my wife. She adores it. Packaging was luxurious. Worth every rupee.' },
  ],
  'nuit-earrings': [
    { id: '6', author: 'Kavita P.', rating: 5, date: '1 week ago', text: 'Love the sculptural shape and the diamonds catch light beautifully. So light I forget I am wearing them.' },
    { id: '7', author: 'Sneha L.', rating: 5, date: '3 weeks ago', text: 'Minimal but striking — goes with western and ethnic. Backs are comfortable.' },
  ],
  'padma-mangalsutra': [
    { id: '14', author: 'Sunita P.', rating: 5, date: '1 week ago', text: 'Absolutely gorgeous! The lotus pendant is so intricately crafted. Got endless compliments at my wedding.' },
    { id: '15', author: 'Reema K.', rating: 5, date: '3 weeks ago', text: 'The enamel work is stunning and the gold quality is excellent. Perfect bridal piece.' },
  ],
  'knot-mangalsutra': [
    { id: '8', author: 'Divya N.', rating: 5, date: '2 weeks ago', text: 'Modern design, traditional meaning. Perfect for the contemporary bride. Highly recommend.' },
    { id: '9', author: 'Meera T.', rating: 4, date: '1 month ago', text: 'Lovely mangal sutra. Adjustable length is a plus. Gold quality is as promised.' },
  ],
  'soleil-bracelet': [
    { id: '10', author: 'Pooja G.', rating: 5, date: '3 weeks ago', text: 'Love my initials on the chain — delicate and modern. Clasp feels secure. Beautiful packaging.' },
  ],
  'luna-silver-ring': [
    { id: '11', author: 'Riya M.', rating: 4, date: '1 month ago', text: 'Minimal and elegant. Wearing it daily. Good for the price.' },
  ],
  'meera-silver-earrings': [
    { id: '12', author: 'Anjali V.', rating: 5, date: '2 weeks ago', text: 'Light jhumkas, perfect for office and occasions. Love the filigree.' },
  ],
  'sita-silver-necklace': [
    { id: '13', author: 'Kriti S.', rating: 4, date: '3 weeks ago', text: 'Simple and elegant. Goes with both ethnic and western wear. Happy with purchase.' },
  ],
  'verde-duet-bypass-ring': [
    { id: '16', author: 'Isha R.', rating: 5, date: '2 weeks ago', text: 'The emeralds are incredibly vivid and the bypass shape is so flattering on the hand. Pavé sparkles without feeling heavy.' },
    { id: '17', author: 'Arjun M.', rating: 5, date: '1 month ago', text: 'Gifted for our anniversary — she has not taken it off. Craftsmanship feels premium.' },
  ],
}

export function getProductReviews(slug: string): Review[] {
  return reviewsBySlug[slug] ?? []
}
