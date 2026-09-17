import { applyCors, handlePreflight } from './cors.js'

// Resized, edge-cached product photos.
//
// This is not a serverless function of its own: the Hobby plan caps a
// deployment at 12, so /api/img is rewritten to /api/products, which dispatches
// here on the __img flag (see vercel.json). Public URLs are unchanged.
//
// Product images live in an S3 bucket in us-east-1 and are uploaded at camera
// resolution (3000px+, ~1MB each). Customers are mostly in India, so a product
// card that renders a 300px thumbnail was pulling a megabyte across the Pacific
// for every image, every visit. This function fetches the original once, resizes
// it to the width the page actually shows, and returns WebP with a long s-maxage
// so Vercel's edge (in the same region as the visitor) serves every repeat from
// cache. Only the configured bucket is proxied — this is not an open resizer.

const BUCKET = process.env.AWS_S3_BUCKET || ''
const REGION = process.env.AWS_S3_REGION || 'us-east-1'
const ALLOWED_HOSTS = new Set(
  BUCKET ? [`${BUCKET}.s3.${REGION}.amazonaws.com`, `${BUCKET}.s3.amazonaws.com`] : [],
)
// Snap to a fixed ladder so the edge cache is not fragmented by arbitrary widths.
const WIDTHS = [160, 320, 480, 640, 960, 1280, 1600]
const DEFAULT_WIDTH = 960
const CACHE_HEADER = 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800'

function snapWidth(raw) {
  const n = Number(raw) || DEFAULT_WIDTH
  return WIDTHS.find((w) => w >= n) || WIDTHS[WIDTHS.length - 1]
}

export async function serveResizedImage(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET,HEAD,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  let source
  try {
    source = new URL(String(req.query?.src || ''))
  } catch {
    return res.status(400).json({ message: 'src must be an absolute URL.' })
  }
  if (source.protocol !== 'https:' || !ALLOWED_HOSTS.has(source.host)) {
    return res.status(400).json({ message: 'src is not a product image.' })
  }
  const width = snapWidth(req.query?.w)

  let upstream
  try {
    upstream = await fetch(source.href)
  } catch (err) {
    console.error('[img] upstream fetch failed:', err?.message || err)
    return res.redirect(302, source.href)
  }
  if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).end()
  const original = Buffer.from(await upstream.arrayBuffer())

  try {
    const { default: sharp } = await import('sharp')
    const out = await sharp(original, { animated: false })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('Content-Length', String(out.length))
    res.setHeader('Cache-Control', CACHE_HEADER)
    return res.status(200).end(out)
  } catch (err) {
    // Anything sharp cannot handle (or a missing native binary) falls back to
    // the original bytes rather than a broken image.
    console.error('[img] resize failed, serving original:', err?.message || err)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
    res.setHeader('Cache-Control', CACHE_HEADER)
    return res.status(200).end(original)
  }
}
