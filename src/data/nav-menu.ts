import type { Color, Material, ProductSubtype } from './products'

/**
 * Navigation taxonomy for the site header.
 *
 * The header renders entirely from this file — categories, submenu columns and
 * featured cards — so merchandising changes never mean touching AppHeader.vue.
 *
 * Submenu links carry an `exact` flag. `true` means the destination genuinely
 * reflects the label (a real collection page, or a collection page plus a
 * filter the catalogue can apply). `false` marks a link the catalogue cannot
 * express yet — there is no hoop/chandelier/ear-cuff subtype, no platinum
 * material, and no price-band filter — so it lands on the unfiltered category
 * page. Those are deliberate placeholders, not wiring bugs: the menu is drawn
 * in full per the design, and each `false` becomes `true` for free once the
 * taxonomy grows.
 */

type TabId = 'new' | 'bestseller' | 'all'

/** Filter intent encoded into a collection URL and read back by CollectionView. */
export interface CollectionQuery {
  /** Product subtype, e.g. `stud` → Studs. */
  style?: ProductSubtype
  /** Metal colour, e.g. `yellow` → Yellow gold. */
  metal?: Color
  /** Base material. */
  material?: Material
  /** Which grid tab the page opens on. */
  tab?: TabId
}

export interface NavSubLink {
  label: string
  to: string
  /** See the `exact` note in this file's header comment. */
  exact: boolean
  /** Renders in gold as a column's closing "shop all" line. */
  emphasis?: boolean
}

/** A headed run of links. A column may stack two (the design pairs metal + price). */
export interface NavGroup {
  heading: string
  links: NavSubLink[]
}

export interface NavFeature {
  image: string
  alt: string
  title: string
  caption: string
  to: string
}

export interface NavSubmenu {
  /** Three link columns, then the two-up featured grid. */
  columns: NavGroup[][]
  features: NavFeature[]
}

export interface NavItem {
  label: string
  to: string
  /** Stable key for the open-submenu state; also the aria-controls target id. */
  key: string
  /** Marks the AI chat entry so the header can render its bubble icon. */
  icon?: 'chat'
  submenu?: NavSubmenu
}

const SUBTYPES: readonly ProductSubtype[] = [
  'solitaire', 'cluster', 'multi-stone', 'open-ring', 'pendant', 'statement-necklace',
  'cuff', 'chain-bracelet', 'drop', 'stud', 'mangal-sutra', 'jhumka',
  'bangle', 'gemstone-bracelet', 'tennis-bracelet', 'chain',
]
const METALS: readonly Color[] = ['yellow', 'white', 'rose', 'oxidised']
const MATERIALS: readonly Material[] = ['gold', 'silver']
const TABS: readonly TabId[] = ['new', 'bestseller', 'all']

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined
}

/**
 * Inverse of `collectionUrl` — reads filter intent back off a route so a shared
 * or bookmarked mega-menu link lands on the same filtered grid. Unrecognised
 * values are dropped rather than trusted.
 */
export function parseCollectionQuery(query: Record<string, unknown>): CollectionQuery {
  return {
    style: pick(query.style, SUBTYPES),
    metal: pick(query.metal, METALS),
    material: pick(query.material, MATERIALS),
    tab: pick(query.tab, TABS),
  }
}

