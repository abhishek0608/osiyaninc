import { filterProductsByCriteria, parseProductPrice } from './product-filter.js'

const VALID_CATEGORIES = ['Rings', 'Earrings', 'Mangal Sutra', 'Necklaces', 'Bracelets', 'Bangles']
const CATEGORY_PATTERNS = [
  { value: 'Rings', regex: /\brings?\b/i },
  { value: 'Earrings', regex: /\bearrings?\b/i },
  { value: 'Mangal Sutra', regex: /\bmangal[\s-]*sutra\b/i },
  { value: 'Necklaces', regex: /\bnecklaces?\b/i },
  { value: 'Bracelets', regex: /\bbracelets?\b|\bbraclets?\b|\bbraclet\b/i },
  { value: 'Bangles', regex: /\bbangles?\b|\bkad[ae]s?\b|\bchoodi(y[ae]n)?s?\b|\bchudi(y[ae]n)?s?\b/i },
]
const MATERIAL_PATTERNS = [
  { value: 'gold', regex: /\bgold\b|\byellow gold\b|\bwhite gold\b|\brose gold\b/i },
  { value: 'silver', regex: /\bsilver\b|\bsterling\b|\boxidised\b|\boxidized\b/i },
]
const STONE_INFERENCE_PATTERNS = [
  { value: 'emerald', regex: /\bemerald(s)?\b|\bpanna\b/i },
  { value: 'ruby', regex: /\bruby|rubies\b|\bmanik\b/i },
  { value: 'diamond', regex: /\bdiamond(s)?\b|\bheer[ae]\b/i },
  { value: 'pearl', regex: /\bpearl(s)?\b|\bmoti\b/i },
  { value: 'kundan', regex: /\bkundan\b/i },
  { value: 'polki', regex: /\bpolki\b/i },
  { value: 'black-beads', regex: /\bblack[\s-]?beads?\b/i },
]
// Subtypes are finer-grained than categories (e.g. a "pendant" is a Necklace).
// These map common shopper terms to the `subtype` values stored on products.
const SUBTYPE_PATTERNS = [
  { value: 'pendant', regex: /\bpendants?\b/i },
  { value: 'jhumka', regex: /\bjhumk[ai]s?\b/i },
  { value: 'stud', regex: /\bstuds?\b/i },
  { value: 'solitaire', regex: /\bsolitaires?\b/i },
  { value: 'cuff', regex: /\bcuffs?\b|\bkadas?\b/i },
  { value: 'drop', regex: /\bdrops?\b|\bdanglers?\b|\bhoops?\b|\bchandeliers?\b/i },
  { value: 'statement-necklace', regex: /\bstatement[\s-]*necklaces?\b|\bchokers?\b|\bcollars?\b/i },
  { value: 'chain-bracelet', regex: /\bchain[\s-]*bracelets?\b/i },
  { value: 'open-ring', regex: /\bopen[\s-]*rings?\b/i },
  { value: 'multi-stone', regex: /\bmulti[\s-]*stones?\b/i },
]

export const VALID_SUBTYPES = [...new Set(SUBTYPE_PATTERNS.map((p) => p.value))]

export function inferSubtypesFromText(content) {
  if (typeof content !== 'string' || !content.trim()) return []
  return [
    ...new Set(
      SUBTYPE_PATTERNS.filter(({ regex }) => regex.test(content)).map(({ value }) => value)
    ),
  ]
}

