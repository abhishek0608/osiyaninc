import { prisma } from './db.js'
import { applyS3Images } from './products-source.js'

// Seed-data image rows point at S3 folders that were never uploaded (e.g.
// Osiyan-product-images/amrita-halo-ring/), and S3 answers those with 403. A DB
// fallback URL on our bucket is checked before it is sent, so the page shows its
// placeholder straight away instead of after a failed load. Photos found by the
// S3 sweep exist by construction and are not checked.
const S3_URL = /^https:\/\/[^/]+\.s3[.-][^/]*amazonaws\.com\//i
const URL_CHECK_TTL_MS = 10 * 60 * 1000
const urlChecks = new Map()

async function bucketUrlExists(url) {
  const cached = urlChecks.get(url)
  if (cached && cached.expiresAt > Date.now()) return cached.exists
  let exists
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    // Without public listing S3 answers 403, not 404, for a missing key. Any
    // other failure is treated as transient: keep the URL and let the browser try.
    exists = res.status !== 403 && res.status !== 404
  } catch {
    return true
  }
  urlChecks.set(url, { exists, expiresAt: Date.now() + URL_CHECK_TTL_MS })
  return exists
}

/**
 * Fill `image` on every line of one or more order/memo payloads.
 *
 * Lines snapshot their title and price but not a photo, and most pieces keep
 * their photos only in S3 (folder keyed by Style No), so the DB image rows alone
 * leave most lines blank. Resolve each line's first photo the way the catalogue
 * does: S3 first, DB rows as the fallback. Lines are matched by `variantId`.
 * Failures are non-fatal — the lines just keep whatever image they had.
 *
 * @param {object|object[]} payload - payload(s) with an `items` array.
 * @returns the same payload, mutated.
 */
export async function withLineImages(payload) {
  const payloads = (Array.isArray(payload) ? payload : [payload]).filter(Boolean)
  const items = payloads.flatMap((p) => (Array.isArray(p.items) ? p.items : []))
  const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))]
  if (!variantIds.length) return payload

  try {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        product: {
          select: {
            id: true,
            slug: true,
            title: true,
            productAttributes: true,
            images: { where: { active: true }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
          },
        },
      },
    })

    // One entry per product: several lines (or memos) can share a piece.
    const productsById = new Map()
    const dbImagesById = new Map()
    const productByVariant = new Map()
    for (const variant of variants) {
      const { product } = variant
      if (!product) continue
      if (!productsById.has(product.id)) {
        const dbImages = product.images.map((img) => img.url).filter(Boolean)
        dbImagesById.set(product.id, dbImages)
        productsById.set(product.id, {
          slug: product.slug,
          title: product.title,
          productAttributes: product.productAttributes,
          images: dbImages,
        })
      }
      productByVariant.set(variant.id, productsById.get(product.id))
    }
    await applyS3Images([...productsById.values()])

    // applyS3Images swaps in a new array when it finds photos, so a product still
    // holding its DB array fell back to the DB rows.
    await Promise.all(
      [...productsById.entries()].map(async ([id, product]) => {
        if (product.images !== dbImagesById.get(id)) return
        const first = product.images[0]
        if (first && S3_URL.test(first) && !(await bucketUrlExists(first))) product.images = []
      }),
    )

    for (const item of items) {
      const product = productByVariant.get(item.variantId)
      // A resolved piece overrides whatever the payload carried, which for orders
      // is the raw DB row and may be one of the dead seed links.
      if (product) item.image = product.images?.[0] || ''
      else if (item.image === undefined) item.image = ''
    }
  } catch (err) {
    console.error('Line image resolve failed:', err?.message || err)
  }
  return payload
}
