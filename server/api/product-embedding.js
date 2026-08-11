/**
 * Product embedding generation (pgvector). Single source of truth used by both
 * the seed script and the admin create/update flow so every product — including
 * ones added or edited through the portal — gets a vector and is searchable by
 * image.
 *
 * Strategy: pass the product's first image through GPT-4o vision to get a
 * free-form classification, render it with the SAME text format that
 * visual-search.js buildSearchText() uses for queries, fuse it with
 * authoritative catalog fields, then embed with text-embedding-3-small.
 *
 * OpenAI-only by design (no Hugging Face fallback). callOpenAIVisionWithImages
 * already resolves base64 data-URIs, http(s) URLs, and local /public paths, so
 * admin-uploaded data-URI images get real vision-based vectors too.
 */
import { prisma } from './db.js'
import { callOpenAIVisionWithImages } from './product-ai.js'

const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536 dims

const EMBED_VISION_PROMPT = `You are a jewellery visual classifier. Describe this jewellery image for semantic search.
Return only valid JSON with no markdown and no explanation.
Schema: {
  "category": "Rings"|"Earrings"|"Necklaces"|"Bracelets"|"Mangal Sutra"|null,
  "subtype": string|null,
  "materials": ("gold"|"silver")[],
  "styleTags": ("bridal"|"classic"|"minimal"|"modern"|"traditional"|"statement"|"everyday"|"stackable")[],
  "stoneTags": ("diamond"|"kundan"|"polki"|"pearl"|"emerald"|"ruby"|"black-beads"|"stone")[],
  "prominentStone": "diamond"|"kundan"|"polki"|"pearl"|"emerald"|"ruby"|"black-beads"|"stone"|null,
  "notes": string
}
Rules: Use "Mangal Sutra" only if small round black beads are clearly visible on the chain or near the pendant. Personalized letters, initials, nameplates, or plain gold chains without black beads are Necklaces or Bracelets — never Mangal Sutra without black beads.
prominentStone is the single visually dominant gem (the main center or largest focal stone), or null if the piece is plain metal or has no clear dominant stone.
Earrings: clear silicone or plastic clutch/butterfly backs are not pearls. J-hoop or curved wire designs extending below the lobe are subtype closer to drop than stud.`

const STONE_VALUES = new Set(['diamond', 'kundan', 'polki', 'pearl', 'emerald', 'ruby', 'black-beads', 'stone'])

function normalizeProminentStone(value) {
  const s = String(value || '').toLowerCase().trim()
  return STONE_VALUES.has(s) ? s : null
}

/**
 * Render vision JSON to text in the EXACT format visual-search.js buildSearchText()
 * uses for query vectors, so catalog and query embeddings stay in one space.
 */
export function visionToSearchText(v) {
  if (!v || typeof v !== 'object') return ''
  const prominent = normalizeProminentStone(v.prominentStone)
  const parts = [
    v.category,
    v.subtype ? String(v.subtype).replace(/-/g, ' ') : null,
    Array.isArray(v.materials) ? v.materials.join(' ') : null,
    prominent ? `Prominent stone: ${prominent}` : null,
    v.notes,
    Array.isArray(v.styleTags) && v.styleTags.length ? `Style: ${v.styleTags.join(', ')}` : null,
    Array.isArray(v.stoneTags) && v.stoneTags.length ? `Stones: ${v.stoneTags.join(', ')}` : null,
  ]
  return parts.filter(Boolean).join('. ')
}

/**
 * Fuse authoritative catalog fields with the vision/appearance block. Vision
 * often mislabels (e.g. Mangal Sutra as "Necklaces"); DB category/tags/title
 * keep the vector aligned with how queries look after normalization.
 */
