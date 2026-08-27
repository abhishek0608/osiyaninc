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
  { slug: 'rings', label: 'Ring', title: 'Rings', description: 'Solitaires, clusters and everyday bands.', icon: 'ring', preset: { category: 'Rings' } },
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
  { slug: 'necklaces', label: 'Necklace', title: 'Necklaces', description: 'Statement necklaces and timeless chains.', icon: 'necklace', preset: { category: 'Necklaces' } },
]

export function findCollectionBySlug(slug: string): CollectionLink | null {
  return COLLECTION_LINKS.find((c) => c.slug === slug) ?? null
}
