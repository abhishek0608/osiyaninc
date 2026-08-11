/**
 * Mark a fixed list of products inactive (active = false).
 * Dry-run by default; pass --apply to actually update.
 */
import { prisma } from '../server/api/db.js'

const slugs = [
  'veda-silver-bracelet',
  'indra-link-bracelet',
  'divya-pearl-jhumka-earrings',
  'isha-silver-chandelier',
  'veer-silver-kada',
  'ziya-silver-collar',
  'noor-silver-necklace',
  'nila-silver-ring',
  'arya-silver-studs',
  'raaga-mangalsutra',
  'amara-hoop-earrings',
  'tara-stud-ring',
  'sita-silver-necklace',
  'meera-silver-earrings',
  'luna-silver-ring',
  'knot-mangalsutra',
  'padma-mangalsutra',
  'nuit-earrings',
  'soleil-bracelet',
  'lune-pendant',
  'verde-duet-bypass-ring',
  'auric-openwork-ring',
  'celeste-solitaire-ring',
  'etoile-ring',
  'teardrop-shaped-yellow-gold-and-diamond-pendant',
  'er1',
  'ruby-ring',
]

const apply = process.argv.includes('--apply')

async function run() {
  const found = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, title: true, active: true },
  })
  const foundSlugs = new Set(found.map((p) => p.slug))
  const missing = slugs.filter((s) => !foundSlugs.has(s))
  const total = await prisma.product.count()
  const activeBefore = await prisma.product.count({ where: { active: true } })

  console.log(`Catalog: ${total} products, ${activeBefore} active`)
  console.log(`Requested: ${slugs.length} slugs`)
  console.log(`Matched in DB: ${found.length}`)
  if (missing.length) console.log(`NOT FOUND (${missing.length}): ${missing.join(', ')}`)
  const alreadyInactive = found.filter((p) => !p.active)
  if (alreadyInactive.length)
    console.log(`Already inactive: ${alreadyInactive.map((p) => p.slug).join(', ')}`)

  if (!apply) {
    console.log('\nDRY RUN — re-run with --apply to set active = false on the matched products.')
    return
  }

  const res = await prisma.product.updateMany({
    where: { slug: { in: slugs } },
    data: { active: false },
  })
  const activeAfter = await prisma.product.count({ where: { active: true } })
  console.log(`\nUpdated ${res.count} products. Active now: ${activeAfter}`)
}

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
