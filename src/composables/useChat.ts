import { ref, nextTick } from 'vue'
import { API_BASE } from '../config-api'
import { useCart } from './useCart'
import { useProductsApi } from './useProductsApi'
import type { Product } from '../data/products'
import { createAddToCartIntentHandler } from './useChatAddToCartIntent'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  imageName?: string
  action?: {
    id?: string
    label: string
    href: string
    cta?: string
  }
  actionOptions?: Array<{
    id?: string
    label: string
    href: string
    cta?: string
  }>
}

export type ImageIntent = 'search' | 'pricing'

const rawChatEndpoint = String(import.meta.env.VITE_CHAT_ENDPOINT || 'chat').trim()
const chatPath = rawChatEndpoint.startsWith('/api/')
  ? rawChatEndpoint
  : rawChatEndpoint.startsWith('api/')
    ? `/${rawChatEndpoint}`
    : `/api/${rawChatEndpoint}`

export interface ProductSummaryItem {
  title: string
  category: string
  material: string
  price: string
  slug: string
  description?: string
}

export interface DetectedIntent {
  type: 'general' | 'product_search' | 'service'
  serviceId?: string | null
  needsServiceSelection?: boolean
  createNewProduct?: boolean
  filters?: {
    categories?: string[]
    materials?: string[]
    stoneTags?: string[]
    priceRange?: { min?: number | null; max?: number | null }
  }
}

// Swallows accidental double-Enter / double-click without delaying a deliberate send.
const SEND_THROTTLE_MS = 600
let lastSendAt = 0

const messages = ref<ChatMessage[]>([])
const input = ref('')
const loading = ref(false)
const processingText = ref('Thinking...')
const error = ref<string | null>(null)
const listEl = ref<HTMLElement | null>(null)
const suggestedFilters = ref<{
  categories: string[]
  materials: string[]
  stoneTags?: string[]
} | null>(null)
const suggestedProducts = ref<any[] | null>(null)
const lastDetectedIntent = ref<DetectedIntent | null>(null)

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Unable to read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function buildResultCountMessage(
  products: any[] | null,
  filters?: { categories?: string[]; materials?: string[]; stoneTags?: string[] } | null
) {
  const count = Array.isArray(products) ? products.length : 0
  if (!count) {
    return 'No matching products found. Try changing material, category, or budget.'
  }

  const materials = Array.isArray(filters?.materials) ? filters.materials.filter(Boolean) : []
  const categories = Array.isArray(filters?.categories) ? filters.categories.filter(Boolean) : []
  const stoneTags = Array.isArray(filters?.stoneTags) ? filters.stoneTags.filter(Boolean) : []
  const scope = [materials.join(', '), categories.join(', '), stoneTags.join(', ')]
    .filter(Boolean)
    .join(' ')
  const label = count === 1 ? 'result' : 'results'
  return scope
    ? `Found ${count} ${label} for ${scope}. Check the results panel.`
    : `Found ${count} matching ${label}. Check the results panel.`
}

function buildProcessingSteps(text: string) {
  const t = text.toLowerCase()
  const steps: string[] = ['Thinking...', 'Understanding your request...']

  const mentionsMaterial = /\bgold|silver|sterling|rose gold|white gold|yellow gold\b/.test(t)
  const mentionsCategory = /\brings?|earrings?|necklaces?|bracelets?|mangal[\s-]*sutra\b/.test(t)
  const mentionsBudget = /\bunder|below|less than|between|from|to|max|above|over|at least\b|[₹$]|\b\d+(k|l|lac|lakh)?\b/.test(
    t
  )

  if (mentionsMaterial) steps.push('Checking material preferences...')
  if (mentionsCategory) steps.push('Matching relevant categories...')
  if (mentionsBudget) steps.push('Applying price constraints...')

  steps.push('Finding the best matching pieces...')
  steps.push('Finalizing your response...')
  return [...new Set(steps)]
}

export interface UseChatOptions {
  getProductSummary?: () => ProductSummaryItem[]
}