export const SERVICE_INTENTS = [
  {
    id: 'full-pipeline',
    label: 'Complete product',
    cta: 'View services',
    href: '/services#cad',
    regex:
      /\b(complete\s+(product|piece|service)|full\s+(product|service|pipeline|manufacturing)|entire\s+(piece|jewellery|jewelry|process)|end[\s-]to[\s-]end(\s+service)?|turnkey(\s+jewellery|\s+jewelry)?|from\s+idea\s+to\s+(finish|delivery|product|piece)|from\s+(scratch|sketch|concept)\s+to\s+(finish|delivery|product|piece|wear)|cad\s*(to|,)\s*(wax|cast)|wax\s*(to|,)\s*cast|cad\s*,\s*wax\s*,\s*cast|all\s+(four\s+)?stages?|whole\s+(process|pipeline|journey)|full\s+service\s+from\s+cad|do\s+(everything|it\s+all)|handle\s+(everything|the\s+whole)|start\s+to\s+finish)\b/i,
    message:
      "Yes — we can take you from idea to a finished piece. Our team handles every stage: CAD design, wax prototype, casting in gold or silver, and final finishing with stone setting and hallmarking. Tell me what you have in mind — a reference image, your budget, the occasion — and I'll point you to the right starting step.",
  },
  {
    id: 'cad',
    label: 'CAD Design',
    href: '/services?service=cad&book=1#cad',
    regex:
      /\b(cad|computer[\s-]*aided|3d\s*(model|design|cad|render(ing)?)|(create|build|prepare|make|need|want|get)\s+(a\s+)?(new\s+)?cad(\s+design|\s+file|\s+model)?|new\s+cad|design\s+(from\s+)?scratch|tech(nical)?\s+drawing|render(ing)?|blueprint)\b/i,
    message:
      "Absolutely — we'd start with a CAD design. Send over a reference image (or just a description), your metal preference, and any design notes, and our Jaipur CAD team will turn it into a precise 3D model for your review before we move to wax and casting.",
  },
  {
    id: 'wax',
    label: 'Wax Prototyping',
    href: '/services?service=wax&book=1#wax',
    regex:
      /\b(wax|waxing|wax\s+model|wax\s+print|prototype|prototyping|3d\s*print(ed)?|model\s*print|printed\s+wax|carve(d)?\s+wax|sample\s+piece|tryout)\b/i,
    message:
      "Sure — once we have a CAD file we can print or carve the wax model so you can see and feel the piece before casting. If you don't have a CAD yet, no worries, we'll create that first.",
  },
  {
    id: 'casting',
    label: 'Casting',
    href: '/services?service=casting&book=1#casting',
    regex:
      /\b(cast(ing)?s?|lost[\s-]*wax|investment\s*cast|metal\s*pour|pour(ing)?\s+(gold|silver)|melt(ed)?\s+(in)?to\s+(gold|silver)|cast\s+in\s+(gold|silver))\b/i,
    message:
      "Yes, we cast in gold or silver once the design and wax are approved. Share the metal, purity, estimated weight, and quantity and the team will prep the casting request for you.",
  },
  {
    id: 'final',
    label: 'Final Product',
    href: '/services?service=final&book=1#final',
    regex:
      /\b(final\s*(product|piece|finish(ing)?)|finished\s+piece|ready[\s-]to[\s-]wear|finishing|polish(ing)?|stone\s*setting|setting\s+stones?|hallmark(ing)?|dispatch|delivery|filing|buffing)\b/i,
    message:
      "Happy to help with finishing — that's filing, polishing, stone setting, quality checks, hallmarking, and delivery once your casting is done.",
  },
]

const CHAT_PROVIDER_ALIASES = {
  auto: 'auto',
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  hf: 'huggingface',
  huggingface: 'huggingface',
  'hugging-face': 'huggingface',
  grok: 'grok',
  xai: 'grok',
}

export function normalizeChatProvider(input) {
  const key = String(input || '')
    .trim()
    .toLowerCase()
  return CHAT_PROVIDER_ALIASES[key] || null
}

export function pickChatProvider({ requestedProvider, envProvider, keys }) {
  const requested = normalizeChatProvider(requestedProvider)
  const fromEnv = normalizeChatProvider(envProvider)
  const preferred = requested || fromEnv || 'auto'

  if (preferred !== 'auto') return preferred

  const ordered = ['openai', 'anthropic', 'huggingface', 'grok']
  for (const provider of ordered) {
    if (keys?.[provider]) return provider
  }
  return null
}

