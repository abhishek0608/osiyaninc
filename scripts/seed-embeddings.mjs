/**
 * Generates OpenAI embeddings for every active product and stores them in the
 * Product.embedding column (pgvector).
 *
 * The actual embedding logic lives in server/api/product-embedding.js so the
 * seed script and the admin create/update flow stay in lockstep — including
 * base64 data-URI image support and the query/catalog text-format alignment.
 *
 * Run: node --env-file=.env scripts/seed-embeddings.mjs
 *      (optionally pass --missing to only embed products without a vector)
 */
import { prisma } from '../server/api/db.js'
import { updateProductEmbedding } from '../server/api/product-embedding.js'

const ONLY_MISSING = process.argv.includes('--missing')
const BATCH_DELAY_MS = 500

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function seedEmbeddings() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set in .env')
    process.exit(1)
  }

  const where = { active: true }
  if (ONLY_MISSING) {
    const missing = await prisma.$queryRawUnsafe(
      'SELECT id FROM "Product" WHERE active = true AND embedding IS NULL'
    )
    where.id = { in: missing.map((r) => r.id) }
  }

  const products = await prisma.product.findMany({ where, select: { id: true, slug: true } })
  console.log(`Embedding ${products.length} product(s)${ONLY_MISSING ? ' (missing only)' : ''}…\n`)

  let vision = 0
  let fallback = 0
  let failed = 0

  for (const product of products) {
    try {
      const result = await updateProductEmbedding(product.id)
      if (result.source === 'vision') vision++
      else fallback++
      console.log(`  ✓ ${product.slug}  [${result.source}]`)
    } catch (err) {
      failed++
      console.error(`  ✗ ${product.slug}: ${err.message}`)
    }
    await sleep(BATCH_DELAY_MS)
  }

  console.log(`\nDone. ${vision} vision-based, ${fallback} text-fallback, ${failed} failed.`)
}

seedEmbeddings()
  .catch((err) => {
    console.error('Seed embeddings failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
