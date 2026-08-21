import { getCatalogProducts } from '../server/api/products-source.js'

// Serves both /robots.txt and /sitemap.xml (rewritten here via vercel.json with
// ?type=robots|sitemap) from one function to stay under the serverless function
// quota. SITE_URL overrides the host header once a custom domain exists.

// Keep in sync with COLLECTION_LINKS in src/data/collections.ts.
const COLLECTION_SLUGS = ['rings', 'earrings', 'pendants', 'bracelets', 'necklaces']

const STATIC_PATHS = ['/', '/collections', '/about', '/services']
const SITE_URL = 'https://www.kianajewels.com'

// Crawlable pages that shouldn't be indexed: account, transactional and
// internal-tooling routes. Mirrored by the noindex meta set in src/router.
const DISALLOWED_PATHS = [
  '/internal',
  '/cart',
  '/checkout',
  '/order-confirmation',
  '/memo-confirmation',
  '/orders',
  '/memos',
  '/wishlist',
  '/account',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/chat',
  '/search',
]

function resolveBaseUrl(req) {
  const configured = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '')
  if (configured) return configured
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()
  if (host && !host.endsWith('.vercel.app') && !host.startsWith('localhost')) return `https://${host}`
  return SITE_URL
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ))
}

async function buildSitemap(baseUrl) {
  let products = []
  try {
    products = await getCatalogProducts()
  } catch {
    products = []
  }

  const paths = [
    ...STATIC_PATHS,
    ...COLLECTION_SLUGS.map((slug) => `/collections/${slug}`),
    ...(Array.isArray(products) ? products : [])
      .map((p) => (p && p.slug ? `/product/${p.slug}` : ''))
      .filter(Boolean),
  ]

  const urls = [...new Set(paths)]
    .map((path) => `  <url><loc>${escapeXml(`${baseUrl}${path}`)}</loc></url>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function buildRobots(baseUrl) {
  const disallows = DISALLOWED_PATHS.map((path) => `Disallow: ${path}`).join('\n')
  return `User-agent: *\n${disallows}\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const baseUrl = resolveBaseUrl(req)
  const type = String(req.query?.type || '')

  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400')

  if (type === 'robots') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(buildRobots(baseUrl))
  }

  if (type === 'sitemap') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    return res.status(200).send(await buildSitemap(baseUrl))
  }

  return res.status(404).json({ message: 'Not found' })
}