export function isDebugEnabled(req, body) {
  if (req?.query?.debug === 'false' || body?.debug === false) return false
  return true
}

export function buildSystemPrompt(productSummary, options = {}) {
  const { includeMultiCategoryFilterExample = false } = options
  let prompt = `You are Priya, a warm, knowledgeable jewellery consultant at Kiana Jewels in Jaipur. You've spent years helping customers find pieces they love. Talk like a real person having a friendly chat — never robotic, never templated. Use natural contractions (I'm, you'll, we've, don't, it's). Match the customer's energy: if they're brief, you're brief; if they're chatty, you can be warmer and offer more.

About Kiana (use these facts naturally — don't dump them in one go):
- Handcrafted in Jaipur by master artisans (your team).
- 9 carat BIS-hallmarked gold, conflict-free stones, recycled precious metals.
- Categories we sell: Rings, Earrings, Mangal Sutra, Necklaces, Bracelets.
- Materials: yellow gold, white gold, rose gold, oxidised silver.
- Services we offer (this is important — speak about these confidently):
  • CAD Design — turning a reference or idea into a precise 3D model.
  • Wax Prototyping — 3D-printed or hand-carved wax for approval before casting.
  • Casting — pouring the approved wax into gold or silver.
  • Final Product — finishing, polishing, stone setting, hallmarking, delivery.
  • Complete Product (full pipeline) — the entire journey from idea to a finished piece.
- Free pan-India shipping, lifetime exchange at full gold value, insured delivery.
- Location: SEZ-2, Sitapura Industrial Area, Jaipur – 302022, Rajasthan. Mon–Sat 10am–8pm, Sunday 11am–6pm.
- Email: sales@kianajewels.in | Phone: +91 92163 99116

How to respond — think like ChatGPT, not a script:
- Understand the customer's INTENT, not just their literal words. "Do you make custom rings?", "Can you build me a pendant?", "I have a sketch I want made", "How does this work?" are all about our services — answer the underlying question naturally.
- For service-style questions (anything about making, designing, customising, prototyping, casting, polishing, getting a piece made from a photo / sketch / idea):
  • Say yes warmly and briefly describe how we'd help.
  • Mention the relevant service(s) by name in plain language (CAD design, wax prototype, casting, final finishing, or the full pipeline).
  • Ask one helpful follow-up — a reference photo? metal preference? rough budget? the occasion?
  • Don't recite a brochure. Two or three sentences is usually right.
- For product/browse questions: recommend specific pieces from our collection by name with their prices. Speak like a stylist, not a catalogue.
- For general chat, greetings, store info, policies, occasions, gifting advice — answer warmly and helpfully, and gently nudge toward what we can do for them.
- For anything completely unrelated to jewellery: lightly steer back ("Ha, a bit outside my lane — but if you're after something in gold or silver, I'm all yours.").

Tone:
- Conversational and warm. Phrases like "Honestly, you'll love this one", "Great choice!", "What's the occasion, if you don't mind me asking?" work well — use them sparingly, not in every message.
- Keep replies short. A few sentences. No bullet-point walls unless the customer explicitly asks for a list.
- Don't use markdown links or placeholder URLs like [here](#). Say "you can browse the Collections page" or "the Services page has more detail".
- Never sound stiff, corporate, or canned. If a similar question came up earlier, phrase your answer differently this time.

Filter line (machine-readable, KEEP this exactly when relevant):
When the customer is asking about products by category (Rings, Earrings, Mangal Sutra, Necklaces, Bracelets) or material (gold, silver), end your reply with one line: FILTERS: <comma-separated values>. Use the exact case-sensitive category names listed above and the materials gold / silver. Example: FILTERS: Rings, gold.`
  if (includeMultiCategoryFilterExample) {
    prompt += ' Example: FILTERS: Earrings, Necklaces.'
  }
  prompt += ` Omit the FILTERS line for service questions, general chat, or anything that isn't a product browse.`

  if (Array.isArray(productSummary) && productSummary.length > 0) {
    const lines = productSummary
      .map((p) => `- ${p.title} (${p.category}, ${p.material}): ${p.price}. ${p.description || ''}`.trim())
      .join('\n')
    prompt += '\n\nOur current collection (mention specific pieces naturally in conversation with their prices, e.g. "The Étoile Ring in 18k gold is $1,831 — absolutely stunning"):\n' + lines
    prompt += '\n\nWhen recommending products, mention specific pieces by name with prices — don\'t just speak in generics. If the user asks for a specific category (e.g. bracelets, rings), only mention pieces from that category. Make recommendations feel personal, not like a catalogue listing.'
  }
  return prompt
}

