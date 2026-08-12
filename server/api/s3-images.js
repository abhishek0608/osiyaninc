import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

// S3-backed product image source.
//
// Bucket layout (one folder per product). The folder name is the Product.slug,
// optionally followed by an "_<suffix>" that encodes a size/dimension:
//   <BASE_PREFIX>/<slug>[_<suffix>]/<SKU>_<n>.<ext>
// e.g. Kiana-product-images/ruby-ring/500067FYAAA12_1.webp
//      Kiana-product-images/pd0448_6/pd0448_1.webp      (slug "pd0448", size 6)
//      Kiana-product-images/pd0448_6*7/pd0448_1.webp    (slug "pd0448", size 6*7)
// Slugs never contain "_", so the first "_" cleanly separates slug from suffix.
//
// Within a folder, the filename also encodes display order — a "_thumbnail" file
// leads (it is what product cards show), followed by the rose, white and yellow
// gold shots, each group in its own numeric order. See parseImageFilename.
//
// Images are served publicly (bucket policy grants anonymous s3:GetObject),
// so we only need credentials to LIST a folder, not to read the files.

const REGION = process.env.AWS_REGION || 'us-east-1'
const BUCKET = process.env.AWS_S3_BUCKET || ''
// Top-level prefix that contains the per-slug folders. Trailing slash optional.
const BASE_PREFIX = (process.env.AWS_S3_BASE_PREFIX || 'Osiyan-product-images').replace(/\/+$/, '')

const IMAGE_EXTENSIONS = /\.(webp|jpe?g|png|avif|gif)$/i
// A trailing ".<letters>" is a file extension. Deliberately letters-only: a name
// can end in a size fragment ("PD0220_9X7.5") that is not an extension.
const FILE_EXTENSION = /\.[a-z0-9]*[a-z][a-z0-9]*$/i

/**
 * True when an object name in a product folder should be treated as a photo.
 *
 * Not every image in the bucket carries an extension — some bulk uploads land as
 * bare "<slug>_<n>_<marker>" names, with the type only in the object's
 * Content-Type — and a listing can't see Content-Type without a HeadObject per
 * key. So anything with no extension is taken as an image, and the extension is
 * used only to *exclude*: the junk that shares these folders (Thumbs.db, stray
 * .psd exports, sidecars) always has one. Dotfiles like .DS_Store are named
 * "extension only" and are excluded outright.
 *
 * @param {string} filename - object name within the product folder.
 */
export function isImageFilename(filename) {
  const name = String(filename || '')
  if (!name || name.endsWith('/') || name.startsWith('.')) return false
  if (IMAGE_EXTENSIONS.test(name)) return true
  return !FILE_EXTENSION.test(name)
}

let cachedClient = null

