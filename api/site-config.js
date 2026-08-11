import { applyCors, handlePreflight } from '../server/api/cors.js'
import { getSiteConfig } from '../server/api/site-config-source.js'
import { getStoneSizesInUse } from '../server/api/stone-size-source.js'

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    // The stone-size registry rides along on this already-global, cached config
    // request so the storefront can offer the set of sizes currently in use
    // without a dedicated serverless function (Hobby plan's 12-function cap).
    const [siteConfig, stoneSizes] = await Promise.all([getSiteConfig(), getStoneSizesInUse()])
    // Short cache so branding edits appear within a few seconds, with a brief
    // stale-while-revalidate window to keep the endpoint fast under load.
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10, stale-while-revalidate=30')
    return res.status(200).json({ siteConfig, stoneSizes })
  } catch (error) {
    console.error('[site-config] failed:', error)
    return res.status(500).json({ message: 'Unable to load site configuration.' })
  }
}
