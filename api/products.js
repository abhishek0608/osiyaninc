import { getCatalogProducts } from '../server/api/products-source.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'

export default async function handler(req, res) {
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
