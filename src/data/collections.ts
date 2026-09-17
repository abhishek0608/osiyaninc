import type { CollectionPreset } from '../composables/useCollectionPreset'

export interface CollectionLink {
  /** URL slug, e.g. /collections/rings */
  slug: string
  /** Short label used in nav menus */
  label: string
  /** Heading shown on the collection page */
  title: string
  /** One-line description shown under the page title */
  description: string
  /** Icon key consumed by AppHeader */
  icon: string
  /** Filter preset applied to the product grid */
  preset: CollectionPreset
}

export const COLLECTION_LINKS: CollectionLink[] = [
  // Rings narrows on Price and Type alone — the two questions a ring shopper
  // starts from. Stone Shape and Stone Size are deliberately dropped here even
  // though rings carry centre stones.
  {
    slug: 'rings',
    label: 'Ring',
    title: 'Rings',
    description: 'Solitaires, clusters and everyday bands.',
    icon: 'ring',
    preset: {
      category: 'Rings',
      facets: ['price', 'type'],
      typeOptions: ['stackable', 'statement-ring', 'bridal', 'gemstone-ring'],
    },
  },
  // Earrings leads on Stone — the house sells 24 of them here — then Metal,
  // which is why the facet order is spelled out rather than shared with
  // Bracelets & Bangles. No Platinum in earrings, but 14K Rose is offered.
  {
    slug: 'earrings',
    label: 'Earring',
    title: 'Earrings',
    description: 'Studs, drops and statement jhumkas.',
    icon: 'earrings',
    preset: {
      category: 'Earrings',
      facets: ['price', 'stone', 'metal', 'type'],
      stoneOptions: [
        'tourmaline', 'aquamarine', 'lemon-quartz', 'amethyst', 'multi-sapphire', 'ruby',
        'pink-sapphire', 'mexican-fire-opal', 'rubellite', 'blue-topaz', 'sapphire', 'diamond',
        'ethiopian-opal', 'tanzanite', 'sunstone', 'moonstone', 'green-sapphire', 'coral',
        'citrine', 'peridot', 'prehnite', 'spinel', 'morganite', 'turquoise',
      ],
      metalOptions: ['14k-white', '14k-yellow', '14k-rose', '18k-white', '18k-yellow', '18k-rose'],
      typeOptions: ['hoops', 'studs', 'dangle-drop', 'statement-earring'],
    },
  },
  { slug: 'pendants', label: 'Pendant', title: 'Pendants', description: 'Delicate pendants to layer or wear solo.', icon: 'pendant', preset: { subtypes: ['pendant'] } },
  // Bracelets & Bangles filters on Price/Metal/Stone/Type instead of the default
  // set: Category would only split the page back into its two halves, and Type
  // already carries that split (Bangle) alongside the bracelet silhouettes.
  {
    slug: 'bracelets',
    label: 'Bracelet / Bangle',
    title: 'Bracelets & Bangles',
    description: 'Cuffs, chains and classic bangles.',
    icon: 'bracelet',
    preset: {
      categories: ['Bracelets', 'Bangles'],
      facets: ['price', 'metal', 'stone', 'type'],
      metalOptions: ['14k-white', '14k-yellow', '18k-white', '18k-yellow', '18k-rose', 'platinum'],
      stoneOptions: ['amethyst', 'sapphire', 'diamond', 'tourmaline', 'ruby'],
      typeOptions: ['bangle', 'gemstone-bracelet', 'tennis-bracelet', 'chain'],
    },
  },
  // Necklaces carries the four styles the live site's own "Shop by Style"
  // gallery names, in its order — Everyday Wear, Chain, Tennis, Gemstone. It
  // narrows on Price and Type alone, as Rings does: Material and the centre-stone
  // facets say little about a necklace, and Type is the question a shopper who
  // came off that gallery is already asking.
  {
    slug: 'necklaces',
    label: 'Necklace',
    title: 'Necklaces',
    description: 'Statement necklaces and timeless chains.',
    icon: 'necklace',
    preset: {
      category: 'Necklaces',
      facets: ['price', 'type'],
      typeOptions: ['everyday-necklace', 'chain-necklace', 'tennis-necklace', 'gemstone-necklace'],
    },
  },
]

// The high-jewelry suites from /high-jewelry. Each page lists the pieces whose
// Product.collection carries the suite's name — the packing list's COLLECTION
// column, matched case-insensitively — so a suite fills in as pieces are
// imported under it. They are deliberately not in COLLECTION_LINKS: the header
// menus and the homepage grid are the catalogue categories, and these are
// reached from the Explore buttons on the High Jewelry page instead.
export const HIGH_JEWELRY_COLLECTIONS: CollectionLink[] = [
  {
    slug: 'jewel-garden',
    label: 'Jewel Garden',
    title: 'Jewel Garden',
    description: 'Carved tourmalines, emeralds and pink sapphires in bloom.',
    icon: 'high-jewelry',
    preset: { collection: 'Jewel Garden', facets: ['price', 'category', 'metal', 'stone'] },
  },
  {
    slug: 'jade-forest',
    label: 'Jade Forest',
    title: 'Jade Forest',
    description: 'Emeralds and diamonds in deep forest greens.',
    icon: 'high-jewelry',
    preset: { collection: 'Jade Forest', facets: ['price', 'category', 'metal', 'stone'] },
  },
  {
    slug: 'osiyanic-blues',
    label: 'Osiyanic Blues',
    title: 'Osiyanic Blues',
    description: 'Aquamarines, sapphires and tanzanites in every blue.',
    icon: 'high-jewelry',
    preset: { collection: 'Osiyanic Blues', facets: ['price', 'category', 'metal', 'stone'] },
  },
  {
    slug: 'fiery',
    label: 'Fiery Collection',
    title: 'Fiery Collection',
    description: 'Fire opals, rubies and rubellites set ablaze.',
    icon: 'high-jewelry',
    preset: { collection: 'Fiery', facets: ['price', 'category', 'metal', 'stone'] },
  },
  {
    slug: 'hematita-zora',
    label: 'Hematita Zora',
    title: 'Hematita Zora',
    description: 'Brazilian alexandrite and diamonds in yellow gold.',
    icon: 'high-jewelry',
    preset: { collection: 'Hematita Zora', facets: ['price', 'category', 'metal', 'stone'] },
  },
]

/** The collection names as stored on products, for the internal form's suggestions. */
export const HIGH_JEWELRY_COLLECTION_NAMES = HIGH_JEWELRY_COLLECTIONS.map((c) => c.preset.collection as string)

export function findCollectionBySlug(slug: string): CollectionLink | null {
  return COLLECTION_LINKS.find((c) => c.slug === slug) ?? HIGH_JEWELRY_COLLECTIONS.find((c) => c.slug === slug) ?? null
}
