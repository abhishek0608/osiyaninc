import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

// S3-backed product image source.
//
// Bucket layout (one folder per product). The folder is named after the piece's
// Style No — the code stamped on the piece and printed on the packing list
// (productAttributes.styleNo, mirrored in Product.title) — optionally followed
// by an "_<suffix>" that encodes a size/dimension:
//   <BASE_PREFIX>/<styleNo>[_<suffix>]/<file>
// e.g. Osiyan-product-images/rg0478/RG0478-pink.jpg      (style "RG0478")
//      Osiyan-product-images/RG7973_9.5X7/RG7973_1.webp  (style "RG7973", size 9.5x7)
//
// A style with a single photo need not get a folder at all: a file dropped
// straight under the base prefix whose name starts with the Style No belongs to
// that piece too, e.g.
//      Osiyan-product-images/RG0478-pink.jpg             (style "RG0478")
// Such a loose file is treated as a one-image folder named after the file (see
// looseFileFolder), so folders and loose files resolve through the same matcher
// and a piece may have both.
//
// Older folders are named after the Product.slug (the slugified bag number, or
// a hand-written slug), so the slug is still tried as a fallback key. See
// productImageKeys for the full resolution order.
//
// Within a folder, the filename also encodes display order — a "_thumbnail" file
// leads (it is what product cards show), followed by the rose, white and yellow
// gold shots, each group in its own numeric order. See parseImageFilename.
//
// Images are served publicly (bucket policy grants anonymous s3:GetObject),
// so we only need credentials to LIST a folder, not to read the files.

// The bucket's region, from a dedicated variable. Never read AWS_REGION here:
// Vercel's Lambda runtime sets it to the *function's* region (ap-south-1 for
// Mumbai), and an S3 client pointed at the wrong region gets a PermanentRedirect
// ("must be addressed using the specified endpoint") instead of a listing.
const REGION = process.env.AWS_S3_REGION || 'us-east-1'
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

// A folder (or loose file, see looseFileFolder) belongs to `key` when its name
// equals the key or starts with the key followed by a separator: "_" for a
// size/dimension suffix (style "RG7973" -> folder "RG7973_9.5X7"), "-" or a
// space for the photo pipeline's shot markers ("RG0478-pink", "RG0478 R (1)").
// Matching is case-insensitive: keys are compared lowercased but S3 names are
// usually uppercased. The separator guard stops sibling style "rg0478"
// matching "rg04780".
const KEY_SEPARATOR = /^[_\-\s]/
export function folderMatchesKey(folder, key) {
  const f = String(folder).toLowerCase()
  const k = String(key || '').trim().toLowerCase()
  if (!k) return false
  return f === k || (f.startsWith(k) && KEY_SEPARATOR.test(f.slice(k.length)))
}

/**
 * The folder name a loose file stands in for: its filename without the image
 * extension, so "RG0478-pink.jpg" behaves like a folder "RG0478-pink" holding
 * one photo. Extensionless names are used as they are.
 * @param {string} filename - object name directly under the base prefix.
 */
export function looseFileFolder(filename) {
  return String(filename || '').replace(IMAGE_EXTENSIONS, '')
}

// Backwards-compatible name: a slug is just one of the keys a product can be
// filed under.
export const folderMatchesSlug = folderMatchesKey

/**
 * Ordered, de-duplicated list of folder names a product's photos may be filed
 * under. The photo pipeline names folders after the Style No, so that leads:
 *   1. the Style No exactly as recorded ("RG7973_9.5X7"),
 *   2. the Style No without its size suffix ("RG7973"), so a folder that was
 *      created for the bare style still serves every size of it,
 *   3. the slug, for folders created before style-number naming (dummy seeds,
 *      hand-made products) and for anything imported without a Style No.
 * Accepts either a product-shaped object ({ slug, title, productAttributes })
 * or a bare string, which is treated as a slug.
 *
 * @param {string|{ slug?: string, title?: string, productAttributes?: { styleNo?: string }|null }} product
 * @returns {string[]} keys, original casing preserved, lowercase-unique.
 */
export function productImageKeys(product) {
  const keys = []
  const seen = new Set()
  const push = (value) => {
    const clean = String(value || '').trim()
    if (!clean) return
    const lower = clean.toLowerCase()
    if (seen.has(lower)) return
    seen.add(lower)
    keys.push(clean)
  }
  if (typeof product === 'string') {
    push(product)
    return keys
  }
  if (!product || typeof product !== 'object') return keys

  const styleNo = String(product.productAttributes?.styleNo || '').trim() || String(product.title || '').trim()
  push(styleNo)
  // "RG7973_9.5X7" -> "RG7973". A title like "Amrita Halo Ring" has no "_" and
  // is left alone.
  const underscore = styleNo.indexOf('_')
  if (underscore > 0) push(styleNo.slice(0, underscore))
  push(product.slug)
  return keys
}

/**
 * True when an S3 folder holds photos for `product` under any of its keys.
 * @param {string} folder - folder name under the base prefix.
 * @param {string|object} product - see productImageKeys.
 */
export function folderMatchesProduct(folder, product) {
  return productImageKeys(product).some((key) => folderMatchesKey(folder, key))
}

