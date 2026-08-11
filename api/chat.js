/**
 * Unified Vercel serverless chat endpoint.
 * POST /api/chat with body: { messages, debug?: boolean }
 */
import {
  buildServiceChatResult,
  buildServiceChatResultFromIntent,
  buildChatResult,
  buildSystemPrompt,
  getServiceIntentById,
  SERVICE_INTENTS,
  isDebugEnabled,
  inferSubtypesFromText,
  VALID_SUBTYPES,
} from '../server/api/chat-common.js'
import { getCatalogProductSummaries } from '../server/api/products-source.js'
import { filterProductsByCriteria, parseProductPrice } from '../server/api/product-filter.js'
import {
  generateQueryEmbedding,
  vectorSearchSlugs,
  VECTOR_RELAXED_THRESHOLD,
} from '../server/api/vector-search.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'

const VALID_CATEGORIES = ['Rings', 'Earrings', 'Mangal Sutra', 'Necklaces', 'Bracelets', 'Bangles']
const VALID_MATERIALS = ['gold', 'silver']
// Specific, discriminating stone types only. The generic "stone" was removed on
// purpose: every gem piece "has a stone", so it never narrows results — it only
// trapped descriptive queries (e.g. "blue stone") as a meaningless hard filter
// and polluted the query embedding, hiding the real "blue" signal from the
// semantic search over product descriptions. Colour is handled separately by
// STONE_COLOR_TERMS below, which searches the description text directly.
const VALID_STONE_TAGS = [
  'diamond',
  'kundan',
  'polki',
  'pearl',
  'emerald',
  'ruby',
  'black-beads',
]

// Stone colours are not a structured field on products; they live in the
// description text. These terms are matched against the title + description so a
// colour the catalog doesn't stock (e.g. "blue") returns nothing honestly,
// instead of falling back to unrelated stones. Metal-finish words (yellow /
// white / rose) are deliberately excluded — those describe the metal, not a gem.
const STONE_COLOR_TERMS = [
  'blue',
  'pink',
  'green',
  'red',
  'purple',
  'violet',
  'orange',
  'turquoise',
  'aquamarine',
  'amethyst',
  'sapphire',
  'topaz',
  'garnet',
  'citrine',
  'peridot',
  'tanzanite',
  'coral',
]
const STONE_INFERENCE_PATTERNS = [
  { tag: 'emerald', regex: /\bemerald(s)?\b|\bpanna\b/i },
  { tag: 'ruby', regex: /\bruby|rubies\b|\bmanik\b/i },
  { tag: 'diamond', regex: /\bdiamond(s)?\b|\bheer[ae]\b/i },
  { tag: 'pearl', regex: /\bpearl(s)?\b|\bmoti\b/i },
  { tag: 'kundan', regex: /\bkundan\b/i },
  { tag: 'polki', regex: /\bpolki\b/i },
  { tag: 'black-beads', regex: /\bblack[\s-]?beads?\b/i },
]
const CATEGORY_ALIAS_MAP = {
  ring: 'Rings',
  rings: 'Rings',
  earring: 'Earrings',
  earrings: 'Earrings',
  necklace: 'Necklaces',
  necklaces: 'Necklaces',
  bracelet: 'Bracelets',
  bracelets: 'Bracelets',
  bangle: 'Bangles',
  bangles: 'Bangles',
  kada: 'Bangles',
  kadas: 'Bangles',
  mangalsutra: 'Mangal Sutra',
  'mangal sutra': 'Mangal Sutra',
}

function shouldRunProductSearchFlow(message) {
  if (typeof message !== 'string' || !message.trim()) return false
  if (buildServiceChatResult(message)) return false
  const text = message.toLowerCase()
  return (
    /\b(show|find|search|browse|recommend|looking|collection|products?|pieces?|options?)\b/.test(text) ||
    /\b(rings?|earrings?|necklaces?|bracelets?|bangles?|mangal[\s-]*sutra)\b/.test(text) ||
    /\b(jhumka|jhumki|bali|studs?|tops|pendant|chain|haar|mala|kada|bangle|chudi|anguthi)\b/.test(
      text
    ) ||
    /\b(gold|silver|sterling|oxidised|oxidized)\b/.test(text) ||
    /\b(emerald|ruby|diamond|pearl|kundan|polki|gemstone|panna|moti|manik)\b/.test(text) ||
    /\b(under|below|less than|between|from|to|max|above|over|at least)\b/.test(text) ||
    /[₹$]|\b\d+\s*(k|l|lac|lakh)?\b/.test(text)
  )
}

