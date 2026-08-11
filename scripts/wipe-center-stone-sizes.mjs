/**
 * One-off cleanup: clears the carat-era `centerStoneSizes` values from every
 * product's customizationOptions. Stone size is now a dimension sourced from the
 * StoneSize registry, which starts empty and re-fills as dimension-based
 * products are uploaded/saved.
 *
 * Other customization options (shapes, qualities, ring sizes, the
 * allowCustomCenterStoneSize flag, …) are left untouched.
 *
 * Run: node --env-file=.env scripts/wipe-center-stone-sizes.mjs
 */
import { prisma } from '../server/api/db.js'

async function wipeCenterStoneSizes() {
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, customizationOptions: true },
  })

  let cleared = 0
  for (const product of products) {
    const opts = product.customizationOptions
    if (!opts || typeof opts !== 'object' || Array.isArray(opts)) continue
    const current = opts.centerStoneSizes
    if (!Array.isArray(current) || current.length === 0) continue

    // eslint-disable-next-line no-await-in-loop
    await prisma.product.update({
      where: { id: product.id },
      data: { customizationOptions: { ...opts, centerStoneSizes: [] } },
    })
    cleared += 1
    console.log(`cleared ${current.length} size(s) from ${product.slug}`)
  }

  console.log(`\nDone. Cleared centerStoneSizes on ${cleared} product(s).`)
}

wipeCenterStoneSizes()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
