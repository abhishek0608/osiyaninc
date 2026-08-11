export function applyCors(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export function handlePreflight(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  return null
}