function extractJsonObject(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {}
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function inferStoneTagsFromUserMessage(content) {
  if (typeof content !== 'string' || !content.trim()) return []
  const found = []
  for (const { tag, regex } of STONE_INFERENCE_PATTERNS) {
    if (regex.test(content) && VALID_STONE_TAGS.includes(tag)) found.push(tag)
  }
  return [...new Set(found)]
}

// Pull stone-colour words out of the user's message (e.g. "with blue stone").
function extractStoneColorTerms(content) {
  if (typeof content !== 'string' || !content.trim()) return []
  const text = content.toLowerCase()
  return STONE_COLOR_TERMS.filter((term) => new RegExp(`\\b${term}\\b`).test(text))
}

// True when any requested colour word appears in the product's title,
// description, or AI description. Colours are not structured on products, so
// this searches the text — including aiDescription, which is generated from
// the product photos and therefore catches pieces whose manual copy is stale
// or wrong about the stone colour.
function productMatchesStoneColor(product, colorTerms) {
  if (!colorTerms.length) return true
  const haystack = `${product?.title || ''} ${product?.description || ''} ${product?.aiDescription || ''}`.toLowerCase()
  return colorTerms.some((term) => new RegExp(`\\b${term}\\b`).test(haystack))
}

// Keep only the products whose description actually mentions the requested
// colour. Returning [] (when nothing matches) is intentional: better an honest
// "no blue pieces" than a misleading list of pink ones.
function filterByStoneColor(products, content) {
  const colorTerms = extractStoneColorTerms(content)
  if (!colorTerms.length) return products
  return products.filter((p) => productMatchesStoneColor(p, colorTerms))
}

function normalizeIntentPayload(payload) {
  const rawIntent = String(payload?.intent || '').toLowerCase()
  const intent =
    rawIntent === 'product_search' || rawIntent === 'service_request' ? rawIntent : 'general'
  const categories = Array.isArray(payload?.filters?.categories)
    ? payload.filters.categories
        .map((c) => CATEGORY_ALIAS_MAP[String(c).toLowerCase().trim()] || null)
        .filter((c) => c && VALID_CATEGORIES.includes(c))
    : []
  const materials = Array.isArray(payload?.filters?.materials)
    ? payload.filters.materials
        .map((m) => String(m).toLowerCase())
        .filter((m) => VALID_MATERIALS.includes(m))
    : []
  const stoneTagsFromModel = Array.isArray(payload?.filters?.stoneTags)
    ? payload.filters.stoneTags
        .map((t) => String(t).toLowerCase().trim())
        .filter((t) => VALID_STONE_TAGS.includes(t))
    : []
  const subtypesFromModel = Array.isArray(payload?.filters?.subtypes)
    ? payload.filters.subtypes
        .map((s) => String(s).toLowerCase().trim().replace(/\s+/g, '-'))
        .filter((s) => VALID_SUBTYPES.includes(s))
    : []
  const priceRange = payload?.filters?.priceRange || {}
  const min =
    typeof priceRange?.min === 'number' && Number.isFinite(priceRange.min) ? priceRange.min : null
  const max =
    typeof priceRange?.max === 'number' && Number.isFinite(priceRange.max) ? priceRange.max : null
  const rawServiceId = String(payload?.serviceRequest?.serviceId || '')
    .toLowerCase()
    .trim()
  const serviceId = SERVICE_INTENTS.some((service) => service.id === rawServiceId) ? rawServiceId : null
  return {
    intent,
    filters: {
      categories: [...new Set(categories)],
      materials: [...new Set(materials)],
      stoneTags: [...new Set(stoneTagsFromModel)],
      subtypes: [...new Set(subtypesFromModel)],
      priceRange: { min, max },
    },
    serviceRequest: {
      serviceId,
      needsServiceSelection: Boolean(payload?.serviceRequest?.needsServiceSelection),
      createNewProduct: Boolean(payload?.serviceRequest?.createNewProduct),
    },
  }
}

function mergeInferredStoneTags(intent, userContent) {
  if (!intent?.filters) return intent
  const inferred = inferStoneTagsFromUserMessage(userContent)
  const merged = [...new Set([...(intent.filters.stoneTags || []), ...inferred])]
  return {
    ...intent,
    filters: { ...intent.filters, stoneTags: merged },
  }
}

function mergeInferredSubtypes(intent, userContent) {
  if (!intent?.filters) return intent
  const inferred = inferSubtypesFromText(userContent)
  const merged = [...new Set([...(intent.filters.subtypes || []), ...inferred])]
  return {
    ...intent,
    filters: { ...intent.filters, subtypes: merged },
  }
}

// Compose query text aligned to the catalog embed-text space (buildCatalogEmbedText
// leads with category / subtype / material / stones), so the query and catalog
// vectors land in the same neighbourhood.
function buildChatQueryEmbedText(userContent, filters) {
  const parts = [
    filters.categories?.length ? filters.categories.join(' ') : null,
    filters.subtypes?.length ? filters.subtypes.map((s) => s.replace(/-/g, ' ')).join(' ') : null,
    filters.materials?.length ? filters.materials.join(' ') : null,
    filters.stoneTags?.length ? `Stones: ${filters.stoneTags.join(', ')}` : null,
    userContent,
  ]
  return parts.filter(Boolean).join('. ')
}

function sortByPrice(products) {
  return products.slice().sort((a, b) => parseProductPrice(a) - parseProductPrice(b)).slice(0, 60)
}

// Descriptive intent = anything beyond the structural facets (category / material
// / subtype / price). When the query mentions a stone colour, shape, cut, size,
// stone type, style, "multi-stone", or "looks like…", the embedding ranking over
// product descriptions earns its keep. Plain structural queries ("show all
// pendants") have no such signal, so we skip the embedding call entirely.
const DESCRIPTIVE_REGEXES = [
  /\b(round|oval|pear|marquise|princess|cushion|baguette|heart|radiant|asscher|teardrop|step[\s-]?cut|rose[\s-]?cut|emerald[\s-]?cut)\b/,
  /\b(diamond|emerald|ruby|pearl|kundan|polki|gemstone|panna|moti|manik)\b/,
  /\b(bridal|minimal|minimalist|modern|contemporary|vintage|antique|dainty|delicate|statement|classic|traditional|floral|geometric|heritage|elegant|chunky|bold|layered)\b/,
  /\b(small|large|big|tiny|mini|petite|heavy|light)\b/,
  /\b\d+(\.\d+)?\s*(ct|carat|carats|mm)\b/,
  /\b(like|similar|resembl\w*|matching|same\s+as)\b/,
  /\bmulti[\s-]?stone(s)?\b/,
]

function hasDescriptiveTerms(content) {
  if (typeof content !== 'string' || !content.trim()) return false
  const text = content.toLowerCase()
  if (extractStoneColorTerms(text).length) return true
  return DESCRIPTIVE_REGEXES.some((re) => re.test(text))
}

// Filter-first product search:
//   1. HARD structural filter — category + material + subtype + price. These are
//      the facets the extractor pins down reliably; the result set is exactly the
//      products that match them (no false fallback to other types).
//   2. Vector ranking ONLY when the query carries descriptive intent (colour /
//      shape / style / "like this"). We rank the hard-filtered CANDIDATES by their
//      embedding similarity — every candidate is kept (anchored, default score 0),
//      so a candidate the vector pass didn't surface is de-prioritised, never
//      dropped. Plain structural queries skip the embedding call and sort by price.
async function searchProductsFromIntent(productSummary, normalizedIntent, userContent) {
  const filters = normalizedIntent.filters
  const { categories, materials, subtypes, priceRange } = filters

  // Stage A — hard structural filter (stoneTags stay out; stones are Stage B).
  const candidates = filterProductsByCriteria(productSummary, {
    categories,
    materials,
    stoneTags: [],
    subtypes,
    priceMin: priceRange.min,
    priceMax: priceRange.max,
  })
  if (!candidates.length) return []

  // No descriptive intent → return the filtered set as-is (cheapest by price first).
  if (!hasDescriptiveTerms(userContent)) return sortByPrice(candidates)

  // Stage B — rank the candidates by embedding similarity to the query.
  try {
    const embedText = buildChatQueryEmbedText(userContent, filters)
    if (!embedText.trim()) return sortByPrice(candidates)

    const queryVector = await generateQueryEmbedding(embedText)
    // limit covers the whole catalog so every candidate gets a real similarity;
    // for a much larger catalog, restrict the SQL to candidate slugs instead.
    let hits = await vectorSearchSlugs(queryVector, { limit: 500 })
    if (!hits.length) {
      hits = await vectorSearchSlugs(queryVector, { limit: 500, threshold: VECTOR_RELAXED_THRESHOLD })
    }
    if (!hits.length) return sortByPrice(candidates)

    const simBySlug = new Map(hits.map((h) => [String(h.slug).toLowerCase(), h.similarity]))
    return candidates
      .map((p) => ({ ...p, vectorScore: simBySlug.get(String(p.slug).toLowerCase()) ?? 0 }))
      .sort((a, b) => b.vectorScore - a.vectorScore || parseProductPrice(a) - parseProductPrice(b))
      .slice(0, 60)
  } catch (err) {
    console.error('Chat vector ranking failed, returning hard-filtered set by price:', err?.message || err)
    return sortByPrice(candidates)
  }
}

function buildDetectedIntentPayload(normalizedIntent) {
  if (!normalizedIntent) return { type: 'general' }
  if (normalizedIntent.intent === 'service_request') {
    return {
      type: 'service',
      serviceId: normalizedIntent.serviceRequest?.serviceId || null,
      needsServiceSelection: Boolean(normalizedIntent.serviceRequest?.needsServiceSelection),
      createNewProduct: Boolean(normalizedIntent.serviceRequest?.createNewProduct),
    }
  }
  if (normalizedIntent.intent === 'product_search') {
    return {
      type: 'product_search',
      filters: normalizedIntent.filters,
    }
  }
  return { type: 'general' }
}

function buildServiceSelectionResult(normalizedIntent) {
  const createNewProduct = Boolean(normalizedIntent?.serviceRequest?.createNewProduct)
  const message = createNewProduct
    ? "Lovely — we can absolutely make something for you. Where would you like to start? Pick a stage below, or go with Complete product if you'd like us to handle the whole journey from idea to finished piece."
    : "Happy to help with that. Pick the stage you need and I'll take you straight to the right booking flow."

  const serviceOptions = SERVICE_INTENTS.map((service) => ({
    id: service.id,
    label: service.label,
    href: service.href,
    cta: service.label,
  }))

  return {
    message,
    serviceAction: null,
    serviceOptions,
    filters: null,
    results: [],
  }
}

const CREATION_ACTION_REGEX =
  /\b(make|create|design(ed|ing)?|build|craft(ed|ing)?|manufacture(d|s|ing)?|customize|customise|tailor(ed|-made)?|commission|produce|develop(ed)?\s+a|order\s+(a|some|my)\b|get\s+(a|me|us)?\s*(new|custom)?\s*(piece|ring|earring|necklace|bracelet|jewellery|jewelry|pendant)\b)\b/
const CREATION_INTENT_VERB_REGEX = /\b(want|need|looking\s+to|like\s+to|wish\s+to|hoping\s+to|planning\s+to)\b/
const JEWELLERY_OBJECT_REGEX =
  /\b(jewellery|jewelry|piece|product|item|design|ring|engagement\s+ring|wedding\s+ring|earring|necklace|bracelet|mangal[\s-]?sutra|pendant|chain|bangle|kada|jhumka|bali|stud(s)?|tops|haar|mala|anguthi|tikka|brooch|nose\s*pin|nath|payal|anklet)\b/
const CUSTOM_HINT_REGEX =
  /\b(custom(?:-?ised|-?ized|-?made)?|bespoke|made[\s-]to[\s-]order|made[\s-]to[\s-]measure|one[\s-]of[\s-]a[\s-]kind|unique|personal(?:ised|ized)?|own\s+(design|piece|ring|jewellery|jewelry)|from\s+scratch|from\s+a\s+(sketch|photo|picture|image|drawing|reference)|based\s+on\s+(a\s+)?(sketch|photo|picture|image|drawing|reference))\b/
const BROWSE_INTENT_REGEX =
  /\b(show|find|search|browse|recommend|looking\s+for|see|view|display|list|catalog(?:ue)?)\b/
const QUESTION_OFFER_REGEX =
  /\b(do|does|can|are|is|will|could|would)\s+(you|u|y'?all|kiana)\b/
const CREATE_PRONOUN_OBJECT_REGEX =
  /\b(make|build|cast|craft|produce|design|print)\s+(it|this|that|one|something|these|them)\b/

function detectCreationServiceIntent(content) {
  if (typeof content !== 'string' || !content.trim()) return null
  const text = content.trim().toLowerCase()

  const hasAction = CREATION_ACTION_REGEX.test(text)
  const hasIntentVerb = CREATION_INTENT_VERB_REGEX.test(text)
  const hasObject = JEWELLERY_OBJECT_REGEX.test(text)
  const hasCustomHint = CUSTOM_HINT_REGEX.test(text)
  const isQuestion = QUESTION_OFFER_REGEX.test(text)
  const hasPronounCreate = CREATE_PRONOUN_OBJECT_REGEX.test(text)
  const isPureBrowse = BROWSE_INTENT_REGEX.test(text) && !hasCustomHint && !hasAction

  // Patterns that signal "please make something for me":
  // A. "do you make / can you build / would you design ..." — offering question.
  // B. action verb + jewellery noun        ("design a ring", "make jewellery").
  // C. action verb + custom hint           ("create something custom").
  // D. custom hint + jewellery noun        ("need a custom bracelet").
  // E. bespoke / made-to-order / one-of-a-kind standalone phrasing.
  // F. "want / need / looking to" + custom hint  ("I want a bespoke piece").
  // G. action verb on a pronoun referring back to a reference ("can you make it/this/one").
  const matchesCreation =
    (isQuestion && (hasAction || hasPronounCreate) && (hasObject || hasCustomHint || hasPronounCreate)) ||
    (hasAction && hasObject) ||
    (hasAction && hasCustomHint) ||
    (hasCustomHint && hasObject) ||
    (hasIntentVerb && hasCustomHint) ||
    hasPronounCreate ||
    /\b(bespoke|made[\s-]to[\s-]order|made[\s-]to[\s-]measure|one[\s-]of[\s-]a[\s-]kind)\b/.test(text)

  if (!matchesCreation) return null
  // Don't hijack pure "show me silver rings under 5000" style browse queries.
  if (isPureBrowse) return null

  return {
    intent: 'service_request',
    filters: {
      categories: [],
      materials: [],
      stoneTags: [],
      priceRange: { min: null, max: null },
    },
    serviceRequest: {
      serviceId: null,
      needsServiceSelection: true,
      createNewProduct: true,
    },
  }
}

function getProviderKeys() {
  return {
    openai: process.env.OPENAI_API_KEY || '',
  }
}

async function callAnthropic(apiKey, messages, systemPrompt) {
  const body = {
    model: process.env.ANTHROPIC_CHAT_MODEL || 'claude-3-5-haiku-20241022',
    max_tokens: 512,
    system: systemPrompt,
    messages: messages.slice(-20).map(({ role, content }) => ({ role, content })),
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(err || `Anthropic API ${response.status}`)
  }
  const data = await response.json()
  const textBlock = data.content?.find((b) => b.type === 'text')
  return textBlock?.text?.trim() || ''
}

async function callOpenAI(apiKey, messages, systemPrompt) {
  const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-20).map(({ role, content }) => ({ role, content })),
      ],
      max_tokens: 512,
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(err || `OpenAI API ${response.status}`)
  }
  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || ''
}

