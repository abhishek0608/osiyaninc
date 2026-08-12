import {
  S3Client,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { folderMatchesSlug, isImageFilename } from './s3-images.js'

// Write side of the S3 product-image store. s3-images.js only LISTS the
// externally-managed folders; this module lets the internal admin create and
// remove individual objects, which makes S3 the single source of truth for
// product photos (the database no longer holds uploaded image bytes).
//
// Bucket layout is the one s3-images.js already reads:
//   <BASE_PREFIX>/<folder>/<slug>_<n>.<ext>
// where <folder> is the Product.slug, optionally uppercased and/or carrying an
// "_<size>" suffix. S3 has no real directories — a folder springs into existence
// with its first object and disappears with its last — so creating the folder
// for a new product is simply the first upload landing under that prefix.

const REGION = process.env.AWS_REGION || 'us-east-1'
const BUCKET = process.env.AWS_S3_BUCKET || ''
const BASE_PREFIX = (process.env.AWS_S3_BASE_PREFIX || 'Osiyan-product-images').replace(/\/+$/, '')

const IMAGE_EXTENSIONS = /\.(webp|jpe?g|png|avif|gif)$/i

// Content types we accept, mapped to the extension we store.
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
  if (!isProductImageWriteConfigured()) {
    throw new Error(
      'S3 not configured: set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY',
    )
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

export function isProductImageWriteConfigured() {
  return Boolean(BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
}

function publicUrlForKey(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURI(key)}`
}

// Pick the folder new uploads for `slug` should land in. An existing folder wins
// (it may be uppercased or carry a size suffix, e.g. slug "pd0448" -> "PD0448_8")
// so we never split one product's photos across two prefixes. When no folder
// exists yet — a brand-new product — the slug itself becomes the folder name,
// and the first upload brings it into being.
async function resolveUploadFolder(client, slug) {
  const prefix = `${BASE_PREFIX}/`
  let token
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        Delimiter: '/',
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    )
    for (const cp of res.CommonPrefixes || []) {
      const folder = cp.Prefix.slice(prefix.length).replace(/\/$/, '')
      if (folder && folderMatchesSlug(folder, slug)) return folder
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return slug
}

// Highest "_<n>" suffix already used in a folder, so a batch of new uploads can
// continue the sequence instead of colliding with existing photos.
async function highestImageIndex(client, folder) {
  const prefix = `${BASE_PREFIX}/${folder}/`
  let highest = 0
  let token
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    )
    for (const obj of res.Contents || []) {
      const filename = obj.Key.slice(prefix.length)
      if (!isImageFilename(filename)) continue
      const match = filename.replace(IMAGE_EXTENSIONS, '').match(/[_-](\d+)$/)
      const index = match ? Number(match[1]) : 0
      if (Number.isFinite(index) && index > highest) highest = index
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return highest
}

/**
 * Presigned PUT URLs for a batch of product images, all landing in the product's
 * S3 folder. Filenames follow the "<slug>_<n>.<ext>" convention s3-images.js
 * parses for display order, numbered on from whatever the folder already holds.
 * @param {{ slug: string, files: Array<{ contentType: string }> }} params
 * @returns {Promise<Array<{ uploadUrl, publicUrl, key, contentType }>>}
 */
export async function createPresignedProductImageUploads({ slug, files } = {}) {
  const clean = String(slug || '').trim()
  if (!clean) {
    const err = new Error('Product slug is required to upload images.')
    err.code = 'MISSING_SLUG'
    throw err
  }
  const list = Array.isArray(files) ? files : []
  if (!list.length) {
    const err = new Error('No files to upload.')
    err.code = 'NO_FILES'
    throw err
  }

  // Validate every file before signing anything, so a bad file in the batch
  // fails the whole request instead of leaving a half-uploaded gallery.
  const extensions = list.map((file) => {
    const ext = ALLOWED_TYPES[String(file?.contentType || '').toLowerCase()]
    if (!ext) {
      const err = new Error('Unsupported image type. Use JPG, PNG, WEBP, or AVIF.')
      err.code = 'UNSUPPORTED_TYPE'
      throw err
    }
    return ext
  })

  const client = getClient()
  const folder = await resolveUploadFolder(client, clean)
  let next = await highestImageIndex(client, folder)

  const uploads = []
  for (let i = 0; i < list.length; i++) {
    next += 1
    const ext = extensions[i]
    const contentType = String(list[i].contentType).toLowerCase()
    const key = `${BASE_PREFIX}/${folder}/${clean}_${next}.${ext}`
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { expiresIn: 300 },
    )
    uploads.push({ uploadUrl, publicUrl: publicUrlForKey(key), key, contentType })
  }
  return uploads
}

/**
 * Delete one image object. The key must sit inside a folder belonging to `slug`
 * — the caller supplies it from a listing, but it arrives over HTTP, so it is
 * re-checked here to keep the endpoint from deleting arbitrary bucket objects.
 * @param {{ slug: string, key: string }} params
 */
export async function deleteProductImage({ slug, key } = {}) {
  const clean = String(slug || '').trim()
  const objectKey = String(key || '').trim()
  if (!clean || !objectKey) {
    const err = new Error('Product slug and image key are required.')
    err.code = 'MISSING_KEY'
    throw err
  }
  if (!isKeyInProductFolder(objectKey, clean)) {
    const err = new Error('That image does not belong to this product.')
    err.code = 'KEY_MISMATCH'
    throw err
  }

  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey }))
}

// True when `key` is "<BASE_PREFIX>/<folder>/<file>" and <folder> belongs to
// `slug`. Rejects nested paths and traversal attempts along the way.
export function isKeyInProductFolder(key, slug) {
  const prefix = `${BASE_PREFIX}/`
  if (!key.startsWith(prefix) || key.includes('..')) return false
  const rest = key.slice(prefix.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return false
  const folder = rest.slice(0, slash)
  const filename = rest.slice(slash + 1)
  if (!filename || filename.includes('/')) return false
  // Same predicate the listers use, so every photo the workspace shows for this
  // product can also be deleted — extensionless uploads included.
  if (!isImageFilename(filename)) return false
  return folderMatchesSlug(folder, slug)
}
