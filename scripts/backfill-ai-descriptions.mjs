import { prisma } from '../server/api/db.js'
import { generateProductAiDescription } from '../server/api/product-ai.js'

const BATCH_DELAY_MS = 500

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      images: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { url: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  let generated = 0
  let skipped = 0
  let failed = 0

  for (const product of products) {
    const imageUrls = product.images.map((image) => image.url).filter(Boolean)
    if (!imageUrls.length) {
      skipped++
      console.log(`- skipped ${product.slug} (no active images)`)
      continue
    }

    try {
      const aiDescription = await generateProductAiDescription({
        images: imageUrls,
        category: product.category,
        title: product.title,
      })

      await prisma.product.update({
        where: { id: product.id },
        data: { aiDescription: aiDescription || null },
      })

      generated++
      console.log(`+ generated ${product.slug}`)
    } catch (error) {
      failed++
      console.error(`! failed ${product.slug}: ${error.message}`)
    }

    await sleep(BATCH_DELAY_MS)
  }

  const cleared = await prisma.product.updateMany({
    data: { description: null },
  })

  console.log(
    JSON.stringify(
      {
        generated,
        skipped,
        failed,
        clearedDescriptions: cleared.count,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error('Backfill AI descriptions failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