async function callHuggingFace(token, messages, systemPrompt) {
  const model = process.env.HUGGINGFACE_CHAT_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-20).map(({ role, content }) => ({ role, content })),
      ],
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Hugging Face API error ${response.status}: ${err}`)
  }
  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || ''
}

async function callGrok(apiKey, messages, systemPrompt) {
  const base = (process.env.XAI_API_BASE || 'https://api.x.ai/v1').replace(/\/+$/, '')
  const preferred = String(process.env.GROK_CHAT_MODEL || '').trim()
  const modelCandidates = [
    preferred || null,
    'grok-4-fast-non-reasoning',
    'grok-4-fast-reasoning',
    'grok-4',
    'grok-3-mini',
    'grok-3',
    'grok-2-latest',
    'grok-2',
  ].filter(Boolean)
  const tried = new Set()
  let lastError = ''

  for (const model of modelCandidates) {
    if (tried.has(model)) continue
    tried.add(model)
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-20).map(({ role, content }) => ({ role, content })),
        ],
        max_tokens: 512,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return data?.choices?.[0]?.message?.content?.trim() || ''
    }

    const errText = await response.text()
    lastError = errText || `Grok API ${response.status}`
    const missingModel = /model not found|invalid argument/i.test(lastError)
    if (!missingModel) break
  }

  throw new Error(lastError || 'Grok API request failed.')
}

async function callModel(provider, keys, messages, systemPrompt) {
  if (provider === 'openai') return callOpenAI(keys.openai, messages, systemPrompt)
  throw new Error(`Unsupported provider: ${provider}`)
}

function assertProviderKey(provider, keys) {
  if (provider && keys?.[provider]) return
  throw new Error(`Provider "${provider}" is not configured. Set OPENAI_API_KEY.`)
}

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const body = req.body || {}
  const { messages } = body
  const productSummary = await getCatalogProductSummaries()
  const debug = isDebugEnabled(req, body)

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'Body must include messages array.' })
  }

  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role !== 'user' || typeof lastMessage?.content !== 'string') {
    return res.status(400).json({ message: 'Last message must be from user with content.' })
  }

  const keys = getProviderKeys()
  const provider = 'openai'

  if (!provider) {
    return res.status(500).json({
      message: 'Chat not configured. Set OPENAI_API_KEY.',
    })
  }

  try {
    assertProviderKey(provider, keys)
    const systemPrompt = buildSystemPrompt(productSummary, { includeMultiCategoryFilterExample: true })
    const extractorPrompt = `You are an intent extraction engine for a jewellery assistant at Kiana Jewels (Jaipur).
