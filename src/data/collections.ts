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
  { slug: 'earrings', label: 'Earring', title: 'Earrings', description: 'Studs, drops and statement jhumkas.', icon: 'earrings', preset: { category: 'Earrings' } },
  { slug: 'pendants', label: 'Pendant', title: 'Pendants', description: 'Delicate pendants to layer or wear solo.', icon: 'pendant', preset: { subtypes: ['pendant'] } },
  { slug: 'bracelets', label: 'Bracelet / Bangle', title: 'Bracelets & Bangles', description: 'Cuffs, chains and classic bangles.', icon: 'bracelet', preset: { categories: ['Bracelets', 'Bangles'] } },
  { slug: 'necklaces', label: 'Necklace', title: 'Necklaces', description: 'Statement necklaces and timeless chains.', icon: 'necklace', preset: { category: 'Necklaces' } },
]

export function findCollectionBySlug(slug: string): CollectionLink | null {
  return COLLECTION_LINKS.find((c) => c.slug === slug) ?? null
}
