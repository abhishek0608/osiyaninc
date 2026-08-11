import { ref } from 'vue'
import { API_BASE } from '../config-api'

export interface HomepageSlide {
  id?: string
  imageUrl: string
  mobileImageUrl?: string
  headline?: string
  subheadline?: string
  ctaLabel?: string
  ctaHref?: string
  device?: 'all' | 'desktop' | 'mobile'
  sortOrder?: number
  active?: boolean
}

const slides = ref<HomepageSlide[]>([])
const loading = ref(false)
// `loaded` flips true once the first fetch settles (success or failure). The
// banner uses it to show a skeleton until then, instead of flashing the static
// fallback hero while the request is still in flight.
const loaded = ref(false)
const error = ref<string | null>(null)

export function invalidateHomepageSlides() {
  slides.value = []
  loaded.value = false
  error.value = null
}

export async function ensureHomepageSlidesLoaded() {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    const url = new URL(`${API_BASE}/api/homepage-slides`, window.location.origin)
    const res = await fetch(url.toString())
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.message || 'Unable to load homepage slides.')
    }
    slides.value = Array.isArray(data?.slides) ? data.slides : []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load homepage slides.'
  } finally {
    loading.value = false
    loaded.value = true
  }
}

export function useHomepageSlides() {
  return { slides, loading, loaded, error, ensureHomepageSlidesLoaded, invalidateHomepageSlides }
}
