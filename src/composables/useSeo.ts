import type { Product } from '../data/products'

const SITE_NAME = 'Osiyan | High End Designer Jewelry'
const SITE_URL = 'https://www.osiyaninc.com'
const DEFAULT_DESCRIPTION =
  'Osiyan — high-end designer jewelry shaped by rare gemstones, precision and exceptional craftsmanship.'

const PRODUCT_JSONLD_ID = 'seo-product-jsonld'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * Sets the document title, description and canonical for the current page.
 * Pages the SPA shell can't describe (products, collections) call this once
 * their data resolves; static routes are covered by the router hook.
 */
export function setPageMeta(options: { title?: string; description?: string; noindex?: boolean } = {}) {
  const title = options.title ? `${options.title} | Osiyan` : SITE_NAME
  const description = options.description?.trim() || DEFAULT_DESCRIPTION

  document.title = title
  upsertMeta('name', 'description', description)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:url', `${SITE_URL}${window.location.pathname}`)

  let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (options.noindex) {
    if (!robots) {
      robots = document.createElement('meta')
      robots.setAttribute('name', 'robots')
      document.head.appendChild(robots)
    }
    robots.setAttribute('content', 'noindex, nofollow')
  } else {
    robots?.remove()
  }

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', `${SITE_URL}${window.location.pathname}`)
}

/** Injects schema.org Product JSON-LD so product pages qualify for rich results. */
export function setProductJsonLd(product: Product) {
  clearProductJsonLd()

  const currency = product.price?.includes('₹') ? 'INR' : 'USD'
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image: (product.images || []).filter(Boolean).map((src) =>
      src.startsWith('http') ? src : `${SITE_URL}${src}`,
    ),
    url: `${SITE_URL}/product/${product.slug}`,
    brand: { '@type': 'Brand', name: 'Osiyan' },
    category: product.category,
  }

  if (product.priceValue > 0) {
    data.offers = {
      '@type': 'Offer',
      price: product.priceValue,
      priceCurrency: currency,
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/product/${product.slug}`,
    }
  }

  if (product.rating && product.reviewCount) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    }
  }

  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = PRODUCT_JSONLD_ID
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}

export function clearProductJsonLd() {
  document.getElementById(PRODUCT_JSONLD_ID)?.remove()
}
