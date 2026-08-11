const REFERENCE_COUNTER_PREFIX = 'kiana-reference-counter:'

function readCounter(counterKey: string) {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(`${REFERENCE_COUNTER_PREFIX}${counterKey}`)
    const value = Number(raw || 0)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function writeCounter(counterKey: string, value: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${REFERENCE_COUNTER_PREFIX}${counterKey}`, String(value))
  } catch {
    // Ignore storage write failures and continue with the in-memory result.
  }
}

export function getNextReferenceNumber(prefix: string, counterKey: string) {
  const next = readCounter(counterKey) + 1
  writeCounter(counterKey, next)
  return `${prefix}-${String(next).padStart(6, '0')}`
}
