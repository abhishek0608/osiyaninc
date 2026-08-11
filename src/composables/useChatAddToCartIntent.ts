import type { Ref } from 'vue'
import type { Product } from '../data/products'
import type { ChatMessage } from './useChat'

const MAX_AUTOMATIC_ADD_CANDIDATES = 3

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseAddQuantity(text: string) {
  const lower = text.toLowerCase()
  const withKeyword =
    lower.match(/\b(?:add|buy|get|take|order)\s+(\d+)\b/) ||
    lower.match(/\b(\d+)\s*(?:qty|quantity|pieces?|items?)\b/)
  if (withKeyword) {
    const qty = Number(withKeyword[1])
    if (Number.isFinite(qty) && qty > 0) return Math.floor(qty)
  }
  return 1
}

function parseCandidateIndex(text: string) {
  const lower = text.toLowerCase()
  if (/\bfirst\b|\b1st\b|\b#1\b/.test(lower)) return 0
  if (/\bsecond\b|\b2nd\b|\b#2\b/.test(lower)) return 1
  if (/\bthird\b|\b3rd\b|\b#3\b/.test(lower)) return 2
  const numeric = lower.match(/\b(?:option|item|product|no)\s*(\d+)\b/)
  if (numeric) {
    const idx = Number(numeric[1]) - 1
    if (Number.isFinite(idx) && idx >= 0) return idx
  }
  return null
}

function isAddIntent(text: string) {
  return /\b(add|cart|buy|get|take|order)\b/i.test(text)
}

function isAddAllIntent(text: string) {
  return /\b(add|buy|get|order)\s+all\b/i.test(text) || /\ball\b/.test(text.toLowerCase())
}

function matchesProductName(message: string, productTitle: string) {
  const needle = normalizeText(message)
  const title = normalizeText(productTitle)
  if (!needle || !title) return false
  if (needle.includes(title)) return true
  const tokens = title.split(' ').filter((t) => t.length >= 4)
  return tokens.some((t) => needle.includes(t))
}

type AddIntentDeps = {
  messages: Ref<ChatMessage[]>
  resolveCandidates: () => Promise<Product[]>
  addToCart: (product: Product, qty?: number) => Promise<void>
}

export function createAddToCartIntentHandler(deps: AddIntentDeps) {
  const { messages, resolveCandidates, addToCart } = deps

  return async function tryHandleAddIntent(text: string) {
    if (!isAddIntent(text)) return false
    const candidates = await resolveCandidates()
    if (!candidates.length) {
      messages.value.push({
        role: 'assistant',
        content: 'I need product results first. Ask to show products, then I can add items to cart.',
      })
      return true
    }
    if (candidates.length > MAX_AUTOMATIC_ADD_CANDIDATES) {
      messages.value.push({
        role: 'assistant',
        content: `I found ${candidates.length} results. Please narrow it down to a few items before adding to cart.`,
      })
      return true
    }

    const qty = parseAddQuantity(text)
    if (isAddAllIntent(text)) {
      await Promise.all(candidates.map((product) => addToCart(product, qty)))
      messages.value.push({
        role: 'assistant',
        content: `Added ${qty} each of ${candidates.length} items to your cart.`,
      })
      return true
    }

    if (candidates.length === 1) {
      const only = candidates[0]
      if (!only) return true
      await addToCart(only, qty)
      messages.value.push({
        role: 'assistant',
        content: `Added ${qty} x ${only.title} to your cart.`,
      })
      return true
    }

    const index = parseCandidateIndex(text)
    if (index != null && candidates[index]) {
      const target = candidates[index]
      await addToCart(target, qty)
      messages.value.push({
        role: 'assistant',
        content: `Added ${qty} x ${target.title} to your cart.`,
      })
      return true
    }

    const titleMatches = candidates.filter((p) => matchesProductName(text, p.title))
    if (titleMatches.length === 1) {
      const matched = titleMatches[0]
      if (!matched) return true
      await addToCart(matched, qty)
      messages.value.push({
        role: 'assistant',
        content: `Added ${qty} x ${matched.title} to your cart.`,
      })
      return true
    }

    messages.value.push({
      role: 'assistant',
      content:
        'Please specify which item to add (first, second, third, or exact product name).',
    })
    return true
  }
}
