import { applyCors, handlePreflight } from '../server/api/cors.js'
import { getHomepageSlides } from '../server/api/homepage-slides-source.js'

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const slides = await getHomepageSlides()
    // Short cache so banner edits appear within a few seconds, with a brief
    // stale-while-revalidate window to keep the endpoint fast under load.
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10, stale-while-revalidate=30')
    return res.status(200).json({ slides })
  } catch (error) {
    console.error('[homepage-slides] failed:', error)
    return res.status(500).json({ message: 'Unable to load homepage slides.' })
  }
}