export function buildCatalogEmbedText(product, visualOrTextBlock) {
  const attrs = product.productAttributes || {}
  const productAttributesText = [
    attrs.grossWeight ? `Gross weight: ${attrs.grossWeight}` : null,
    attrs.diamondCarats ? `Diamond carats: ${attrs.diamondCarats}` : null,
    attrs.diamondQuantity ? `Diamond quantity: ${attrs.diamondQuantity}` : null,
  ]
    .filter(Boolean)
    .join('. ')

  const c = product.customizationOptions || {}
  const customizationText = [
    Array.isArray(c.diamondQualities) && c.diamondQualities.length ? `Diamond qualities: ${c.diamondQualities.join(', ')}` : null,
    Array.isArray(c.metalPurities) && c.metalPurities.length ? `Metal purities: ${c.metalPurities.join(', ')}` : null,
    Array.isArray(c.centerShapes) && c.centerShapes.length ? `Center shapes: ${c.centerShapes.join(', ')}` : null,
    Array.isArray(c.centerStoneSizes) && c.centerStoneSizes.length ? `Center stone sizes: ${c.centerStoneSizes.join(', ')}` : null,
    Array.isArray(c.ringSizes) && c.ringSizes.length ? `Ring sizes: ${c.ringSizes.join(', ')}` : null,
    Array.isArray(c.bangleSizes) && c.bangleSizes.length ? `Bangle sizes: ${c.bangleSizes.join(', ')}` : null,
    Array.isArray(c.necklaceSizes) && c.necklaceSizes.length ? `Necklace sizes: ${c.necklaceSizes.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('. ')

  const meta = [
    product.title,
    product.category,
    product.subtype ? String(product.subtype).replace(/-/g, ' ') : null,
    product.material,
    product.color ? `${product.color} finish` : null,
    product.description ? `Manual description: ${product.description}` : null,
    product.aiDescription ? `AI description: ${product.aiDescription}` : null,
    productAttributesText || null,
    Array.isArray(product.styleTags) && product.styleTags.length ? `Catalog style: ${product.styleTags.join(', ')}` : null,
    Array.isArray(product.stoneTags) && product.stoneTags.length ? `Catalog stones: ${product.stoneTags.join(', ')}` : null,
    customizationText || null,
    'Appearance and details:',
    visualOrTextBlock,
  ]
  return meta.filter(Boolean).join('. ')
}

async function describeProductImage(imageUrl) {
  let raw
  try {
    raw = await callOpenAIVisionWithImages({
      images: [imageUrl],
      systemPrompt: EMBED_VISION_PROMPT,
      userPrompt: 'Describe this jewellery for semantic search.',
      maxTokens: 300,
      responseFormat: { type: 'json_object' },
    })
  } catch {
    return null
  }
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function generateEmbedding(text) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY not set — cannot generate embedding')

  const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  })
  if (!res.ok) {
    throw new Error(`OpenAI embeddings error ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  const vector = data?.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length !== 1536) {
    throw new Error(`Unexpected embedding shape: ${vector?.length} dims`)
  }
  return vector
}

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  title: true,
  category: true,
  subtype: true,
  material: true,
  color: true,
  description: true,
  aiDescription: true,
  productAttributes: true,
  styleTags: true,
  stoneTags: true,
  customizationOptions: true,
  images: { where: { active: true }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
}

/**
 * Build the embed text for a product record (must include the PRODUCT_SELECT shape).
 * Returns { text, source } where source is 'vision' or 'fallback'.
 */
export async function buildEmbedTextForProduct(product, opts = {}) {
  // opts.imageUrl lets callers supply an image (e.g. from S3 by slug) when the
  // product has no DB image, so S3-only products still get a vision-based vector.
  const firstImage = product.images?.[0]?.url || opts.imageUrl || null
  let visionBlock = ''
  let source = 'fallback'
  if (firstImage) {
    const vision = await describeProductImage(firstImage)
    if (vision) {
      visionBlock = visionToSearchText(vision)
      if (visionBlock) source = 'vision'
    }
  }
  if (!visionBlock) {
    visionBlock = String(product.description || product.aiDescription || product.title || '').slice(0, 400)
  }
  return { text: buildCatalogEmbedText(product, visionBlock), source }
}

/**
 * Generate and persist the embedding for one product id. Throws on failure
 * (callers in request handlers should wrap in try/catch — see updateProductEmbeddingSafe).
 */
export async function updateProductEmbedding(productId, opts = {}) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: PRODUCT_SELECT })
  if (!product) return { ok: false, reason: 'not-found' }
  const { text, source } = await buildEmbedTextForProduct(product, opts)
  const vector = await generateEmbedding(text)
  await prisma.$executeRawUnsafe(`UPDATE "Product" SET embedding = $1::vector WHERE id = $2`, `[${vector.join(',')}]`, productId)
  return { ok: true, source }
}

/** Best-effort variant for request handlers: never throws, logs on failure. */
export async function updateProductEmbeddingSafe(productId, opts = {}) {
  try {
    return await updateProductEmbedding(productId, opts)
  } catch (err) {
    console.error('[product-embedding] update failed for', productId, '-', err?.message || err)
    return { ok: false, reason: 'error' }
  }
}