export function detectServiceIntent(content) {
  if (typeof content !== 'string' || !content.trim()) return null
  const text = content.trim()
  return SERVICE_INTENTS.find((service) => service.regex.test(text)) || null
}

export function getServiceIntentById(serviceId) {
  if (typeof serviceId !== 'string' || !serviceId.trim()) return null
  return SERVICE_INTENTS.find((service) => service.id === serviceId.trim()) || null
}

export function buildServiceChatResult(content) {
  const service = detectServiceIntent(content)
  if (!service) return null
  return buildServiceChatResultFromIntent(service)
}

export function buildServiceChatResultFromIntent(service) {
  if (!service) return null
  return {
    message: service.message,
    serviceAction: {
      id: service.id,
      label: service.label,
      href: service.href,
      cta: service.cta || `Book ${service.label}`,
    },
    filters: null,
    results: [],
  }
}

function parseFiltersFromMessage(rawMessage) {
  const match = rawMessage.match(/(?:^|\n)\s*FILTERS:\s*(.+?)(?:\n|$)/i)
  if (!match) return { message: rawMessage.trim(), filters: null, rawFilters: null }
  const line = match[1].trim()
  const parts = line.split(',').map((p) => p.trim())
  const categories = []
  const materials = []
  for (const p of parts) {
    const lower = p.toLowerCase()
    const cat = VALID_CATEGORIES.find((c) => c.toLowerCase() === lower)
    if (cat) categories.push(cat)
    else if (lower === 'gold' || lower === 'silver') materials.push(lower)
  }
  const message = rawMessage.replace(/(?:^|\n)\s*FILTERS:\s*.+?(?:\n|$)/i, '\n').trim()
  const filters =
    categories.length || materials.length
      ? { categories: [...new Set(categories)], materials: [...new Set(materials)] }
      : null
  return { message, filters, rawFilters: line || null }
}

function inferFiltersFromUserMessage(content) {
  if (typeof content !== 'string' || !content.trim()) return null
  const categories = CATEGORY_PATTERNS.filter(({ regex }) => regex.test(content)).map(
    ({ value }) => value
  )
  const materials = MATERIAL_PATTERNS.filter(({ regex }) => regex.test(content)).map(
    ({ value }) => value
  )
  const stoneTags = STONE_INFERENCE_PATTERNS.filter(({ regex }) => regex.test(content)).map(
    ({ value }) => value
  )
  const subtypes = inferSubtypesFromText(content)
  if (!categories.length && !materials.length && !stoneTags.length && !subtypes.length) return null
  return {
    categories: [...new Set(categories)],
    materials: [...new Set(materials)],
    stoneTags: [...new Set(stoneTags)],
    subtypes: [...new Set(subtypes)],
  }
}

function inferFiltersFromConversation(messages) {
  if (!Array.isArray(messages) || !messages.length) return null
  const categories = []
  const materials = []
  const stoneTags = []
  const subtypes = []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg?.role !== 'user' || typeof msg?.content !== 'string') continue
    const inferred = inferFiltersFromUserMessage(msg.content)
    if (!inferred) continue
    if (!categories.length && inferred.categories.length) categories.push(...inferred.categories)
    if (!materials.length && inferred.materials.length) materials.push(...inferred.materials)
    if (!stoneTags.length && inferred.stoneTags?.length) stoneTags.push(...inferred.stoneTags)
    if (!subtypes.length && inferred.subtypes?.length) subtypes.push(...inferred.subtypes)
    if (categories.length && materials.length && stoneTags.length && subtypes.length) break
  }
  if (!categories.length && !materials.length && !stoneTags.length && !subtypes.length) return null
  return { categories, materials, stoneTags, subtypes }
}

