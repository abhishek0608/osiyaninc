/**
 * Generates Bedrock Titan IMAGE embeddings for every active product's photos
 * and stores them in ProductImageEmbedding (pgvector, 1024 dims).
 *
 * The actual embedding logic lives in server/api/image-embedding.js so the
 * seed script and the admin create/update flow stay in lockstep — including
 * S3-only products and unchanged-image skipping (rows are keyed by a hash of
 * the image source, so re-running only embeds new/changed photos).
 *
 * Run: node --env-file=.env scripts/seed-image-embeddings.mjs
 *      (optionally pass --missing to only touch products with no image vectors)
 */
import { prisma } from '../server/api/db.js'
import {
  isImageEmbeddingConfigured,
  updateProductImageEmbeddings,
} from '../server/api/image-embedding.js'

const ONLY_MISSING = process.argv.includes('--missing')
const BATCH_DELAY_MS = 300

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function seedImageEmbeddings() {
  if (!isImageEmbeddingConfigured()) {
    console.error('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set in .env')
    process.exit(1)
  }

  const where = { active: true }
  if (ONLY_MISSING) {
    // Raw SQL: Prisma's client API cannot filter on Unsupported("vector") columns.
    const covered = await prisma.$queryRawUnsafe(
      'SELECT DISTINCT "productId" FROM "ProductImageEmbedding" WHERE embedding IS NOT NULL'
    )
    where.id = { notIn: covered.map((r) => r.productId) }
  }

  const products = await prisma.product.findMany({ where, select: { id: true, slug: true } })
  console.log(`Image-embedding ${products.length} product(s)${ONLY_MISSING ? ' (missing only)' : ''}…\n`)

  let embedded = 0
  let skipped = 0
  let failed = 0

  for (const product of products) {
    try {
      const result = await updateProductImageEmbeddings(product.id)
      embedded += result.embedded || 0
      skipped += result.skipped || 0
      console.log(
        `  ✓ ${product.slug}  [${result.embedded || 0} embedded, ${result.skipped || 0} skipped, ${result.removed || 0} removed]`
      )
    } catch (err) {
      failed++
      console.error(`  ✗ ${product.slug}: ${err.message}`)
    }
    await sleep(BATCH_DELAY_MS)
  }

  console.log(`\nDone. ${embedded} image(s) embedded, ${skipped} skipped, ${failed} product(s) failed.`)
}

seedImageEmbeddings()
  .catch((err) => {
    console.error('Seed image embeddings failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
