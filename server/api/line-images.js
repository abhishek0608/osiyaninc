import { prisma } from './db.js'
import { applyS3Images } from './products-source.js'

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
    const productByVariant = new Map()
    for (const variant of variants) {
      const { product } = variant
      if (!product) continue
      if (!productsById.has(product.id)) {
        productsById.set(product.id, {
          slug: product.slug,
          title: product.title,
          productAttributes: product.productAttributes,
          images: product.images.map((img) => img.url).filter(Boolean),
        })
      }
      productByVariant.set(variant.id, productsById.get(product.id))
    }
    await applyS3Images([...productsById.values()])

    for (const item of items) {
      const image = productByVariant.get(item.variantId)?.images?.[0]
      if (image) item.image = image
      else if (item.image === undefined) item.image = ''
    }
  } catch (err) {
    console.error('Line image resolve failed:', err?.message || err)
  }
  return payload
}
