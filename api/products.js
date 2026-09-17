import { getCatalogProducts } from '../server/api/products-source.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'
import { serveResizedImage } from '../server/api/img-proxy.js'

export default async function handler(req, res) {
  // /api/img is rewritten here with __img=1 (see vercel.json) because the Hobby
  // plan caps a deployment at 12 serverless functions. The resizer handles its
  // own CORS, methods and caching, so dispatch before anything else.
  if (req.query?.__img) return serveResizedImage(req, res)

  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const products = await getCatalogProducts()
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).json({ products })
}
