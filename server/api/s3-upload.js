import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Presigned-upload helper for internal-managed assets (e.g. homepage hero
// banners). Unlike s3-images.js — which only LISTS externally-managed product
// images — this lets the app write objects directly to S3 so banners no longer
// have to be base64-stuffed into the database.
//
// The bucket policy already grants public s3:GetObject on the whole bucket and
// CORS already allows browser PUT, so an uploaded object is immediately
// readable at its public URL with no extra configuration.

const REGION = process.env.AWS_REGION || 'us-east-1'
const BUCKET = process.env.AWS_S3_BUCKET || ''
// Top-level folder for homepage banner uploads. Trailing slash optional.
const HOMEPAGE_PREFIX = (process.env.AWS_S3_HOMEPAGE_PREFIX || 'osiyan-homepage-banners').replace(
  /\/+$/,
  '',
)

// Content types we accept, mapped to the file extension we store.
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

let cachedClient = null

function getClient() {
  if (cachedClient) return cachedClient
  if (!isUploadConfigured()) {
    throw new Error('S3 not configured: set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY')
  }
  cachedClient = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })
  return cachedClient
}

export function isUploadConfigured() {
  return Boolean(BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
}

// Public URL for an object key. Keys are ASCII-safe here, but encode each path
// segment defensively (encodeURI keeps the slashes) to match s3-images.js.
function publicUrlForKey(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURI(key)}`
}

// Build a short, collision-resistant object key without leaking the original
// filename. Desktop/mobile hero banners, the "Shop by Collection" tiles, and
// About-page photos each live in their own subfolder so the bucket is easy to
// browse and size-specific lifecycle rules can target each.
function buildKey({ target, ext, now, rand }) {
  const slot =
    target === 'mobile'
      ? 'mobile'
      : target === 'collection'
        ? 'collection'
        : target === 'about'
          ? 'about'
          : 'desktop'
  return `${HOMEPAGE_PREFIX}/${slot}/${now}-${rand}.${ext}`
}

// Create a presigned PUT URL the browser uploads to directly, plus the public
// URL to persist on the slide. Throws on an unsupported content type.
export async function createPresignedHomepageUpload({ contentType, target } = {}) {
  const ext = ALLOWED_TYPES[String(contentType || '').toLowerCase()]
  if (!ext) {
    const err = new Error('Unsupported image type. Use JPG, PNG, WEBP, or AVIF.')
    err.code = 'UNSUPPORTED_TYPE'
    throw err
  }

  const client = getClient()
  const now = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  const key = buildKey({ target, ext, now, rand })

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    // Long cache: keys are unique per upload, so the URL changes when the image
    // changes and stale caches are never an issue.
    CacheControl: 'public, max-age=31536000, immutable',
  })

  // 5-minute window is plenty for an interactive upload.
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })

  return { uploadUrl, publicUrl: publicUrlForKey(key), key }
}

// ---------------------------------------------------------------------------
// Service-booking uploads (inspiration photos + CAD files)
// ---------------------------------------------------------------------------

// Top-level folder for customer service-booking uploads (reference photos and
// CAD files attached to a booking). Trailing slash optional.
const SERVICE_PREFIX = (process.env.AWS_S3_SERVICE_PREFIX || 'osiyan-service-uploads').replace(
  /\/+$/,
  '',
)

// CAD files arrive with unreliable MIME types (browsers often send
// application/octet-stream), so they are validated by file extension instead.
const SERVICE_CAD_EXTENSIONS = new Set([
  'stl',
  'stp',
  'step',
  'obj',
  'iges',
  'igs',
  '3dm',
  'dwg',
  'dxf',
  'zip',
])

// Presigned PUT for a service-booking attachment. `kind` is 'image'
// (inspiration photo, validated by content type) or 'cad' (validated by the
// extension of `fileName`). Keys never leak the original filename.
export async function createPresignedServiceUpload({ kind, contentType, fileName } = {}) {
  let ext
  if (kind === 'cad') {
    ext = String(fileName || '').split('.').pop()?.toLowerCase() || ''
    if (!SERVICE_CAD_EXTENSIONS.has(ext)) {
      const err = new Error('Unsupported CAD file. Use .stl, .step, .obj, .iges, .3dm, .dwg, .dxf, or .zip.')
      err.code = 'UNSUPPORTED_TYPE'
      throw err
    }
  } else {
    ext = ALLOWED_TYPES[String(contentType || '').toLowerCase()]
    if (!ext || ext === 'avif') {
      const err = new Error('Unsupported image type. Use JPG, PNG, or WEBP.')
      err.code = 'UNSUPPORTED_TYPE'
      throw err
    }
  }

  const client = getClient()
  const now = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `${SERVICE_PREFIX}/${kind === 'cad' ? 'cad' : 'inspiration'}/${now}-${rand}.${ext}`

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: kind === 'cad' ? 'application/octet-stream' : contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })

  return { uploadUrl, publicUrl: publicUrlForKey(key), key }
}

// ---------------------------------------------------------------------------
// Product certificates (resource=product-certificate)
// ---------------------------------------------------------------------------

// Top-level folder for lab certificates (GIA/IGI reports) attached to a piece.
// Deliberately NOT under AWS_S3_BASE_PREFIX: that prefix is swept by
// s3-images.js to build each product's gallery, so an image certificate stored
// there would surface on the storefront as a product photo.
const CERTIFICATE_PREFIX = (process.env.AWS_S3_CERTIFICATE_PREFIX || 'osiyan-certificates').replace(
  /\/+$/,
  '',
)

// Certificates arrive as the lab's PDF or as a scan/photo of it.
const CERTIFICATE_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// Presigned PUT for one product's certificate. Certificates are grouped by
// product slug so the bucket stays browsable, and the key carries a timestamp
// so replacing a certificate never collides with the cached copy of the old one.
export async function createPresignedCertificateUpload({ slug, contentType } = {}) {
  const folder = String(slug || '').trim()
  if (!folder) {
    const err = new Error('slug is required.')
    err.code = 'MISSING_SLUG'
    throw err
  }

  const ext = CERTIFICATE_TYPES[String(contentType || '').toLowerCase()]
  if (!ext) {
    const err = new Error('Unsupported certificate file. Use PDF, JPG, PNG, or WEBP.')
    err.code = 'UNSUPPORTED_TYPE'
    throw err
  }

  const client = getClient()
  const now = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `${CERTIFICATE_PREFIX}/${folder}/${now}-${rand}.${ext}`

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    // Inline so "View certificate" opens the report in the browser rather than
    // pushing a download; keys are unique per upload, so cache hard.
    ContentDisposition: 'inline',
    CacheControl: 'public, max-age=31536000, immutable',
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })

  return { uploadUrl, publicUrl: publicUrlForKey(key), key, contentType }
}

// Remove a certificate object. Scoped to the certificate prefix so a stray or
// tampered key can never delete a product photo or a homepage banner.
export async function deleteCertificateFile({ key } = {}) {
  const objectKey = String(key || '').trim()
  if (!objectKey) {
    const err = new Error('key is required.')
    err.code = 'MISSING_KEY'
    throw err
  }
  if (!objectKey.startsWith(`${CERTIFICATE_PREFIX}/`)) {
    const err = new Error('That file does not belong to the certificate store.')
    err.code = 'KEY_MISMATCH'
    throw err
  }

  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey }))
}

// Upload a banner straight from the server (no presigned round-trip). Used by
// the base64→S3 migration script to push images already held in the database.
// Returns the public URL to persist on the slide. Throws on an unsupported type.
export async function uploadHomepageImageBuffer({ buffer, contentType, target } = {}) {
  const ext = ALLOWED_TYPES[String(contentType || '').toLowerCase()]
  if (!ext) {
    const err = new Error('Unsupported image type. Use JPG, PNG, WEBP, or AVIF.')
    err.code = 'UNSUPPORTED_TYPE'
    throw err
  }

  const client = getClient()
  const now = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  const key = buildKey({ target, ext, now, rand })

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return { publicUrl: publicUrlForKey(key), key }
}
