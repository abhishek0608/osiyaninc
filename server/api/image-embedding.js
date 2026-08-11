/**
 * IMAGE embeddings for visual search (1024 dims, provider-switchable:
 * Jina CLIP v2 or AWS Bedrock Titan multimodal).
 *
 * Product.embedding (product-embedding.js) embeds a TEXT description of the
 * product, which is right for chat/text queries but lossy for photo queries —
 * two visually different solitaire rings collapse into near-identical text.
 * This module embeds the product PHOTOS themselves, so a query photo is
 * compared pixel-feature-to-pixel-feature, Google-Lens style.
 *
 * One ProductImageEmbedding row per photo; search takes the best-matching
 * photo per product. imageKey is a sha256 of provider + source reference, so
 * re-saving a product only re-embeds images that actually changed — and
 * because the two providers' vector spaces are incompatible, switching
 * provider stales every key and the sync logic re-embeds the catalog
 * automatically. Provider defaults to Jina when JINA_API_KEY is set (Bedrock
 * needs the AWS account unblocked); override with IMAGE_EMBED_PROVIDER.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import sharp from 'sharp'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { prisma } from './db.js'
import { isS3Configured, listProductImagesBySlug } from './s3-images.js'

const IMAGE_EMBED_MODEL = process.env.BEDROCK_IMAGE_EMBED_MODEL || 'amazon.titan-embed-image-v1'
const JINA_EMBED_MODEL = process.env.JINA_IMAGE_EMBED_MODEL || 'jina-clip-v2'
const IMAGE_EMBED_DIMS = 1024
export const IMAGE_VECTOR_SIMILARITY_THRESHOLD =
  Number(process.env.IMAGE_VECTOR_SIMILARITY_THRESHOLD) || 0.4
export const IMAGE_VECTOR_RELAXED_THRESHOLD =
  Number(process.env.IMAGE_VECTOR_RELAXED_THRESHOLD) || 0.25
/**
 * At or above this similarity the photo match is near-duplicate territory —
 * stronger evidence of what the piece is than category/subtype metadata
 * (which is often regex-inferred from copy), so structural filters must
 * never drop such hits.
 */
export const IMAGE_VECTOR_TRUST_THRESHOLD =
  Number(process.env.IMAGE_VECTOR_TRUST_THRESHOLD) || 0.95

/** Cap on source bytes we're willing to download/decode before normalizing. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
/** Longest edge after normalization — plenty for Titan's visual features. */
const MAX_IMAGE_EDGE = 1024
/**
 * Photos embedded per product. Catalogs shoot 3 finishes × 3 angles = 9
 * photos, and sampling any subset leaves query blind spots (a shopper's
 * photo matches the one angle that wasn't indexed — happened twice with
 * PD1030). 12 covers full shoots with margin; the cap only guards against
 * pathological products with dozens of images.
 */
const MAX_IMAGES_PER_PRODUCT = 12

const PUBLIC_DIR = resolve(new URL('../..', import.meta.url).pathname, 'public')

let bedrockClient = null

/**
 * Kill switch for the photo-to-photo search path. Set IMAGE_VECTOR_SEARCH=off
 * in the environment to fall back to the previous (text-vector + attribute)
 * visual search without redeploying code or touching stored vectors. Catalog
 * embedding sync stays on either way, so vectors remain fresh for re-enable.
 */
export function isImageVectorSearchEnabled() {
  return String(process.env.IMAGE_VECTOR_SEARCH || 'on').toLowerCase().trim() !== 'off'
}

export function imageEmbeddingProvider() {
  const forced = String(process.env.IMAGE_EMBED_PROVIDER || '').toLowerCase().trim()
  if (forced === 'bedrock' || forced === 'jina') return forced
  return String(process.env.JINA_API_KEY || '').trim() ? 'jina' : 'bedrock'
}

export function isImageEmbeddingConfigured() {
  if (imageEmbeddingProvider() === 'jina') {
    return Boolean(String(process.env.JINA_API_KEY || '').trim())
  }
  return Boolean(
    String(process.env.AWS_ACCESS_KEY_ID || '').trim() &&
      String(process.env.AWS_SECRET_ACCESS_KEY || '').trim()
  )
}

function getBedrockClient() {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
    })
  }
  return bedrockClient
}

export function imageSourceKey(source) {
  // Provider is part of the key on purpose: Titan and Jina vectors are in
  // unrelated spaces, so a provider switch must invalidate every stored row.
  return createHash('sha256')
    .update(`${imageEmbeddingProvider()}:${String(source || '')}`)
    .digest('hex')
}

/**
 * Titan only accepts JPEG/PNG (webp and others fail with "Operation not
 * allowed"), so every image — catalog photos and query uploads alike — is
 * normalized to a bounded JPEG. Same treatment on both sides keeps the
 * vectors comparable regardless of the original format or resolution.
 */