Return ONLY valid JSON with no markdown and no extra text.

Schema:
{
  "intent": "product_search" | "service_request" | "general",
  "filters": {
    "categories": string[],
    "materials": string[],
    "subtypes": string[],
    "stoneTags": string[],
    "priceRange": { "min": number | null, "max": number | null }
  },
  "serviceRequest": {
    "serviceId": "cad" | "wax" | "casting" | "final" | "full-pipeline" | null,
    "needsServiceSelection": boolean,
    "createNewProduct": boolean
  }
}

Allowed values:
- categories: ${VALID_CATEGORIES.join(', ')}
- materials: ${VALID_MATERIALS.join(', ')}
- subtypes: ${VALID_SUBTYPES.join(', ')} (use [] if not specified). Only set a subtype when the user clearly names the form, e.g. "pendant"/"pendant set" → pendant, "solitaire"/"single stone ring" → solitaire, "jhumka"/"jhumki" → jhumka, "studs"/"tops" → stud, "mangalsutra" → mangal-sutra. Map a subtype to its parent category too (e.g. pendant ⇒ Necklaces, solitaire ⇒ Rings, jhumka/stud ⇒ Earrings). Do NOT guess a subtype from vague words like "necklace" or "ring" alone.
- stoneTags: ${VALID_STONE_TAGS.join(', ')} (use [] if not specified)
- serviceId: cad, wax, casting, final, full-pipeline

