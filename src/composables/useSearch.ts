import { ref, computed } from 'vue'
import { products, type Product } from '../data/products'

export type { Product }

const query = ref('')
const isOpen = ref(false)

// Bumped on explicit submit (Enter / lens button) from any search bar; the
// search page watches it to run the AI search. Typing alone never triggers AI.
const searchSubmitTick = ref(0)

// Visual / image search state
const imageResults = ref<Product[]>([])
const isImageSearch = ref(false)
const imageSearchLoading = ref(false)
const imageSearchError = ref<string | null>(null)
const imagePreviewUrl = ref<string | null>(null)
// Which backend strategy produced the results: 'image-vector' (photo-to-photo),
// 'vector' (text-embedding fallback), or an attribute-scoring step name.
const imageSearchStrategy = ref<string | null>(null)

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export function useSearch() {
  const textResults = computed(() => {
    const q = query.value.toLowerCase().trim()
    if (!q) return products
    return products.filter(
      (p) => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
    )
  })

  const results = computed(() => (isImageSearch.value ? imageResults.value : textResults.value))

  function submitTextSearch() {
    searchSubmitTick.value++
  }

  function open() {
    isOpen.value = true
  }

  // Image-search state is module-level so it survives navigation to /search —
  // which also means every new text search must clear it explicitly, or the
  // stale image results keep rendering over the new query's results.
  function clearImageSearch() {
    isImageSearch.value = false
    imageResults.value = []
    imageSearchError.value = null
    imagePreviewUrl.value = null
    imageSearchStrategy.value = null
  }

  function close() {
    isOpen.value = false
    query.value = ''
    clearImageSearch()
  }

  async function searchByImage(file: File) {
    isImageSearch.value = true
    imageSearchLoading.value = true
    imageSearchError.value = null
    imageResults.value = []
    imageSearchStrategy.value = null
    isOpen.value = true

    try {
      const dataUrl = await fileToDataUrl(file)
      imagePreviewUrl.value = dataUrl

      const res = await fetch(`${API_BASE}/api/visual-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, mode: 'search', limit: 8 }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { message?: string }).message || `HTTP ${res.status}`)
      }

      const data = await res.json() as {
        results?: Product[]
        debug?: { strategy?: string }
      }
      imageResults.value = Array.isArray(data.results) ? data.results : []
      imageSearchStrategy.value = data.debug?.strategy ?? null
    } catch (err) {
      imageSearchError.value = err instanceof Error ? err.message : 'Image search failed.'
    } finally {
      imageSearchLoading.value = false
    }
  }

  return {
    query,
    isOpen,
    results,
    allProducts: products,
    open,
    close,
    searchSubmitTick,
    submitTextSearch,
    // image search
    isImageSearch,
    imageResults,
    imageSearchLoading,
    imageSearchError,
    imagePreviewUrl,
    imageSearchStrategy,
    searchByImage,
    clearImageSearch,
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