async function normalizeForTitan(buf) {
  return sharp(buf)
    .rotate() // honour EXIF orientation before it's stripped
    .flatten({ background: '#ffffff' }) // JPEG has no alpha; jewellery shots sit on white
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/**
 * Resolve an image reference (data URI, http(s) URL, or local /public path)
 * to normalized JPEG base64 for Titan. Returns null for unusable sources
 * (missing file, oversized, non-image response) so callers can skip that photo.
 */
async function resolveImageToBase64(source) {
  const value = String(source || '').trim()
  if (!value) return null

  let buf = null
  if (value.startsWith('data:image/')) {
    const base64 = value.split(',')[1] || ''
    if (base64) buf = Buffer.from(base64, 'base64')
  } else if (/^https?:\/\//i.test(value)) {
    const res = await fetch(value)
    if (!res.ok) return null
    const contentType = String(res.headers.get('content-type') || '')
    if (contentType && !contentType.startsWith('image/')) return null
    buf = Buffer.from(await res.arrayBuffer())
  } else if (value.startsWith('/')) {
    const localPath = join(PUBLIC_DIR, value.replace(/^\//, ''))
    if (existsSync(localPath)) buf = readFileSync(localPath)
  }

  if (!buf?.length || buf.length > MAX_IMAGE_BYTES) return null
  try {
    const normalized = await normalizeForTitan(buf)
    return normalized.toString('base64')
  } catch (err) {
    console.error('[image-embedding] image normalization failed -', err?.message || err)
    return null
  }
}

/**
 * Embed one image (base64, no data-URI prefix) with the active provider.
 * Throws on failure so callers can decide whether to skip or fall back.
 *
 * maxRetries only applies to rate-limit (429) responses. The Jina free tier
 * allows 100k tokens/min and one image costs 4k, i.e. ~25 images/min — the
 * catalog-sync path waits out the window, while the query path passes
 * maxRetries 0 so a shopper's search fails fast to the text fallback instead
 * of hanging inside a serverless timeout.
 */
export async function generateImageEmbedding(base64Image, { maxRetries = 4 } = {}) {
  return imageEmbeddingProvider() === 'jina'
    ? generateJinaImageEmbedding(base64Image, maxRetries)
    : generateTitanImageEmbedding(base64Image)
}

const JINA_RATE_LIMIT_DELAY_MS = 30_000

async function generateJinaImageEmbedding(base64Image, retriesLeft) {
  const apiKey = String(process.env.JINA_API_KEY || '').trim()
  if (!apiKey) throw new Error('JINA_API_KEY not set — cannot generate image embedding')

  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: JINA_EMBED_MODEL,
      input: [{ image: base64Image }],
    }),
  })
  if (res.status === 429 && retriesLeft > 0) {
    await new Promise((r) => setTimeout(r, JINA_RATE_LIMIT_DELAY_MS))
    return generateJinaImageEmbedding(base64Image, retriesLeft - 1)
  }
  if (!res.ok) {
    throw new Error(`Jina embeddings error ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  const vector = data?.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length !== IMAGE_EMBED_DIMS) {
    throw new Error(`Jina returned unexpected embedding shape: ${vector?.length} dims`)
  }
  return vector
}

async function generateTitanImageEmbedding(base64Image) {
  const command = new InvokeModelCommand({
    modelId: IMAGE_EMBED_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputImage: base64Image,
      embeddingConfig: { outputEmbeddingLength: IMAGE_EMBED_DIMS },
    }),
  })
  const response = await getBedrockClient().send(command)
  const payload = JSON.parse(new TextDecoder().decode(response.body))
  const vector = payload?.embedding
  if (!Array.isArray(vector) || vector.length !== IMAGE_EMBED_DIMS) {
    throw new Error(`Titan returned unexpected embedding shape: ${vector?.length} dims`)
  }
  return vector
}

/** Embed a query photo supplied as a data URL (the visual-search upload). */
export async function generateImageEmbeddingFromDataUrl(imageDataUrl) {
  const base64 = await resolveImageToBase64(imageDataUrl)
  if (!base64) throw new Error('Query image could not be resolved for embedding')
  // Fail fast on rate limits: the handler falls back to text-vector search.
  return generateImageEmbedding(base64, { maxRetries: 0 })
}

/**
 * Order image sources so finish/colour variants are covered before extra
 * angles of the same finish. Catalog photos are named per finish with an
 * angle index — "snapshot R (1)", "snapshot R (2)", "snapshot Y (1)" — and a
 * plain alphabetical slice of the first N would take three rose angles and
 * never index yellow, making the product invisible to yellow-gold query
 * photos. Grouping by filename-minus-index and round-robining across groups
 * yields R(1), W(1), Y(1), R(2)… so every finish gets a vector.
 */
export function diversifyImageSources(sources) {
  const groups = new Map()
  for (const source of sources) {
    const base = decodeURIComponent(String(source).split('/').pop() || '')
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[\s_-]*\(?\d+\)?$/, '')
      .trim()
    const key = base || String(source)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(source)
  }
  const lists = [...groups.values()]
  const ordered = []
  for (let round = 0; ordered.length < sources.length; round++) {
    let added = false
    for (const list of lists) {
      if (round < list.length) {
        ordered.push(list[round])
        added = true
      }
    }
    if (!added) break
  }
  return ordered
}

/**
 * Image sources for a product: DB ProductImage rows first, else the S3
 * folder matching the slug (same resolution order as the AI-description flow,
 * so S3-only products are covered too).
 */
async function listProductImageSources(product) {
  let sources = (product.images || []).map((image) => image.url).filter(Boolean)
  if (!sources.length && isS3Configured()) {
    try {
      const s3 = await listProductImagesBySlug(product.slug)
      sources = s3.map((img) => img.url).filter(Boolean)
    } catch (err) {
      console.error('[image-embedding] s3 list failed for', product.slug, '-', err?.message || err)
    }
  }
  return diversifyImageSources(sources).slice(0, MAX_IMAGES_PER_PRODUCT)
}

/**
 * Sync ProductImageEmbedding rows for one product: embed new photos, keep
 * unchanged ones (matched by imageKey), delete rows for removed photos.
 * Throws on total failure; individual bad images are skipped.
 */
export async function updateProductImageEmbeddings(productId) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      slug: true,
      images: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { url: true },
      },
    },
  })
  if (!product) return { ok: false, reason: 'not-found' }

  const sources = await listProductImageSources(product)
  const wanted = sources.map((source) => ({ source, key: imageSourceKey(source) }))
  const wantedKeys = new Set(wanted.map((w) => w.key))

  const existing = await prisma.productImageEmbedding.findMany({
    where: { productId },
    select: { id: true, imageKey: true },
  })
  const staleIds = existing.filter((row) => !wantedKeys.has(row.imageKey)).map((row) => row.id)
  if (staleIds.length) {
    await prisma.productImageEmbedding.deleteMany({ where: { id: { in: staleIds } } })
  }

  const existingKeys = new Set(existing.map((row) => row.imageKey))
  let embedded = 0
  let skipped = 0
  for (const { source, key } of wanted) {
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    const base64 = await resolveImageToBase64(source).catch(() => null)
    if (!base64) {
      skipped++
      continue
    }
    const vector = await generateImageEmbedding(base64)
    const row = await prisma.productImageEmbedding.upsert({
      where: { productId_imageKey: { productId, imageKey: key } },
      create: { productId, imageKey: key },
      update: {},
      select: { id: true },
    })
    await prisma.$executeRawUnsafe(
      `UPDATE "ProductImageEmbedding" SET embedding = $1::vector WHERE id = $2`,
      `[${vector.join(',')}]`,
      row.id
    )
    embedded++
  }

  return { ok: true, embedded, skipped, removed: staleIds.length, total: wanted.length }
}

/** Best-effort variant for request handlers: never throws, logs on failure. */
export async function updateProductImageEmbeddingsSafe(productId) {
  try {
    return await updateProductImageEmbeddings(productId)
  } catch (err) {
    console.error('[image-embedding] update failed for', productId, '-', err?.message || err)
    return { ok: false, reason: 'error' }
  }
}

/**
 * Rank active products by their best photo's cosine similarity to the query
 * image vector. Returns [{ productId, similarity }] ordered by similarity desc.
 *
 * NOTE: vector literal injected via $queryRawUnsafe for the same reason as
 * vector-search.js — Prisma's parameter quoting blocks `::vector` casting.
 * Safe: the values are floats only, no user-controlled text.
 */
export async function imageVectorSearchProductIds(
  queryVector,
  { limit = 24, threshold = IMAGE_VECTOR_SIMILARITY_THRESHOLD } = {}
) {
  const vecStr = `[${queryVector.join(',')}]`
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        e."productId",
        MAX(1 - (e.embedding <=> '${vecStr}'::vector))::float AS similarity
      FROM "ProductImageEmbedding" e
      JOIN "Product" p ON p.id = e."productId"
      WHERE p.active = true
        AND e.embedding IS NOT NULL
      GROUP BY e."productId"
      HAVING MAX(1 - (e.embedding <=> '${vecStr}'::vector)) >= $1
      ORDER BY similarity DESC
      LIMIT $2
    `,
    threshold,
    limit
  )
  return rows.map((r) => ({ productId: r.productId, similarity: Number(r.similarity) }))
}