Intent rules — be inclusive, not literal:
1. intent="product_search" when the user wants to BROWSE existing pieces: keywords like show / find / looking / under $X / category + material, etc.
2. intent="service_request" when the user wants something MADE, designed, customised, prototyped, cast, polished, or finished. This covers ALL natural phrasings, not just exact service names. Examples:
   - "I want to make a ring" → service_request, createNewProduct=true, needsServiceSelection=true
   - "Can you design a custom mangalsutra?" → service_request, createNewProduct=true, needsServiceSelection=true
   - "Do you do bespoke jewellery?" → service_request, createNewProduct=true, needsServiceSelection=true
   - "Can you make this from a photo?" → service_request, createNewProduct=true, needsServiceSelection=true
   - "I want a 3D CAD of my design" → service_request, serviceId="cad"
   - "I have a CAD, can you cast it?" → service_request, serviceId="casting"
   - "Need wax prototype" → service_request, serviceId="wax"
   - "Polish and stone setting only" → service_request, serviceId="final"
   - "Take it from idea to finished piece" → service_request, serviceId="full-pipeline"
3. intent="general" ONLY for greetings, small talk, store hours/location/policy questions, or other non-product non-service chatter.

Service tie-breakers:
- If the user names a specific stage (CAD / wax / casting / finishing), set serviceId accordingly.
- If they describe creation/customisation without picking a stage, set serviceId=null and needsServiceSelection=true so the UI can show them options.
- Set createNewProduct=true whenever the user wants to make / create / design / customise / order a brand new piece.

