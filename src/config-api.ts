const rawApiBase = import.meta.env.VITE_API_BASE_URL
const defaultApiBase =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : ''

export const API_BASE = String(rawApiBase || defaultApiBase)
  .trim()
  .replace(/\/+$/, '')