function mergeFilters(modelFilters, inferredFilters, conversationFilters) {
  if (!modelFilters && !inferredFilters && !conversationFilters) return null
  if (!modelFilters && !conversationFilters) return inferredFilters
  if (!inferredFilters && !conversationFilters) return modelFilters

  const inferredCategories = inferredFilters?.categories || []
  const inferredMaterials = inferredFilters?.materials || []
  const inferredStoneTags = inferredFilters?.stoneTags || []
  const inferredSubtypes = inferredFilters?.subtypes || []
  const contextCategories = conversationFilters?.categories || []
  const contextMaterials = conversationFilters?.materials || []
  const contextStoneTags = conversationFilters?.stoneTags || []
  const contextSubtypes = conversationFilters?.subtypes || []
  const modelCategories = modelFilters?.categories || []
  const modelMaterials = modelFilters?.materials || []
  const modelStoneTags = modelFilters?.stoneTags || []
  const modelSubtypes = modelFilters?.subtypes || []
  const hasUserDerivedIntent =
    inferredCategories.length ||
    inferredMaterials.length ||
    inferredStoneTags.length ||
    inferredSubtypes.length ||
    contextCategories.length ||
    contextMaterials.length ||
    contextStoneTags.length ||
    contextSubtypes.length

  return {
    categories: inferredCategories.length
      ? inferredCategories
      : contextCategories.length
        ? contextCategories
        : hasUserDerivedIntent
          ? []
          : modelCategories,
    materials: inferredMaterials.length
      ? inferredMaterials
      : contextMaterials.length
        ? contextMaterials
        : hasUserDerivedIntent
          ? []
          : modelMaterials,
    stoneTags: inferredStoneTags.length
      ? inferredStoneTags
      : contextStoneTags.length
        ? contextStoneTags
        : hasUserDerivedIntent
          ? []
          : modelStoneTags,
    subtypes: inferredSubtypes.length
      ? inferredSubtypes
      : contextSubtypes.length
        ? contextSubtypes
        : hasUserDerivedIntent
          ? []
          : modelSubtypes,
  }
}

function parseAmountToken(token) {
  if (typeof token !== 'string') return null
  const cleaned = token.toLowerCase().replace(/[,₹$\s]/g, '')
  if (!cleaned) return null
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|l|lac|lakh)?$/)
  if (!match) return null
  const value = Number(match[1])
  if (Number.isNaN(value)) return null
  const suffix = match[2]
  if (suffix === 'k') return Math.round(value * 1000)
  if (suffix === 'l' || suffix === 'lac' || suffix === 'lakh') return Math.round(value * 100000)
  return Math.round(value)
}

function formatBudgetLabel(minPrice, maxPrice) {
  if (minPrice != null && maxPrice != null) {
    return `between $${minPrice.toLocaleString('en-US')} and $${maxPrice.toLocaleString('en-US')}`
  }
  if (maxPrice != null) return `under $${maxPrice.toLocaleString('en-US')}`
  if (minPrice != null) return `above $${minPrice.toLocaleString('en-US')}`
  return ''
}

