/**
 * Vercel serverless function: AI chat via Hugging Face Inference (free tier).
 * Set HF_TOKEN or HUGGINGFACE_HF_TOKEN in Vercel. Optional: HUGGINGFACE_CHAT_MODEL
 * POST /api/chat-gemini with body: { messages, debug?: boolean }
 * Returns: { message: string, filters?: { categories: string[], materials: string[] }, rawMessage?: string }
 */
import {
  buildChatResult,
  buildServiceChatResult,
  buildSystemPrompt,
  isDebugEnabled,
  inferSubtypesFromText,
  VALID_SUBTYPES,
} from '../server/api/chat-common.js'
import { getCatalogProductSummaries } from '../server/api/products-source.js'
import { filterProductsByCriteria, parseProductPrice } from '../server/api/product-filter.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'

const VALID_CATEGORIES = ['Rings', 'Earrings', 'Mangal Sutra', 'Necklaces', 'Bracelets', 'Bangles']
const VALID_MATERIALS = ['gold', 'silver']
const VALID_STONE_TAGS = [
  'diamond',
  'kundan',
  'polki',
  'pearl',
  'emerald',
  'ruby',
  'black-beads',
  'stone',
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

function normalizeIntentPayload(payload) {
  const rawIntent = String(payload?.intent || '').toLowerCase()
  const intent = rawIntent === 'product_search' ? 'product_search' : 'general'
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
  return {
    intent,
    filters: {
      categories: [...new Set(categories)],
      materials: [...new Set(materials)],
      stoneTags: [...new Set(stoneTagsFromModel)],
      subtypes: [...new Set(subtypesFromModel)],
      priceRange: { min, max },
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

function searchProductsFromIntent(productSummary, normalizedIntent) {
  const { categories, materials, stoneTags, subtypes, priceRange } = normalizedIntent.filters
  const matches = filterProductsByCriteria(productSummary, {
    categories,
    materials,
    stoneTags,
    subtypes,
    priceMin: priceRange.min,
    priceMax: priceRange.max,
  })
  return matches
    .slice()
    .sort((a, b) => parseProductPrice(a) - parseProductPrice(b))
    .slice(0, 60)
}

async function callHF(token, model, messages, systemPrompt) {
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

  const serviceResult = buildServiceChatResult(lastMessage.content)
  if (serviceResult) {
    return res.status(200).json({
      ...serviceResult,
      ...(debug && { detectedIntent: { type: 'service', service: serviceResult.serviceAction } }),
    })
  }

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HF_TOKEN
  if (!token) {
    return res.status(500).json({
      message: 'Hugging Face chat not configured. Set HF_TOKEN or HUGGINGFACE_HF_TOKEN in Vercel.',
    })
  }

  const model = process.env.HUGGINGFACE_CHAT_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
  const systemPrompt = buildSystemPrompt(productSummary)

  try {
    const isProductIntent = shouldRunProductSearchFlow(lastMessage.content)
    let extractorRaw = null
    let extracted = null

    if (isProductIntent) {
      const extractorPrompt = `You are an intent extraction engine for a jewellery assistant.
Return ONLY valid JSON with no markdown and no extra text.
Schema:
{
  "intent": "product_search" | "general",
  "filters": {
    "categories": string[],
    "materials": string[],
    "stoneTags": string[],
    "priceRange": { "min": number | null, "max": number | null }
  }
}
Use only categories from: ${VALID_CATEGORIES.join(', ')}.
Use only materials from: ${VALID_MATERIALS.join(', ')}.
Use only stoneTags from: ${VALID_STONE_TAGS.join(', ')} (omit or use [] if not specified).
If the user is asking to browse/find/recommend products, set intent="product_search".
Users may write in English, Hindi, Hinglish, or transliterated text.
Normalize terms to the allowed category/material values.`

      extractorRaw = await callHF(token, model, messages, extractorPrompt)
      extracted = normalizeIntentPayload(extractJsonObject(extractorRaw) || {})
      extracted = mergeInferredStoneTags(extracted, lastMessage.content)
      extracted = mergeInferredSubtypes(extracted, lastMessage.content)
    }

    if (isProductIntent && extracted?.intent === 'product_search') {
      const matches = searchProductsFromIntent(productSummary, extracted)
      const polishPrompt = `You are a jewellery shopping assistant.
Create a concise, helpful response using ONLY the provided search results.
If no exact result matches, clearly state that and suggest closest available options from the list.
Do not invent products.`
      const polishUserMessage = `User query: ${lastMessage.content}
Filters: ${JSON.stringify(extracted.filters)}
Search results: ${JSON.stringify(matches)}`
      const polishRaw = await callHF(token, model, [{ role: 'user', content: polishUserMessage }], polishPrompt)
      if (!polishRaw) {
        return res.status(502).json({ message: 'No reply from model. Please try again.' })
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
        ...(debug && { rawMessage: polishRaw, extractorRaw, extractedIntent: extracted, searchResults: matches }),
      })
    }

    const rawMessage = await callHF(token, model, messages, systemPrompt)
    if (!rawMessage) {
      return res.status(502).json({ message: 'No reply from model. Please try again.' })
    }

    const result = buildChatResult({
      rawMessage,
      lastUserContent: lastMessage.content,
      previousMessages: messages.slice(0, -1),
      productSummary,
    })

    return res.status(200).json({
      ...result,
      ...(debug && {
        rawMessage,
        ...(extractorRaw && { extractorRaw }),
        ...(extracted && { extractedIntent: extracted }),
      }),
    })
  } catch (err) {
    console.error('Chat (HF) error:', err)
    return res.status(500).json({ message: err.message || 'Something went wrong.' })
  }
}