// Enumerate the actual (case-preserved) folder names under the base prefix that
// belong to any of `keys`, plus the loose files there that do. S3 prefixes are
// case-sensitive, so we can't narrow the listing by a lowercase key; instead we
// list the base level (one CommonPrefix per folder plus the loose files, so
// this is cheap) and match names case-insensitively.
// The bucket's top-level folder names. Every per-product lookup starts by
// listing these (paginated, ~250ms a page from Mumbai to us-east-1), and they
// only change when a product folder is created or emptied, so keep them for a
// short while per warm instance and let the upload/delete paths invalidate.
const FOLDER_CACHE_TTL_MS = 2 * 60 * 1000
// Holds both the folder names and the loose single-photo files that sit
// directly under the base prefix, since one Delimiter listing returns both.
let folderCache = { names: null, looseFiles: null, expiresAt: 0 }
let folderFetch = null

export function invalidateProductFolderCache() {
  folderCache = { names: null, looseFiles: null, expiresAt: 0 }
}

async function listTopLevelFolders(client) {
  if (folderCache.names && folderCache.expiresAt > Date.now()) return folderCache
  if (!folderFetch) {
    folderFetch = (async () => {
      const prefix = `${BASE_PREFIX}/`
      const names = []
      // Files sitting directly under the base prefix: a piece with a single
      // photo need not have a folder at all.
      const looseFiles = []
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
          if (folder) names.push(folder)
        }
        for (const obj of res.Contents || []) {
          const filename = obj.Key.slice(prefix.length)
          if (!filename || !isImageFilename(filename)) continue
          looseFiles.push({ key: obj.Key, filename, size: obj.Size })
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined
      } while (token)
      folderCache = { names, looseFiles, expiresAt: Date.now() + FOLDER_CACHE_TTL_MS }
      return folderCache
    })().finally(() => {
      folderFetch = null
    })
  }
  return folderFetch
}

// Folders and loose single-photo files belonging to any of `keys`. A loose file
// matches on its own name minus the extension, so it is treated exactly as a
// one-image folder of that name.
async function resolveProductFolders(client, keys) {
  const { names, looseFiles } = await listTopLevelFolders(client)
  return {
    folders: names.filter((folder) => keys.some((key) => folderMatchesKey(folder, key))),
    looseFiles: looseFiles.filter((file) =>
      keys.some((key) => folderMatchesKey(looseFileFolder(file.filename), key)),
    ),
  }
}

/**
 * List all images for a product, resolving its S3 folder by Style No (with the
 * slug as a fallback — see productImageKeys). The folder may be uppercased
 * and/or carry a size suffix (style "RG7973" -> "RG7973_9.5X7").
 * @param {string|{ slug?: string, title?: string, productAttributes?: object|null }} product
 * @returns {Promise<Array<{ url, key, sku, sortOrder, size }>>} ordered images.
 */
export async function listProductImages(product) {
  const keys = productImageKeys(product)
  if (!keys.length) return []

  const client = getClient()
  const { folders, looseFiles } = await resolveProductFolders(client, keys)
  if (!folders.length && !looseFiles.length) return []

  // Gather objects from every matching folder (normally just one), each listed
  // with its exact, case-correct prefix, plus any loose single-photo files.
  const collected = []
  for (const loose of looseFiles) {
    const { sku, order, group, rank } = parseImageFilename(loose.filename)
    collected.push({
      url: publicUrlForKey(loose.key),
      key: loose.key,
      sku,
      order,
      group,
      rank,
      size: loose.size,
    })
  }
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
 * Slug-only lookup, kept for scripts that predate style-number folders. Prefer
 * listProductImages with the product row so the Style No is tried first.
 * @param {string} slug
 */
export async function listProductImagesBySlug(slug) {
  return listProductImages({ slug })
}

/**
 * Sweep the entire base prefix once and return a map of folder -> ordered image URLs.
 * Folder names are Style Nos (or legacy slugs); match them to products with
 * folderMatchesProduct. Uses a handful of paginated ListObjectsV2 calls total
 * (1000 keys each), independent of how many product folders exist. Intended to
 * be called from the cached catalog build, not per-request.
 * @returns {Promise<Map<string, string[]>>}
 */
export async function listAllProductImagesByFolder() {
  const client = getClient()
  const prefix = `${BASE_PREFIX}/`

  // folder -> array of { url, order, key }
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
      const rest = obj.Key.slice(prefix.length) // "<folder>/<file>", or "<file>"
      const slash = rest.indexOf('/')
      if (slash === 0) continue
      // A base-level image is a single-photo piece filed without a folder; it is
      // indexed under its own name so folderMatchesProduct can find it exactly
      // as it finds a folder.
      const filename = slash < 0 ? rest : rest.slice(slash + 1)
      if (!isImageFilename(filename)) continue
      const slug = slash < 0 ? looseFileFolder(rest) : rest.slice(0, slash)
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

// Backwards-compatible name from when every folder was a slug.
export const listAllProductImagesBySlug = listAllProductImagesByFolder

/**
 * List every product folder under the base prefix.
 * @returns {Promise<string[]>} folder names (Style Nos, or legacy slugs).
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