Users may write in English, Hindi, Hinglish, or transliterated text. Normalize loose terms (e.g. "anguthi" → Rings, "panna" → emerald) to the allowed values. Default to intent="general" only when nothing above clearly fits.`

    const extractorRaw = await callModel(provider, keys, messages, extractorPrompt)
    let extracted = normalizeIntentPayload(extractJsonObject(extractorRaw) || {})
    extracted = mergeInferredStoneTags(extracted, lastMessage.content)
    extracted = mergeInferredSubtypes(extracted, lastMessage.content)
    const creationOverride = detectCreationServiceIntent(lastMessage.content)
    if (creationOverride) extracted = creationOverride
    const detectedIntent = buildDetectedIntentPayload(extracted)
    const regexServiceResult = buildServiceChatResult(lastMessage.content)
    const isProductIntent =
      extracted?.intent === 'product_search' || shouldRunProductSearchFlow(lastMessage.content)

    if (extracted?.intent === 'service_request') {
      const service = extracted.serviceRequest?.serviceId
        ? getServiceIntentById(extracted.serviceRequest.serviceId)
        : null

      if (service && !extracted.serviceRequest?.needsServiceSelection) {
        const serviceResult = buildServiceChatResultFromIntent(service)
        return res.status(200).json({
          ...serviceResult,
          detectedIntent,
          ...(debug && { provider, extractorRaw, extractedIntent: extracted }),
        })
      }

      const selectionResult = buildServiceSelectionResult(extracted)
      return res.status(200).json({
        ...selectionResult,
        detectedIntent,
        ...(debug && { provider, extractorRaw, extractedIntent: extracted }),
      })
    }

    if (regexServiceResult) {
      return res.status(200).json({
        ...regexServiceResult,
        detectedIntent: { type: 'service', serviceId: regexServiceResult.serviceAction?.id || null },
        ...(debug && { provider, extractorRaw, extractedIntent: extracted }),
      })
    }

    if (isProductIntent && extracted?.intent === 'product_search') {
      const ranked = await searchProductsFromIntent(productSummary, extracted, lastMessage.content)
      // Constrain to the requested stone colour (searched in the description text).
      // If the catalog carries no matching colour this yields [] on purpose, so the
      // reply is an honest "no blue pieces" rather than a fallback to other stones.
      const matches = filterByStoneColor(ranked, lastMessage.content)
      const polishPrompt = `You are Priya, a warm jewellery consultant at Kiana Jewels in Jaipur. You talk like a real, enthusiastic person — not a robot. Use natural contractions, show genuine excitement about the pieces, and keep it conversational and short. Recommend specific products from the search results by name with their prices. If no exact match, warmly suggest the closest options. Never invent products not in the list.`
      // aiDescription is for colour matching only — keep it out of the polish
      // prompt (it duplicates the manual description and inflates tokens).
      const polishResults = matches.map(({ aiDescription, ...rest }) => rest)
      const polishUserMessage = `User query: ${lastMessage.content}