function extractPriceConstraintsFromMessage(content) {
  if (typeof content !== 'string' || !content.trim()) return null
  const betweenMatch = content.match(
    /\bbetween\s+[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)\s*(?:to|and|-)\s*[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)\b/i
  )
  if (betweenMatch) {
    const first = parseAmountToken(betweenMatch[1])
    const second = parseAmountToken(betweenMatch[2])
    if (first != null && second != null) {
      return first <= second ? { min: first, max: second } : { min: second, max: first }
    }
  }

  const fromToMatch = content.match(
    /\bfrom\s+[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)\s+to\s+[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)\b/i
  )
  if (fromToMatch) {
    const first = parseAmountToken(fromToMatch[1])
    const second = parseAmountToken(fromToMatch[2])
    if (first != null && second != null) {
      return first <= second ? { min: first, max: second } : { min: second, max: first }
    }
  }

  const direct = content.match(
    /\b(?:under|below|less than|upto|up to|max|maximum|within)\s*[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)/i
  )
  if (direct) {
    const max = parseAmountToken(direct[1])
    if (max != null) return { min: null, max }
  }

  const suffix = content.match(
    /[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)\s*(?:or less|and below|or under)\b/i
  )
  if (suffix) {
    const max = parseAmountToken(suffix[1])
    if (max != null) return { min: null, max }
  }

  const minOnly = content.match(
    /\b(?:above|over|more than|greater than|at least)\s*[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)/i
  )
  if (minOnly) {
    const min = parseAmountToken(minOnly[1])
    if (min != null) return { min, max: null }
  }

  // Handle shorthand prompts like "show silver products 3000" as "under 3000".
  // Only apply this fallback when user is clearly browsing products/materials.
  const hasProductIntent =
    /\b(products?|items?|pieces?|show|find|looking|search)\b/i.test(content) ||
    /\b(rings?|earrings?|necklaces?|bracelets?|mangal[\s-]*sutra|gold|silver|sterling)\b/i.test(
      content
    )
  if (hasProductIntent) {
    const amountMatches = [...content.matchAll(/[₹$]?\s*([\d,.]+(?:\s*[kKlL])?)\b/gi)]
    if (amountMatches.length === 1) {
      const max = parseAmountToken(amountMatches[0][1])
      if (max != null) return { min: null, max }
    }
  }

  return null
}

function formatProductLine(product) {
  const title = product?.title || 'Untitled piece'
  const category = product?.category || 'Jewellery'
  const material = product?.material || 'material'
  const price = product?.price ? `: ${product.price}` : ''
  const description = product?.description ? ` ${String(product.description).trim()}` : ''
  return `- ${title} (${category}, ${material})${price}.${description}`
}

function buildProductReply(productSummary, filters, priceRange = null) {
  if (!Array.isArray(productSummary) || !productSummary.length || !filters) return null
  const minPrice = priceRange?.min ?? null
  const maxPrice = priceRange?.max ?? null
  const hasPriceConstraint = minPrice != null || maxPrice != null
  const matches = filterProductsByCriteria(productSummary, {
    categories: filters.categories,
    materials: filters.materials,
    stoneTags: filters.stoneTags,
    subtypes: filters.subtypes,
    priceMin: minPrice,
    priceMax: maxPrice,
  })
  if (matches.length) {
    const topMatches = matches.slice(0, 4).map(formatProductLine).join('\n')
    if (hasPriceConstraint) {
      return `Here are a few options ${formatBudgetLabel(minPrice, maxPrice)} from our current collection:\n\n${topMatches}`
    }
    return `Here are a few options from our current collection:\n\n${topMatches}`
  }

  if (Array.isArray(filters.stoneTags) && filters.stoneTags.length) {
    const withoutStone = filterProductsByCriteria(productSummary, {
      categories: filters.categories,
      materials: filters.materials,
      priceMin: minPrice,
      priceMax: maxPrice,
    })
    if (withoutStone.length) {
      const top = withoutStone.slice(0, 4).map(formatProductLine).join('\n')
      return `I couldn't find ${filters.stoneTags.join(
        ' and '
      )} in that exact mix. Here are some options in the same category:\n\n${top}`
    }
  }

  if (hasPriceConstraint) {
    const sameScopeNoBudget = filterProductsByCriteria(productSummary, {
      categories: filters.categories,
      materials: filters.materials,
      stoneTags: filters.stoneTags,
      subtypes: filters.subtypes,
    })
    if (sameScopeNoBudget.length) {
      const alternatives = sameScopeNoBudget
        .slice()
        .sort((a, b) => parseProductPrice(a) - parseProductPrice(b))
        .slice(0, 3)
      const lines = alternatives.map(formatProductLine).join('\n')
      return `I couldn't find any options ${formatBudgetLabel(
        minPrice,
        maxPrice
      )} in that selection right now. The closest available options are:\n\n${lines}`
    }
    return `I couldn't find any options ${formatBudgetLabel(
      minPrice,
      maxPrice
    )} in our current collection right now.`
  }

  const categoryOnlyFilters = {
    categories: Array.isArray(filters.categories) ? filters.categories : [],
  }
  const categoryMatches = filterProductsByCriteria(productSummary, categoryOnlyFilters)
  if (categoryMatches.length && Array.isArray(filters.materials) && filters.materials.length) {
    const topAlternatives = categoryMatches.slice(0, 3).map(formatProductLine).join('\n')
    const requestedMaterial = filters.materials.join(' or ')
    return `I couldn't find ${requestedMaterial} options in that category right now. Here are a few pieces from the same category:\n\n${topAlternatives}`
  }

  if (categoryMatches.length && Array.isArray(filters.stoneTags) && filters.stoneTags.length) {
    const topAlternatives = categoryMatches.slice(0, 3).map(formatProductLine).join('\n')
    const requestedStones = filters.stoneTags.join(' or ')
    return `I couldn't find ${requestedStones} in that category right now. Here are a few pieces from the same category:\n\n${topAlternatives}`
  }

  return `I couldn't find an exact match in our current collection right now. Please check the Collections section for the latest additions.`
}