function getClient() {
  if (cachedClient) return cachedClient
  if (!BUCKET || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
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

export function isS3Configured() {
  return Boolean(BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
}

// Public URL for an object key. Keys may contain spaces or other chars, so
// encode each path segment individually (encodeURI keeps the slashes).
function publicUrlForKey(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURI(key)}`
}

// Gallery order is encoded in the filename by the photo pipeline: a "_thumbnail"
// file is the product card's image, and every other shot carries a standalone
// R / W / Y letter for rose, white and yellow gold. The client wants them shown
// thumbnail first, then all rose, then white, then yellow.
const COLOR_BY_LETTER = { r: 'rose', w: 'white', y: 'yellow' }
const GROUP_RANK = { thumbnail: 0, rose: 1, white: 2, yellow: 3 }
// Files that encode neither a thumbnail marker nor a colour — ad-hoc uploads,
// screenshots, stray exports. They sort *after* every coded image so a file that
// misses the convention can never take over a product card.
const UNCODED_RANK = 4

/**
 * Display metadata encoded in an image filename.
 *
 * Both naming families in the bucket are supported — "snapshot R (1).webp" and
 * "ER7867-1-R.jpg" — along with the variants that exist in real folders:
 * lowercase letters ("...-3-r.jpg"), a missing separator ("...-3W.jpg"), a
 * doubled space ("snapshot  R (1).png") and the letter inside the parens
 * ("snapshot (3 R).png").
 *
 * @param {string} filename - object name within the product folder.
 * @returns {{ sku: string|null, order: number|null, group: string|null, rank: number }}
 */
export function parseImageFilename(filename) {
  const base = filename.replace(IMAGE_EXTENSIONS, '')
  const tokens = base.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

  // The marker is a suffix, so scan from the end: a leading token could hold a
  // stray single letter that has nothing to do with metal colour.
  let group = null
  let groupAt = -1
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    if (token === 'thumbnail' || token === 'thumb') {
      group = 'thumbnail'
      groupAt = i
      break
    }
    // "r" on its own, or fused to its shot number as in "3w".
    const letter = token.length === 1 ? token : token.match(/^\d+([rwy])$/)?.[1]
    if (letter && COLOR_BY_LETTER[letter]) {
      group = COLOR_BY_LETTER[letter]
      groupAt = i
      break
    }
  }

  // Shot number within the group: a parenthesised counter wins, else the number
  // just before the marker ("ER7867-2-R"), else the last number in the name.
  let order = null
  const parenthesised = base.match(/\((\d+)\)/)
  if (parenthesised) order = Number(parenthesised[1])
  if (order == null && groupAt >= 0) {
    const fused = tokens[groupAt].match(/^(\d+)[rwy]$/)
    if (fused) order = Number(fused[1])
    else {
      for (let i = groupAt - 1; i >= 0; i--) {
        if (/^\d+$/.test(tokens[i])) {
          order = Number(tokens[i])
          break
        }
      }
    }
  }
  if (order == null) {
    const numbers = base.match(/\d+/g)
    if (numbers?.length) order = Number(numbers[numbers.length - 1])
  }

  // Legacy "<SKU>_<n>" naming still drives the alt text the workspace shows.
  const skuMatch = base.match(/^(.*?)[_-](\d+)$/)
  const sku = skuMatch ? skuMatch[1] || null : base || null

  return { sku, order, group, rank: group ? GROUP_RANK[group] : UNCODED_RANK }
}

/**
 * True when a URL or object key points at the "_thumbnail" file the photo
 * pipeline marks as the product card image.
 * @param {string} urlOrKey
 */
export function isThumbnailImage(urlOrKey) {
  const filename = decodeURIComponent(String(urlOrKey || '').split('/').pop() || '')
  return parseImageFilename(filename).group === 'thumbnail'
}

/**
 * Sort comparator for parsed images: group first (thumbnail, rose, white,
 * yellow, then uncoded), shot number within the group, and the object key as a
 * final tiebreak so the order is stable across listings.
 */
export function compareProductImages(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank
  if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order
  if (a.order != null && b.order == null) return -1
  if (a.order == null && b.order != null) return 1
  return a.key.localeCompare(b.key)
}

// A folder belongs to `slug` when its name equals the slug (older uploads) or
// starts with "slug_" — the "_" separates the slug from a size/dimension
// suffix, e.g. slug "pd0448" -> folder "PD0448_8" or "PD0220_9X7". Matching is
// case-insensitive: DB slugs are lowercase but S3 folders are usually
// uppercased. The "_" guard stops sibling slug "pd0448" matching "pd04480".
export function folderMatchesSlug(folder, slug) {
  const f = String(folder).toLowerCase()
  const s = String(slug).toLowerCase()
  return f === s || f.startsWith(`${s}_`)
}

// Enumerate the actual (case-preserved) folder names under the base prefix that
// belong to `slug`. S3 prefixes are case-sensitive, so we can't narrow the
// listing by the lowercase slug; instead we list folder names (one per product
// via Delimiter, so this is cheap) and match them case-insensitively.
async function resolveProductFolders(client, slug) {
  const prefix = `${BASE_PREFIX}/`
  const folders = []
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
      if (folder && folderMatchesSlug(folder, slug)) folders.push(folder)
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return folders
}

/**
 * List all images for a product, resolving the S3 folder by slug. The folder
 * may be uppercased and/or carry a size suffix (slug "pd0448" -> "PD0448_8").
 * @param {string} slug - product slug.
 * @returns {Promise<Array<{ url, key, sku, sortOrder, size }>>} ordered images.
 */
export async function listProductImagesBySlug(slug) {
  const clean = String(slug || '').trim()
  if (!clean) return []

  const client = getClient()
  const folders = await resolveProductFolders(client, clean)
  if (!folders.length) return []

  // Gather objects from every matching folder (normally just one), each listed
  // with its exact, case-correct prefix.
  const collected = []
  for (const folder of folders) {
    const prefix = `${BASE_PREFIX}/${folder}/`
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
        // Skip "folder marker" keys and non-image junk like .DS_Store.
        if (!isImageFilename(filename)) continue
        const { sku, order, group, rank } = parseImageFilename(filename)
        collected.push({
          url: publicUrlForKey(obj.Key),
          key: obj.Key,
          sku,
          order,
          group,
          rank,
          size: obj.Size,
        })
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
  }

  collected.sort(compareProductImages)

  return collected.map((img, index) => ({
    url: img.url,
    key: img.key,
    sku: img.sku,
    group: img.group,
    sortOrder: index,
    size: img.size,
  }))
}

/**
 * Sweep the entire base prefix once and return a map of slug -> ordered image URLs.
 * Uses a handful of paginated ListObjectsV2 calls total (1000 keys each),
 * independent of how many product folders exist. Intended to be called from the
 * cached catalog build, not per-request.
 * @returns {Promise<Map<string, string[]>>}
 */
export async function listAllProductImagesBySlug() {
  const client = getClient()
  const prefix = `${BASE_PREFIX}/`

  // slug -> array of { url, order, key }
  const bySlug = new Map()
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
      const rest = obj.Key.slice(prefix.length) // "<slug>/<file>"
      const slash = rest.indexOf('/')
      if (slash <= 0) continue // skip base-level files like .DS_Store
      const slug = rest.slice(0, slash)
      const filename = rest.slice(slash + 1)
      if (!isImageFilename(filename)) continue
      const { order, rank } = parseImageFilename(filename)
      if (!bySlug.has(slug)) bySlug.set(slug, [])
      bySlug.get(slug).push({ url: publicUrlForKey(obj.Key), order, rank, key: obj.Key })
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  const out = new Map()
  for (const [slug, imgs] of bySlug) {
    imgs.sort(compareProductImages)
    out.set(slug, imgs.map((i) => i.url))
  }
  return out
}

/**
 * List every product folder under the base prefix.
 * @returns {Promise<string[]>} slugs (folder names).
 */
export async function listProductFolders() {
  const client = getClient()
  const prefix = `${BASE_PREFIX}/`
  const folders = []
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
      if (folder) folders.push(folder)
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return folders
}