export function collectionUrl(slug: string, query?: CollectionQuery): string {
  const base = `/collections/${slug}`
  if (!query) return base
  const params = new URLSearchParams()
  if (query.style) params.set('style', query.style)
  if (query.metal) params.set('metal', query.metal)
  if (query.material) params.set('material', query.material)
  if (query.tab) params.set('tab', query.tab)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** A link whose destination matches its label. */
function filterLink(label: string, slug: string, query?: CollectionQuery): NavSubLink {
  return { label, to: collectionUrl(slug, query), exact: true }
}

/** A link the catalogue can't filter for yet — falls back to the category page. */
function pendingLink(label: string, slug: string): NavSubLink {
  return { label, to: `/collections/${slug}`, exact: false }
}

function siteLink(label: string, to: string): NavSubLink {
  return { label, to, exact: true }
}

function shopAll(label: string, to: string): NavSubLink {
  return { label, to, exact: true, emphasis: true }
}

/** Metal + price column. Price bands have no filter behind them yet. */
function metalAndPrice(slug: string): NavGroup[] {
  return [
    {
      heading: 'Shop by metal',
      links: [
        filterLink('Yellow gold', slug, { metal: 'yellow' }),
        filterLink('White gold', slug, { metal: 'white' }),
        filterLink('Rose gold', slug, { metal: 'rose' }),
        pendingLink('Platinum', slug),
      ],
    },
    {
      heading: 'Price',
      links: [
        pendingLink('Under $1,000', slug),
        pendingLink('$1,000 – $5,000', slug),
        pendingLink('$5,000+', slug),
      ],
    },
  ]
}

/** Collections column. "New arrivals" is the only edit the grid can express today. */
function collectionsColumn(slug: string, shopAllLabel: string): NavGroup[] {
  return [
    {
      heading: 'Collections',
      links: [
        filterLink('New arrivals', slug, { tab: 'new' }),
        pendingLink('Everyday', slug),
        pendingLink('Gifting', slug),
        shopAll(shopAllLabel, `/collections/${slug}`),
      ],
    },
  ]
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Earrings',
    key: 'earrings',
    to: '/collections/earrings',
    submenu: {
      columns: [
        [
          {
            heading: 'Shop by style',
            links: [
              filterLink('Studs', 'earrings', { style: 'stud' }),
              pendingLink('Hoops', 'earrings'),
              filterLink('Drops', 'earrings', { style: 'drop' }),
              pendingLink('Chandeliers', 'earrings'),
              pendingLink('Ear cuffs', 'earrings'),
              filterLink('Jhumkas', 'earrings', { style: 'jhumka' }),
            ],
          },
        ],
        metalAndPrice('earrings'),
        collectionsColumn('earrings', 'Shop all earrings'),
      ],
      features: [
        {
          image: '/earring-1.jpg',
          alt: 'Diamond drop earrings on model',
          title: 'The Bridal Edit',
          caption: 'Chandeliers and drops for the aisle',
          to: '/collections/earrings',
        },
        {
          image: '/earring-2.jpg',
          alt: 'Gold earrings still life',
          title: 'New in gold',
          caption: 'Fresh silhouettes, just landed',
          to: collectionUrl('earrings', { tab: 'new' }),
        },
      ],
    },
  },
  {
    label: 'Rings',
    key: 'rings',
    to: '/collections/rings',
    submenu: {
      columns: [
        [
          {
            heading: 'Shop by style',
            links: [
              filterLink('Solitaires', 'rings', { style: 'solitaire' }),
              filterLink('Clusters', 'rings', { style: 'cluster' }),
              filterLink('Multi-stone', 'rings', { style: 'multi-stone' }),
              filterLink('Open rings', 'rings', { style: 'open-ring' }),
              pendingLink('Eternity bands', 'rings'),
              pendingLink('Cocktail rings', 'rings'),
            ],
          },
        ],
        metalAndPrice('rings'),
        collectionsColumn('rings', 'Shop all rings'),
      ],
      features: [
        {
          image: '/ring-1.jpg',
          alt: 'Solitaire engagement ring',
          title: 'The Engagement Edit',
          caption: 'Solitaires set for the moment',
          to: collectionUrl('rings', { style: 'solitaire' }),
        },
        {
          image: '/ring-2.jpg',
          alt: 'Gold rings still life',
          title: 'New in gold',
          caption: 'Everyday bands, reworked',
          to: collectionUrl('rings', { tab: 'new' }),
        },
      ],
    },
  },
  {
    label: 'Necklaces',
    key: 'necklaces',
    to: '/collections/necklaces',
    submenu: {
      columns: [
        [
          {
            heading: 'Shop by style',
            links: [
              siteLink('Pendants', '/collections/pendants'),
              filterLink('Statement necklaces', 'necklaces', { style: 'statement-necklace' }),
              filterLink('Mangal sutra', 'necklaces', { style: 'mangal-sutra' }),
              pendingLink('Chokers', 'necklaces'),
              pendingLink('Layered chains', 'necklaces'),
              pendingLink('Temple work', 'necklaces'),
            ],
          },
        ],
        metalAndPrice('necklaces'),
        collectionsColumn('necklaces', 'Shop all necklaces'),
      ],
      features: [
        {
          image: '/pendant-1.jpg',
          alt: 'Diamond pendant on model',
          title: 'The Bridal Edit',
          caption: 'Necklaces made for the aisle',
          to: '/collections/necklaces',
        },
        {
          image: '/pendant-2.jpg',
          alt: 'Gold pendant still life',
          title: 'New in gold',
          caption: 'Chains to layer or wear solo',
          to: collectionUrl('necklaces', { tab: 'new' }),
        },
      ],
    },
  },
  {
    label: 'Bangles/Bracelets',
    key: 'bracelets',
    to: '/collections/bracelets',
    submenu: {
      columns: [
        [
          {
            heading: 'Shop by style',
            links: [
              filterLink('Bangle', 'bracelets', { style: 'bangle' }),
              filterLink('Gemstone Bracelet', 'bracelets', { style: 'gemstone-bracelet' }),
              filterLink('Tennis Bracelet', 'bracelets', { style: 'tennis-bracelet' }),
              filterLink('Chain', 'bracelets', { style: 'chain' }),
            ],
          },
        ],
        metalAndPrice('bracelets'),
        collectionsColumn('bracelets', 'Shop all bangles & bracelets'),
      ],
      features: [
        {
          image: '/osiyan-yoga-bangles.jpg',
          alt: 'Osiyan Yoga Bangles',
          title: 'Yoga Bangles',
          caption: 'The signature Osiyan silhouette',
          to: '/collections/bracelets',
        },
        {
          image: '/bracelet-1.jpg',
          alt: 'Gold bracelet still life',
          title: 'New in gold',
          caption: 'Cuffs and links, just landed',
          to: collectionUrl('bracelets', { tab: 'new' }),
        },
      ],
    },
  },
  {
    // High Jewelry is a house of pieces rather than a catalogue category, so its
    // submenu points across the site instead of into one collection's filters.
    label: 'High Jewelry',
    key: 'high-jewelry',
    to: '/collections',
    submenu: {
      columns: [
        [
          {
            heading: 'Explore',
            links: [
              siteLink('All collections', '/collections'),
              filterLink('New arrivals', 'rings', { tab: 'new' }),
              pendingLink('One-of-a-kind', 'rings'),
              shopAll('View the full house', '/collections'),
            ],
          },
        ],
        [
          {
            heading: 'Shop by piece',
            links: [
              siteLink('Rings', '/collections/rings'),
              siteLink('Earrings', '/collections/earrings'),
              siteLink('Necklaces', '/collections/necklaces'),
              siteLink('Pendants', '/collections/pendants'),
              siteLink('Bangles & bracelets', '/collections/bracelets'),
            ],
          },
        ],
        [
          {
            heading: 'The atelier',
            links: [
              siteLink('Bespoke commissions', '/services'),
              siteLink('Our craft', '/about'),
              siteLink('Talk to a specialist', '/chat'),
            ],
          },
        ],
      ],
      features: [
        {
          image: '/osiyan-high-jewelry.jpg',
          alt: 'Emerald and diamond high jewelry earrings',
          title: 'High Jewelry',
          caption: 'Rare stones, singular settings',
          to: '/collections',
        },
        {
          image: '/osiyan-luxury-1.jpeg',
          alt: 'Osiyan high jewelry detail',
          title: 'Unseen Hours',
          caption: 'The making of a one-off piece',
          to: '/about',
        },
      ],
    },
  },
  { label: 'Chat', key: 'chat', to: '/chat', icon: 'chat' },
  { label: 'About', key: 'about', to: '/about' },
]

export const UTILITY_LINKS = [
  { label: 'Book an appointment', to: '/services' },
] as const
export const LOCALE_LABEL = 'United States / $ USD'
