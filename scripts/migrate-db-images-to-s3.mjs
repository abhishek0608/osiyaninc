/**
 * Give every product an S3 folder, so the bucket can become the only source of
 * product photos.
 *
 * Deliberately narrow: it only ever CREATES folders for products that don't
 * have one. Folders that already exist are never modified — no re-upload, no
 * reconciliation, no deletion — and no ProductImage row is ever touched. Once
 * the storefront stops merging DB rows, those rows go inert on their own, so
 * nothing has to be deleted to finish the job.
 *
 * Only base64 (data-URI) rows can be uploaded, since they're the only ones
 * holding actual bytes. Rows pointing at an external site or a relative path
 * are reported and left for a human.
 *
 * Dry-run by default; pass --apply to upload.
 *   node --env-file=.env scripts/migrate-db-images-to-s3.mjs
 *   node --env-file=.env scripts/migrate-db-images-to-s3.mjs --apply
 *
 * Flags:
 *   --apply              actually upload
 *   --include-inactive   also process inactive products (default: active only)
 *   --slug=<slug>        limit to one product (repeatable)
 *   --resume             also finish folders left incomplete by an interrupted
 *                        run of THIS script (recognised by their <slug>_<n>
 *                        filenames), uploading only the images still missing
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '../server/api/db.js'
import { listProductImagesBySlug, isS3Configured } from '../server/api/s3-images.js'

const REGION = process.env.AWS_REGION || 'us-east-1'
const BUCKET = process.env.AWS_S3_BUCKET || ''
const BASE_PREFIX = (process.env.AWS_S3_BASE_PREFIX || 'Kiana-product-images').replace(/\/+$/, '')

const apply = process.argv.includes('--apply')
const includeInactive = process.argv.includes('--include-inactive')
const resume = process.argv.includes('--resume')
const onlySlugs = process.argv
  .filter((a) => a.startsWith('--slug='))
  .map((a) => a.slice('--slug='.length))

const EXT_BY_MIME = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

function isBase64Row(rawUrl) {
  return String(rawUrl ?? '').startsWith('data:')
}

function decodeDataUri(url) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url)
  if (!match) return null
  const [, mime, isBase64, payload] = match
  const ext = EXT_BY_MIME[mime.toLowerCase()]
  if (!ext) return null
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8')
  if (!buffer.length) return null
  return { mime: mime.toLowerCase(), ext, buffer }
}

// True when every object in the folder is named "<slug>_<n>.<ext>" — the
// convention this script and the internal uploader write. Folders populated by
// the external bulk process use other names (image-1.webp, SKU_7X5-1-W.jpg),
// and those must never be treated as resumable.
function folderWrittenByUs(slug, images) {
  if (!images.length) return false
  const pattern = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+\\.[a-z0-9]+$`, 'i')
  return images.every((img) => pattern.test(String(img.key || '').split('/').pop() || ''))
}

let client = null
function getClient() {
  if (!client) {
    client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return client
}

async function run() {
  if (!isS3Configured()) throw new Error('S3 is not configured — set AWS_S3_BUCKET and credentials.')

  const where = {}
  if (!includeInactive) where.active = true
  if (onlySlugs.length) where.slug = { in: onlySlugs }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      slug: true,
      active: true,
      images: { select: { id: true, url: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { slug: 'asc' },
  })

  console.log(
    `${products.length} products in scope (${includeInactive ? 'active + inactive' : 'active only'})`,
  )

  const totals = { uploaded: 0, created: 0, resumed: 0, failed: 0 }
  const untouched = []
  const unbacked = []

  for (const product of products) {
    const label = `${product.slug}${product.active ? '' : ' (inactive)'}`
    const base64Rows = product.images.filter((image) => isBase64Row(image.url))
    const existing = await listProductImagesBySlug(product.slug)

    // Folder already there: leave it exactly as it is, unless it is one of ours
    // left half-finished and --resume was asked for.
    if (existing.length) {
      const ours = folderWrittenByUs(product.slug, existing)
      const missing = base64Rows.length - existing.length
      if (resume && ours && missing > 0) {
        console.log(`${label}: resuming — ${existing.length}/${base64Rows.length} present, uploading ${missing} more`)
      } else {
        if (ours && missing > 0) {
          untouched.push(`${label}: folder incomplete (${existing.length}/${base64Rows.length}) — pass --resume to finish`)
        }
        continue
      }
    }

    if (!base64Rows.length) {
      const other = product.images.length
      if (other) unbacked.push(`${label}: ${other} row(s) with no uploadable bytes (external URL or relative path)`)
      continue
    }

    // Rows are ordered by sortOrder and written as <slug>_1..N, so on a resume
    // the first `existing.length` rows are the ones already in the bucket.
    const pending = existing.length ? base64Rows.slice(existing.length) : base64Rows
    const planned = []
    for (const [offset, image] of pending.entries()) {
      const decoded = decodeDataUri(String(image.url))
      if (!decoded) {
        totals.failed++
        console.log(`${label}: SKIP row ${image.id} — unsupported or empty data URI`)
        continue
      }
      const n = existing.length + offset + 1
      planned.push({ key: `${BASE_PREFIX}/${product.slug}/${product.slug}_${n}.${decoded.ext}`, decoded })
    }
    if (!planned.length) continue

    const bytes = planned.reduce((n, p) => n + p.decoded.buffer.length, 0)
    if (!existing.length) {
      console.log(`${label}: create folder, upload ${planned.length} image(s) (${(bytes / 1048576).toFixed(1)} MB)`)
    }

    if (!apply) {
      totals.uploaded += planned.length
      if (existing.length) totals.resumed++
      else totals.created++
      continue
    }

    let ok = 0
    for (const item of planned) {
      try {
        await getClient().send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: item.key,
            Body: item.decoded.buffer,
            ContentType: item.decoded.mime,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        )
        ok++
        totals.uploaded++
      } catch (err) {
        totals.failed++
        console.error(`  UPLOAD FAILED ${item.key}: ${err?.message || err}`)
        break
      }
    }

    const after = await listProductImagesBySlug(product.slug)
    console.log(`  ${label}: uploaded ${ok}/${planned.length}, S3 now lists ${after.length}`)
    if (existing.length) totals.resumed++
    else totals.created++
  }

  console.log('\n--- summary ---')
  console.log(`images uploaded:   ${totals.uploaded}`)
  console.log(`folders created:   ${totals.created}`)
  console.log(`folders resumed:   ${totals.resumed}`)
  console.log(`failures:          ${totals.failed}`)
  console.log('ProductImage rows: untouched (by design)')
  if (untouched.length) {
    console.log('\nincomplete folders left alone:')
    untouched.forEach((l) => console.log(`  ${l}`))
  }
  if (unbacked.length) {
    console.log('\nrows with nothing uploadable (need a human):')
    unbacked.forEach((l) => console.log(`  ${l}`))
  }
  if (!apply) console.log('\nDRY RUN — re-run with --apply to upload.')
}

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