Filters: ${JSON.stringify(extracted.filters)}
Search results: ${JSON.stringify(polishResults)}`
      const polishRaw = await callModel(
        provider,
        keys,
        [{ role: 'user', content: polishUserMessage }],
        polishPrompt
      )

      if (!polishRaw) {
        return res.status(502).json({ message: 'No reply from AI. Please try again.' })
      }

      return res.status(200).json({
        message: polishRaw.trim(),
        filters: {
          categories: extracted.filters.categories,
          materials: extracted.filters.materials,
          stoneTags: extracted.filters.stoneTags || [],
          subtypes: extracted.filters.subtypes || [],
        },
        results: matches,
        detectedIntent,
        ...(debug && {
          provider,
          rawMessage: polishRaw,
          extractorRaw,
          extractedIntent: extracted,
          searchResults: matches,
        }),
      })
    }

    const rawMessage = await callModel(provider, keys, messages, systemPrompt)
    if (!rawMessage) {
      return res.status(502).json({ message: 'No reply from AI. Please try again.' })
    }

    const result = buildChatResult({
      rawMessage,
      lastUserContent: lastMessage.content,
      previousMessages: messages.slice(0, -1),
      productSummary,
      intent: extracted?.intent,
    })

    return res.status(200).json({
      ...result,
      detectedIntent,
      ...(debug && {
        provider,
        rawMessage,
        extractorRaw,
        extractedIntent: extracted,
      }),
    })
  } catch (err) {
    console.error('Chat error:', err)
    return res.status(500).json({ message: err.message || 'Something went wrong.' })
  }
}
