// Attaches the placeholder in-house assay report (public/certificates/) to a
// demo product so the storefront's Certification accordion has something to
// show before real lab scans are uploaded through the internal console.
//
//   node --env-file=.env scripts/seed-dummy-certificate.mjs
//
// The report is deliberately stamped SAMPLE and credits no independent lab, so
// nothing here claims third-party grading.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SEED = {
  slug: 'tara-gold-hoops',
  certLab: 'In-house',
  certNumber: 'OSY-IH-2026-0147',
  certFileUrl: '/certificates/tara-gold-hoops-sample-report.pdf',
  certifiedAt: new Date('2026-08-19T00:00:00.000Z'),
}

const product = await prisma.product.findFirst({ where: { slug: SEED.slug }, select: { id: true } })
if (!product) {
  console.error(`No product with slug "${SEED.slug}". Seed the catalog first.`)
  process.exit(1)
}

// certFileKey stays null: the file is a repo asset, not an S3 object, so the
// internal console's replace/delete flow has nothing to clean up.
await prisma.product.update({
  where: { id: product.id },
  data: {
    certLab: SEED.certLab,
    certNumber: SEED.certNumber,
    certFileUrl: SEED.certFileUrl,
    certFileKey: null,
    certifiedAt: SEED.certifiedAt,
  },
})

console.log(`Certification seeded on ${SEED.slug}: ${SEED.certLab} ${SEED.certNumber}`)
await prisma.$disconnect()