export function useChat(options: UseChatOptions = {}) {
  const { getProductSummary: _getProductSummary } = options
  const { addToCart } = useCart()
  const { products, ensureProductsLoaded } = useProductsApi()

  async function resolveResultProducts() {
    const raw = Array.isArray(suggestedProducts.value) ? suggestedProducts.value : []
    if (!raw.length) return []
    await ensureProductsLoaded()
    const bySlug = new Map(products.value.map((p) => [p.slug, p]))
    const resolved: Product[] = []
    for (const item of raw) {
      if (!item?.slug) continue
      const full = bySlug.get(item.slug)
      if (full) resolved.push(full)
    }
    return resolved
  }

  const tryHandleAddIntent = createAddToCartIntentHandler({
    messages,
    resolveCandidates: resolveResultProducts,
    addToCart,
  })

  async function finalizeVisualSearch(body: {
    imageDataUrl: string
    prompt?: string
    limit?: number
    mode?: ImageIntent
  }) {
    loading.value = true
    error.value = null
    suggestedFilters.value = null
    suggestedProducts.value = null
    processingText.value = 'Reading the jewellery image...'
    await nextTick()
    scrollToBottom()

    try {
      const res = await fetch(`${API_BASE}/api/visual-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.message || 'Unable to process the image.')
      }
      suggestedProducts.value = Array.isArray(data.results) ? data.results : null
      messages.value.push({
        role: 'assistant',
        content: data.message || 'I reviewed the image and found a few close matches.',
      })
      if (body.mode !== 'pricing' && data.detected?.category) {
        const detectedLabel = String(data.detected.category).trim()
        if (detectedLabel) {
          messages.value.push({
            role: 'assistant',
            content: `This looks closest to ${detectedLabel.toLowerCase()}.`,
          })
        }
      }
    } catch (e) {
      const message =
        e instanceof TypeError
          ? 'Unable to reach the visual search API. If you are running locally, use the same app origin or set VITE_API_BASE_URL to the server that has /api/visual-search.'
          : e instanceof Error
            ? e.message
            : 'Sorry, I couldn’t analyze that image.'
      messages.value.push({
        role: 'assistant',
        content: message,
      })
      error.value = message
    } finally {
      loading.value = false
      processingText.value = 'Thinking...'
      await nextTick()
      scrollToBottom()
    }
  }

  async function send() {
    const text = input.value.trim()
    if (!text || loading.value) return
    const now = Date.now()
    if (now - lastSendAt < SEND_THROTTLE_MS) return
    lastSendAt = now
    // Lock immediately: tryHandleAddIntent below can await network calls,
    // and a second Enter/click in that window would fire a duplicate request.
    loading.value = true
    input.value = ''
    error.value = null
    suggestedFilters.value = null
    suggestedProducts.value = null
    lastDetectedIntent.value = null
    messages.value.push({ role: 'user', content: text })
    let statusInterval: number | null = null
    try {
      let addHandled = false
      try {
        addHandled = await tryHandleAddIntent(text)
      } catch (e) {
        messages.value.push({
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Unable to add to cart right now.',
        })
        return
      }
      if (addHandled) return

      const processingSteps = buildProcessingSteps(text)
      let stepIndex = 0
      processingText.value = processingSteps[stepIndex] ?? 'Thinking...'
      statusInterval = window.setInterval(() => {
        if (stepIndex < processingSteps.length - 1) stepIndex += 1
        processingText.value = processingSteps[stepIndex] ?? 'Thinking...'
      }, 1100)
      await nextTick()
      scrollToBottom()

      const body: { messages: { role: string; content: string }[] } = {
        messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
      }
      const res = await fetch(`${API_BASE}${chatPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.message || 'Something went wrong.')
      }
      suggestedFilters.value = data.filters ?? null
      lastDetectedIntent.value = data.detectedIntent ?? null
      const serviceAction = data.serviceAction
      const serviceOptions = Array.isArray(data.serviceOptions) ? data.serviceOptions : null
      const isServiceFlow =
        Boolean(serviceAction) ||
        Boolean(serviceOptions?.length) ||
        data.detectedIntent?.type === 'service'
      const results = isServiceFlow
        ? null
        : Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.searchResults)
          ? data.searchResults
          : null
      suggestedProducts.value = results
      const assistantMessage = isServiceFlow
        ? data.message || ''
        : results
        ? buildResultCountMessage(results, data.filters)
        : data.message || ''
      messages.value.push({
        role: 'assistant',
        content: assistantMessage,
        action: serviceAction
          ? {
              id: serviceAction.id ? String(serviceAction.id) : undefined,
              label: String(serviceAction.label || 'Service'),
              href: String(serviceAction.href || '/services'),
              cta: serviceAction.cta ? String(serviceAction.cta) : undefined,
            }
          : undefined,
        actionOptions: serviceOptions
          ? serviceOptions.map((option: any) => ({
              id: option?.id ? String(option.id) : undefined,
              label: String(option?.label || 'Service'),
              href: String(option?.href || '/services'),
              cta: option?.cta ? String(option.cta) : undefined,
            }))
          : undefined,
      })
    } catch (e) {
      messages.value.push({
        role: 'assistant',
        content: e instanceof Error ? e.message : 'Sorry, I couldn’t reply. Please try again.',
      })
      error.value = e instanceof Error ? e.message : 'Request failed'
    } finally {
      if (statusInterval != null) window.clearInterval(statusInterval)
      loading.value = false
      processingText.value = 'Thinking...'
      await nextTick()
      scrollToBottom()
    }
  }

  async function sendImage(file: File, intent: ImageIntent = 'search') {
    if (!file || loading.value) return
    if (!file.type.startsWith('image/')) {
      error.value = 'Please choose a JPG, PNG, or WEBP image.'
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      error.value = 'Please choose an image smaller than 5 MB.'
      return
    }

    let imageDataUrl = ''
    try {
      imageDataUrl = await readFileAsDataUrl(file)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unable to read the selected image.'
      return
    }
    if (!imageDataUrl) {
      error.value = 'Unable to read the selected image.'
      return
    }

    messages.value.push({
      role: 'user',
      content:
        intent === 'pricing'
          ? 'Give me sample pricing for this jewellery image.'
          : 'Find jewellery similar to this image.',
      imageUrl: imageDataUrl,
      imageName: file.name,
    })
    await finalizeVisualSearch({
      imageDataUrl,
      prompt:
        intent === 'pricing'
          ? 'Estimate the likely jewellery price in USD from this image. Keep the answer natural, like ChatGPT.'
          : 'Find similar jewellery from this catalog image.',
      limit: 6,
      mode: intent,
    })
  }

  function scrollToBottom() {
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
  }

  function setListEl(el: HTMLElement | null) {
    listEl.value = el
  }

  function clearChat() {
    messages.value = []
    input.value = ''
    error.value = null
    suggestedFilters.value = null
    suggestedProducts.value = null
    lastDetectedIntent.value = null
  }

  return {
    messages,
    input,
    loading,
    processingText,
    error,
    listEl,
    setListEl,
    send,
    sendImage,
    scrollToBottom,
    clearChat,
    suggestedFilters,
    suggestedProducts,
    lastDetectedIntent,
  }
}
