/**
 * Shared semantic (vector) search helpers backed by pgvector.
 *
 * Catalog products carry a 1536-dim `embedding` column (see product-embedding.js).
 * Both the visual-search image flow and the text chat flow turn a query into an
 * embedding in the SAME semantic space and rank catalog rows by cosine similarity.
 */
import { prisma } from './db.js'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const VECTOR_SIMILARITY_THRESHOLD = Number(process.env.VECTOR_SIMILARITY_THRESHOLD) || 0.7
export const VECTOR_RELAXED_THRESHOLD = Number(process.env.VECTOR_RELAXED_THRESHOLD) || 0.58

/**
 * Convert query text to a 1536-dim embedding via OpenAI.
 * Throws on failure so callers can fall back to keyword search.
 */
export async function generateQueryEmbedding(text) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY not set — cannot generate query embedding')

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
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('OpenAI returned an empty embedding vector')
  }
  return vector
}

/**
 * Rank active catalog products by cosine similarity to `queryVector`.
 * Returns [{ slug, similarity }] ordered by similarity desc.
 *
 * NOTE: the vector literal is injected via $queryRawUnsafe because Prisma's
 * parameterized queries quote strings in a way that blocks `::vector` casting.
 * It is safe: the values are floats only — no user-controlled text.
 */
export async function vectorSearchSlugs(
  queryVector,
  { limit = 60, threshold = VECTOR_SIMILARITY_THRESHOLD } = {}
) {
  const vecStr = `[${queryVector.join(',')}]`
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        p.slug,
        (1 - (p.embedding <=> '${vecStr}'::vector))::float AS similarity
      FROM "Product" p
      WHERE p.active = true
        AND p.embedding IS NOT NULL
        AND (1 - (p.embedding <=> '${vecStr}'::vector)) >= $1
      ORDER BY similarity DESC
      LIMIT $2
    `,
    threshold,
    limit
  )
  return rows.map((r) => ({ slug: r.slug, similarity: Number(r.similarity) }))
}
