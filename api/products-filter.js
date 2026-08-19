import { prisma } from '../server/api/db.js'
import { normalizeFilterCriteria } from '../server/api/product-filter.js'
import { toApiProduct, getCatalogProducts } from '../server/api/products-source.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'

// `Product.category` is a free-form string, so a normalized filter key can map
// to more than one spelling actually stored in the DB.
const DB_CATEGORY_MAP = {
  rings: ['Rings'],
  earrings: ['Earrings'],
  'mangal sutra': ['Mangal Sutra'],
  necklaces: ['Necklaces'],
  bracelets: ['Bracelets', 'Bracelet'],
  bangles: ['Bangles', 'Bangle'],
}

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const body =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body)
          } catch {
            return {}
          }
        })()
      : req.body || {}
  const tab = typeof body?.tab === 'string' ? body.tab : 'all'
  const inputFilters = body?.filters || {}
  const normalized = normalizeFilterCriteria({ ...inputFilters, tab })

  const categories = [...new Set(normalized.categories.flatMap((key) => DB_CATEGORY_MAP[key] || []))]

  const where = {
    active: true,
    ...(normalized.tab === 'new' ? { isNewArrival: true } : {}),
    ...(normalized.tab === 'bestseller' ? { isBestSeller: true } : {}),
    ...(categories.length ? { category: { in: categories } } : {}),
    ...(normalized.materials.length ? { material: { in: normalized.materials } } : {}),
    ...(normalized.colors.length ? { color: { in: normalized.colors } } : {}),
    ...(normalized.priceMin != null || normalized.priceMax != null
      ? {
          OR: [
            {
              variants: {
                some: {
                  active: true,
                  listPricePaise: {
                    ...(normalized.priceMin != null ? { gte: normalized.priceMin } : {}),
                    ...(normalized.priceMax != null ? { lte: normalized.priceMax } : {}),
                  },
                },
              },
            },
            {
              priceBookMap: {
                some: {
                  minQty: { lte: 1 },
                  priceBook: { active: true, channel: 'B2C' },
                  pricePaise: {
                    ...(normalized.priceMin != null ? { gte: normalized.priceMin } : {}),
                    ...(normalized.priceMax != null ? { lte: normalized.priceMax } : {}),
                  },
                },
              },
            },
          ],
        }
      : {
          variants: { some: { active: true } },
        }),
  }

  try {
    const dbProducts = await prisma.product.findMany({
      where,
      include: {
        variants: {
          where: { active: true },
          orderBy: { listPricePaise: 'asc' },
        },
        images: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
          take: 2,
        },
        priceBookMap: {
          where: {
            minQty: { lte: 1 },
            priceBook: { active: true, channel: 'B2C' },
          },
          include: { priceBook: true },
          orderBy: [{ minQty: 'asc' }, { validFrom: 'desc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    const products = Array.isArray(dbProducts) ? dbProducts.map((dbProduct) => toApiProduct(dbProduct)) : []

    // This query reads images straight from the DB, but S3 is the source of
    // truth for photos, so the cached catalog's set (already S3-resolved) wins
    // whenever it has one. Taking it only when the DB gave nothing would let a
    // product still holding legacy base64 rows serve those instead of its S3
    // photos, so grid thumbnails would disagree with the detail page. DB rows
    // are the fallback for products with no S3 folder. Reading the cached
    // catalog keeps this off the S3 sweep path on every request.
    try {
      const catalog = await getCatalogProducts()
      const imagesBySlug = new Map(catalog.map((p) => [p.slug, p.images]))
      for (const product of products) {
        const catalogImages = imagesBySlug.get(product.slug)
        if (catalogImages?.length) product.images = catalogImages
      }
    } catch (err) {
      console.error('Catalog image overlay failed (serving DB images only):', err?.message || err)
    }

    return res.status(200).json({ products })
  } catch (err) {
    console.error('DB filtered products fetch failed:', err)
    return res.status(500).json({ message: 'Failed to load filtered products.' })
  }
}
