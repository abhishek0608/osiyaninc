import { API_BASE } from '../config-api'

// Product photos are stored in S3 at camera resolution. Route them through
// /api/img so the browser gets a WebP resized to roughly what it will display,
// served from Vercel's edge cache instead of the bucket's home region. Anything
// that is not an S3 product image (local files, data: URLs, legacy base64 rows)
// is returned untouched.
const S3_IMAGE = /^https:\/\/[a-z0-9.-]+\.s3[.-][a-z0-9.-]*amazonaws\.com\//i

export function productImageUrl(url: string | null | undefined, width: number): string {
  const src = String(url || '')
  if (!src || !S3_IMAGE.test(src)) return src
  return `${API_BASE}/api/img?w=${Math.round(width)}&src=${encodeURIComponent(src)}`
}