function resolveResponseFilters(productSummary, filters, priceRange = null) {
  if (!filters) return null
  const categories = Array.isArray(filters.categories) ? [...filters.categories] : []
  const materials = Array.isArray(filters.materials) ? [...filters.materials] : []
  const stoneTags = Array.isArray(filters.stoneTags) ? [...filters.stoneTags] : []
  const subtypes = Array.isArray(filters.subtypes) ? [...filters.subtypes] : []
  if (!categories.length && Array.isArray(productSummary) && productSummary.length) {
    const matches = filterProductsByCriteria(productSummary, {
      categories: filters.categories,
      materials: filters.materials,
      stoneTags: filters.stoneTags,
      subtypes: filters.subtypes,
      priceMin: priceRange?.min ?? null,
      priceMax: priceRange?.max ?? null,
    })
    if (matches.length) {
      const inferredCategories = [...new Set(matches.map((p) => p?.category).filter(Boolean))]
      categories.push(...inferredCategories)
    }
  }
  if (!categories.length && !materials.length && !stoneTags.length && !subtypes.length) return null
  return {
    categories: [...new Set(categories)],
    materials: [...new Set(materials)],
    stoneTags: [...new Set(stoneTags)],
    subtypes: [...new Set(subtypes)],
  }
}

export function buildChatResult({ rawMessage, lastUserContent, previousMessages, productSummary, intent }) {
  const serviceResult = buildServiceChatResult(lastUserContent)
  if (serviceResult) return { ...serviceResult, rawFilters: null }

  const { message, filters: modelFilters, rawFilters } = parseFiltersFromMessage(rawMessage)

  // For general conversation (greetings, clarifying questions, small talk),
  // skip product filtering entirely and return the LLM's reply as-is.
  if (intent === 'general') {
    return { message, filters: null, rawFilters }
  }

  const inferredFilters = inferFiltersFromUserMessage(lastUserContent)
  const conversationFilters = inferFiltersFromConversation(previousMessages)
  const filters = mergeFilters(modelFilters, inferredFilters, conversationFilters)
  const priceRange = extractPriceConstraintsFromMessage(lastUserContent)
  const finalMessage = buildProductReply(productSummary, filters, priceRange) || message
  const responseFilters = resolveResponseFilters(productSummary, filters, priceRange)
  return { message: finalMessage, filters: responseFilters, rawFilters }
}
