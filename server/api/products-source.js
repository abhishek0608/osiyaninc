import { prisma } from './db.js'
import { toApiProduct } from './product-presenter.js'
import {
  isS3Configured,
  listAllProductImagesBySlug,
  folderMatchesSlug,
  isThumbnailImage,
} from './s3-images.js'

export { toApiProduct }

const CATALOG_CACHE_TTL_MS = 60_000
// The S3 bucket lives in a different region from the function, so a full
// listing sweep is expensive. It changes far less often than the catalog, so
// it gets its own longer-lived cache and is refreshed independently of the
// 60s catalog cache (which otherwise re-swept S3 on every expiry/cold start).
const S3_IMAGE_CACHE_TTL_MS = 10 * 60_000
let catalogCache = { products: null, expiresAt: 0 }
let catalogFetchPromise = null
let s3ImageCache = { map: null, expiresAt: 0 }
let s3FetchPromise = null

export function invalidateCatalogProductsCache() {
  catalogCache = { products: null, expiresAt: 0 }
  catalogFetchPromise = null
  s3ImageCache = { map: null, expiresAt: 0 }
  s3FetchPromise = null
}

// Cached, deduped access to the S3 slug->images map with stale-while-revalidate:
// a fresh map is returned immediately; a stale one is returned while a single
// background refresh runs; only a cold cache awaits the sweep.
async function getS3ImageMap() {
  const now = Date.now()
  if (s3ImageCache.map && s3ImageCache.expiresAt > now) return s3ImageCache.map

  if (!s3FetchPromise) {
    s3FetchPromise = listAllProductImagesBySlug()
      .then((map) => {
        s3ImageCache = { map, expiresAt: Date.now() + S3_IMAGE_CACHE_TTL_MS }
        return map
      })
      .catch((err) => {
        console.error('S3 image sweep failed (serving DB images only):', err?.message || err)
        return s3ImageCache.map || new Map()
      })
      .finally(() => {
        s3FetchPromise = null
      })
  }

  // Stale value available -> don't block on the refresh; serve stale now.
  if (s3ImageCache.map) return s3ImageCache.map
  return s3FetchPromise
}

async function fetchCatalogProductsFromDb() {
  const dbProducts = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      subtype: true,
      material: true,
      color: true,
      description: true,
      aiDescription: true,
      productAttributes: true,
      certLab: true,
      certNumber: true,
      certFileUrl: true,
      certifiedAt: true,
      styleTags: true,
      stoneTags: true,
      customizationOptions: true,
      isNewArrival: true,
      isBestSeller: true,
      rating: true,
      reviewCount: true,
      variants: {
        where: { active: true },
        orderBy: { listPricePaise: 'asc' },
        select: {
          id: true,
          active: true,
          listPricePaise: true,
        },
      },
      images: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          active: true,
          sortOrder: true,
          url: true,
        },
      },
      priceBookMap: {
        where: {
          minQty: { lte: 1 },
          priceBook: { active: true, channel: 'B2C' },
        },
        select: {
          minQty: true,
          pricePaise: true,
          validFrom: true,
          validTo: true,
          priceBook: {
            select: {
              active: true,
              channel: true,
            },
          },
        },
        orderBy: [{ minQty: 'asc' }, { validFrom: 'desc' }],
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const products = Array.isArray(dbProducts) ? dbProducts.map((dbProduct) => toApiProduct(dbProduct)) : []
  return applyS3Images(products)
}

// S3 is the source of truth for product photos, so a product's S3 folder
// *replaces* its ProductImage rows rather than being appended to them. The
// folder is named after the slug, optionally uppercased and/or with a size
// suffix (slug "pd0448" -> "PD0448_8"), resolved via the shared
// case-insensitive matcher.
//
// Products with no S3 folder keep their DB rows. Every active product is
// S3-backed, so in practice that fallback only covers retired products (and
// keeps the catalog from emptying out if the S3 sweep ever fails).
//
// Exported because every API-shaped product list needs this pass: image
// embeddings are synced from S3 when a product has no DB image rows, so a
// search result hydrated straight from Prisma would otherwise come back with
// images: [] for exactly the products the photo search is best at finding.
export async function applyS3Images(products) {
  if (!isS3Configured() || !products.length) return products
  try {
    const imagesByFolder = await getS3ImageMap()
    if (!imagesByFolder || !imagesByFolder.size) return products
    const folderEntries = [...imagesByFolder.entries()]
    for (const product of products) {
      const match = folderEntries.find(([folder]) => folderMatchesSlug(folder, product.slug))
      const s3Images = match?.[1]
      if (!s3Images || !s3Images.length) continue
      const images = s3Images.slice()
      // A "_thumbnail" file is the photo pipeline's explicit pick for the card,
      // so it takes position 0 regardless of where it sorts.
      const thumbnailAt = images.findIndex((url) => isThumbnailImage(url))
      if (thumbnailAt > 0) {
        const [thumbnail] = images.splice(thumbnailAt, 1)
        images.unshift(thumbnail)
      }
      product.images = images
    }
  } catch (err) {
    console.error('S3 image resolve failed (serving DB images only):', err?.message || err)
  }
  return products
}

/**
 * Lean, summary-shaped projection of the live DB catalog for the chat assistant
 * (title/category/subtype/material/price/etc.). The database is the single
 * source of truth; if it is empty or unreachable this returns [].
 */
export async function getCatalogProductSummaries() {
  let products = []
  try {
    products = await getCatalogProducts()
  } catch {
    products = []
  }
  if (!Array.isArray(products) || !products.length) return []
  return products.map((p) => ({
    title: p.title,
    category: p.category,
    subtype: p.subtype,
    material: p.material,
    color: p.color,
    price: p.price,
    priceValue: p.priceValue,
    priceOnRequest: p.priceOnRequest,
    slug: p.slug,
    description: p.description,
    aiDescription: p.aiDescription,
    styleTags: p.styleTags,
    stoneTags: p.stoneTags,
    isNewArrival: p.isNewArrival,
    isBestSeller: p.isBestSeller,
  }))
}

export async function getCatalogProducts() {
  const now = Date.now()
  if (catalogCache.products && catalogCache.expiresAt > now) {
    return catalogCache.products
  }

  // Single in-flight refresh shared across concurrent callers.
  if (!catalogFetchPromise) {
    catalogFetchPromise = fetchCatalogProductsFromDb()
      .then((products) => {
        catalogCache = {
          products,
          expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
        }
        return products
      })
      .catch((err) => {
        console.error('DB products fetch failed:', err)
        // Keep any stale catalog so callers can fall back to it below.
        return catalogCache.products || []
      })
      .finally(() => {
        catalogFetchPromise = null
      })
  }

  // Stale-while-revalidate: if we have a previously cached (now-expired)
  // catalog, serve it immediately and let the refresh run in the background.
  // Only a truly cold cache waits for the DB + S3 build.
  if (catalogCache.products) return catalogCache.products
  return catalogFetchPromise
}
