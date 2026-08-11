import { applyCors, handlePreflight } from '../server/api/cors.js'
import { getCatalogProducts, applyS3Images } from '../server/api/products-source.js'
import { toApiProduct } from '../server/api/products-source.js'
import { prisma } from '../server/api/db.js'
import {
  isImageEmbeddingConfigured,
  isImageVectorSearchEnabled,
  imageEmbeddingProvider,
  generateImageEmbeddingFromDataUrl,
  imageVectorSearchProductIds,
  IMAGE_VECTOR_SIMILARITY_THRESHOLD,
  IMAGE_VECTOR_RELAXED_THRESHOLD,
  IMAGE_VECTOR_TRUST_THRESHOLD,
} from '../server/api/image-embedding.js'

const OPENAI_DEFAULT_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const VECTOR_SIMILARITY_THRESHOLD = Number(process.env.VECTOR_SIMILARITY_THRESHOLD) || 0.7
/** Second-pass floor when strict vector search returns 0 hits (bad vision text vs catalog still close in space). */
const VECTOR_RELAXED_THRESHOLD = Number(process.env.VECTOR_RELAXED_THRESHOLD) || 0.58
const HF_DEFAULT_MODEL = process.env.HUGGINGFACE_VISION_MODEL || 'Qwen/Qwen2.5-VL-7B-Instruct'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const VALID_CATEGORIES = ['Rings', 'Earrings', 'Mangal Sutra', 'Necklaces', 'Bracelets', 'Bangles']
const VALID_MATERIALS = ['gold', 'silver']
const VALID_SUBTYPES = [
  'solitaire',
  'cluster',
  'multi-stone',
  'open-ring',
  'pendant',
  'statement-necklace',
  'cuff',
  'chain-bracelet',
  'drop',
  'stud',
  'mangal-sutra',
  'jhumka',
]
const VALID_STYLE_TAGS = ['bridal', 'classic', 'minimal', 'modern', 'traditional', 'statement', 'everyday', 'stackable']
const VALID_STONE_TAGS = ['diamond', 'kundan', 'polki', 'pearl', 'emerald', 'ruby', 'black-beads', 'stone']
const VISION_SCHEMA_PROMPT = `You are a jewellery visual classifier.
Return only valid JSON with no markdown and no explanation.

Schema:
{
  "category": "Rings" | "Earrings" | "Mangal Sutra" | "Necklaces" | "Bracelets" | null,
  "subtype": string | null,
  "materials": ("gold" | "silver")[],
  "styleTags": ("bridal" | "classic" | "minimal" | "modern" | "traditional" | "statement" | "everyday" | "stackable")[],
  "stoneTags": ("diamond" | "kundan" | "polki" | "pearl" | "emerald" | "ruby" | "black-beads" | "stone")[],
  "prominentStone": "diamond" | "kundan" | "polki" | "pearl" | "emerald" | "ruby" | "black-beads" | "stone" | null,
  "estimatedMetalWeightGrams": number | null,
  "estimatedStoneWeightCt": number | null,
  "estimatedPriceMin": number | null,
  "estimatedPriceMax": number | null,
  "pricingNotes": string,
  "notes": string
}

Subtype rules:
- If category is "Rings", subtype must be one of: "solitaire", "cluster", "multi-stone", "open-ring", null
- If category is "Earrings", subtype must be one of: "stud", "drop", "jhumka", null
- If category is "Necklaces", subtype must be one of: "pendant", "statement-necklace", null
- If category is "Bracelets", subtype must be one of: "cuff", "chain-bracelet", null
- If category is "Mangal Sutra", subtype must be "mangal-sutra" or null

Important constraints:
- Never use an earring subtype for a ring.
- Never use a ring subtype for an earring.
- If uncertain, return "subtype": null.
- Prefer structural subtype over decorative motif.
- Rings with one dominant center stone should be classified as "solitaire".
- Rings with a halo or a clustered top should be classified as "cluster", not "solitaire".
- Rings with pavé, many small diamonds across the head/band, or repeated accent stones should be classified as "multi-stone".
- Map white gold, yellow gold, and rose gold to "gold".
- Use "silver" only when the jewellery clearly appears to be sterling silver, oxidised silver, or casual silver jewellery.
- For fine-jewellery engagement or bridal rings with white metal, prefer "gold" over "silver" unless silver is explicit.
- CRITICAL — Mangal Sutra: Only use category "Mangal Sutra" if you clearly see small round black beads on the chain or near the pendant. Plain gold chains, nameplates, or diamond-only chains without black beads are NEVER Mangal Sutra — use "Necklaces" or "Bracelets" instead.
- CRITICAL — Personalized jewellery: If you see engraved or cut-out letters, initials, monograms, or a nameplate (e.g. "A & H", "&" between letters), classify as "Bracelets" (subtype "chain-bracelet" or "cuff" if it is wrist-sized with a clasp) or "Necklaces" (subtype "pendant") depending on length and how it is worn. Never call this Mangal Sutra unless black beads are also visible.
- CRITICAL: If the necklace has any black beads (small round black beads) anywhere on the chain or pendant area, it is a Mangal Sutra. Always set category to "Mangal Sutra" and subtype to "mangal-sutra" in this case, never "Necklaces".
- If black beads are visible in the design, always include "black-beads" in stoneTags.
- Use notes for motif and design details like leaf, floral, marquise, bypass, or cluster setting.
- CRITICAL — Earrings: Clear or translucent silicone / plastic butterfly or clutch backs behind the post are NOT pearls. Never use stoneTags "pearl" for earring backs; only for actual round pearl gemstones.
- CRITICAL — Earrings: If the design has a curved bar, J-shaped hoop, twin arched wires, or the ornament clearly extends below the earlobe (not a flat single stud on the lobe), subtype must be "drop", not "stud".
- CRITICAL — Colored gemstones (stoneTags): Classify by visible gem color and cut, not only by small white accent stones.
  - A clearly green center or main stone (emerald-cut, rectangular/step-cut green, vivid or deep green) → include "emerald" in stoneTags. Also include "diamond" only if you see separate white/clear brilliant accents or pavé (both can apply).
  - Rich red/pink-red main stone → include "ruby".
  - Cream/white spherical nacre → "pearl". Do not use "stone" alone when the main gem color is clearly green or red — use emerald or ruby.
  - Use "stone" only for generic/unclear colored gems when you cannot tell emerald vs tourmaline vs other.
- prominentStone: the single visually dominant gem — the main center or largest focal stone (e.g. a green emerald center with diamond pavé shoulders → prominentStone "emerald", stoneTags include both "emerald" and "diamond"). If there is no clear dominant stone or the piece is plain metal, use null. Never set prominentStone to a tiny accent-only type when a larger center gem is visible.
- When possible, estimate likely metal weight in grams and stone weight in carats from the visible design.
- When possible, provide a rough price range in INR in estimatedPriceMin and estimatedPriceMax.
- Keep price estimates conservative and internally consistent with the metal and stone estimates.

Examples:
1. Open ring with leaf-shaped diamond clusters:
{"category":"Rings","subtype":"open-ring","materials":["gold"],"styleTags":["modern","minimal"],"stoneTags":["diamond"],"prominentStone":"diamond","notes":"Open ring with leaf-like marquise diamond clusters."}

2. Solitaire ring:
{"category":"Rings","subtype":"solitaire","materials":["gold"],"styleTags":["bridal","classic"],"stoneTags":["diamond"],"prominentStone":"diamond","notes":"Single dominant center diamond ring."}

3. Diamond stud earrings:
{"category":"Earrings","subtype":"stud","materials":["gold"],"styleTags":["minimal"],"stoneTags":["diamond"],"prominentStone":"diamond","notes":"Diamond stud earrings."}

4. Traditional mangal sutra with black bead accents and pendant:
{"category":"Mangal Sutra","subtype":"mangal-sutra","materials":["gold"],"styleTags":["traditional","bridal"],"stoneTags":["black-beads"],"prominentStone":"black-beads","notes":"Gold mangal sutra with black bead chain accents and a pendant motif."}

5. Gold necklace with floral pendant and black beads on chain:
{"category":"Mangal Sutra","subtype":"mangal-sutra","materials":["gold"],"styleTags":["traditional","bridal"],"stoneTags":["black-beads"],"prominentStone":"black-beads","notes":"Gold mangal sutra with floral/lotus pendant and black bead accents — classified as Mangal Sutra due to black beads."}

6. Gold ring with a green rectangular center gem and small white stones on the band:
{"category":"Rings","subtype":"multi-stone","materials":["gold"],"styleTags":["modern","statement"],"stoneTags":["emerald","diamond"],"prominentStone":"emerald","notes":"Emerald-cut or rectangular green center stone with diamond pavé or accent diamonds on shoulders."}`
const PRICING_RESPONSE_PROMPT = `You are a jewellery pricing assistant.
Use the uploaded image and the provided detected attributes to write a natural pricing estimate in plain English.

Rules:
- Write like a helpful expert, not like a JSON formatter.
- Always price in USD using the "$" symbol.
- Never use INR, ₹, "Rs.", or any non-USD currency.
- Only mention stones, center stones, diamond quality, or lab-grown/natural differences if they are actually relevant from the image or user assumptions.
- If the item appears to have no visible stones, do not discuss carat size or diamond quality.
- Give a broad estimated range first.
- Then give a narrower best-guess range if possible.
- Mention the biggest factors that could change the price, but only the relevant ones.
- Be honest that this is a visual estimate and final pricing depends on specs.
- Do not mention database prices or catalog matches.
- Stay consistent with the detected attributes. If detected subtype says "multi-stone", do not describe it as a plain gold ring with no visible stones unless the image clearly contradicts the detection.
- If the image looks like a ring, keep the estimate in a realistic USD ring-pricing range.
- Keep the answer concise and natural, similar to a strong ChatGPT answer.`

function safeJsonParse(input) {
  if (!input) return {}
  if (typeof input === 'object') return input
  try {
    return JSON.parse(input)
  } catch {
    return {}
  }
}

function extractJsonObject(text) {
  if (typeof text !== 'string') return null
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  try {
    return JSON.parse(text.slice(first, last + 1))
  } catch {
    return null
  }
}

function toArray(values) {
  return Array.isArray(values)
    ? values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    : []
}

function toPositiveNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

function normalizeCategory(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (/\bearrings?\b|\bstuds?\b|\bjhumk/.test(raw)) return 'Earrings'
  if (/\brings?\b|\bsolitaire\b|\bband\b/.test(raw)) return 'Rings'
  if (/\bmangal/.test(raw)) return 'Mangal Sutra'
  if (/\bnecklaces?\b|\bpendant\b|\bchoker\b|\bcollar\b/.test(raw)) return 'Necklaces'
  // Checked before Bracelets so a rigid bangle/kada is not swept into the
  // bracelet bucket; only the open-cuff wording stays with Bracelets.
  if (/\bbangles?\b|\bkad[ae]s?\b|\bchudi(y[ae]n)?s?\b/.test(raw)) return 'Bangles'
  if (/\bbracelets?\b|\bcuff\b/.test(raw)) return 'Bracelets'
  return VALID_CATEGORIES.find((item) => item.toLowerCase() === raw) || null
}

function normalizeMaterial(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (raw.includes('silver') || raw.includes('sterling') || raw.includes('oxid')) return 'silver'
  if (raw.includes('gold') || raw.includes('rose') || raw.includes('yellow') || raw.includes('white')) return 'gold'
  return VALID_MATERIALS.includes(raw) ? raw : null
}

function normalizeSubtype(value, category = null) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  const aliases = {
    halo: 'cluster',
    engagement: 'solitaire',
    cluster: 'cluster',
    clustered: 'cluster',
    pave: 'multi-stone',
    pavé: 'multi-stone',
    'multi-stone': 'multi-stone',
    hoop: 'drop',
    chandelier: 'drop',
    pendant: 'pendant',
    necklace: category === 'Mangal Sutra' ? 'mangal-sutra' : 'statement-necklace',
    mangalsutra: 'mangal-sutra',
    mangal: 'mangal-sutra',
    kada: 'cuff',
    bangle: 'cuff',
    cuff: 'cuff',
    link: 'chain-bracelet',
    chain: 'chain-bracelet',
    collar: 'statement-necklace',
    layered: 'statement-necklace',
    jhumka: 'jhumka',
    stud: 'stud',
    solitaire: 'solitaire',
    'open-ring': 'open-ring',
  }
  const direct = aliases[raw] || raw
  return VALID_SUBTYPES.includes(direct) ? direct : null
}

function normalizeTagArray(values, validValues) {
  return [...new Set(toArray(values).map((value) => value.toLowerCase()).filter((value) => validValues.includes(value)))]
}

function normalizeProminentStone(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!v || v === 'null' || v === 'undefined') return null
  return VALID_STONE_TAGS.includes(v) ? v : null
}

/** Vision output only — combines stoneTags with optional model prominentStone (no catalog field). */
function detectedHasStone(detected, tag) {
  const p = normalizeProminentStone(detected?.prominentStone)
  return Boolean(detected?.stoneTags?.includes(tag) || p === tag)
}

const SPECIFIC_STONE_TAGS = ['emerald', 'ruby', 'pearl', 'kundan', 'polki', 'black-beads']

/** When notes/pricing mention a colored main stone but the model omitted stoneTags, fix tags for search and filters. */
function inferColoredStoneTagsFromCombinedText(combinedLower) {
  const add = []
  const emeraldHint =
    !/\bperidot\b/i.test(combinedLower) &&
    (/\b(emerald|emerald-cut|step-cut green|rectangular green|baguette green|green gem\b|green gemstone|green centre|green center|green stone|vivid green|deep green|forest green|prominent green)\b/i.test(
      combinedLower,
    ) ||
      /\bgreen\b.*\b(center|centre|main|primary|dominant)\s+(stone|gem|gemstone)\b/i.test(combinedLower))
  const rubyHint =
    /\b(ruby|rubies|pigeon blood|red gem\b|red gemstone|red centre|red center|red main stone)\b/i.test(
      combinedLower,
    )
  if (emeraldHint) add.push('emerald')
  if (rubyHint) add.push('ruby')
  return add
}

function rerankVectorResultsByStone(vectorResults, detected) {
  if (!Array.isArray(vectorResults) || vectorResults.length < 2) return vectorResults
  const prominent = normalizeProminentStone(detected?.prominentStone)
  const wanted = [
    ...new Set([
      ...SPECIFIC_STONE_TAGS.filter((t) => detected?.stoneTags?.includes(t)),
      ...(prominent && SPECIFIC_STONE_TAGS.includes(prominent) ? [prominent] : []),
    ]),
  ]
  if (!wanted.length && !prominent) return vectorResults

  const scored = vectorResults.map((p) => {
    const pts = Array.isArray(p.stoneTags) ? p.stoneTags : []
    let tie = Number(p.vectorScore || 0)
    for (const w of wanted) {
      if (pts.includes(w)) tie += 0.07
    }
    if (prominent && pts.includes(prominent)) tie += 0.05
    const wantsEmeraldOrRuby =
      wanted.some((w) => w === 'emerald' || w === 'ruby') ||
      prominent === 'emerald' ||
      prominent === 'ruby'
    if (wantsEmeraldOrRuby) {
      const hasColored =
        (prominent === 'emerald' || prominent === 'ruby' ? pts.includes(prominent) : false) ||
        wanted.filter((w) => w === 'emerald' || w === 'ruby').some((w) => pts.includes(w))
      if (!hasColored && pts.includes('diamond')) tie -= 0.14
    }
    return { p, tie }
  })
  scored.sort((a, b) => b.tie - a.tie)
  return scored.map((s) => s.p)
}

function inferSubtypeFromFreeText(text, category = null) {
  const raw = String(text || '').trim().toLowerCase()
  if (!raw) return null
  // Pendant wins over halo/cluster: a halo pendant is still a pendant —
  // halo/cluster describe the setting, pendant describes the piece.
  if (category !== 'Rings' && /\bpendant\b/.test(raw)) return normalizeSubtype('pendant', category)
  if (/\bhalo\b/.test(raw)) return category === 'Rings' ? 'cluster' : normalizeSubtype('cluster', category)
  if (/\bcluster\b|\bclustered\b/.test(raw)) return normalizeSubtype('cluster', category)
  if (/\bmulti[-\s]?stone\b|\baccent diamonds?\b|\bpav[eé]\b|\bmany diamonds?\b/.test(raw)) {
    return normalizeSubtype('multi-stone', category)
  }
  if (/\bsolitaire\b|\bsingle dominant center\b|\bsingle center\b|\bcenter stone\b/.test(raw)) {
    return normalizeSubtype('solitaire', category)
  }
  if (/\bopen[-\s]?ring\b|\bbypass\b|\bopenwork\b|\bcutout\b|\bparallel bands?\b/.test(raw)) return normalizeSubtype('open-ring', category)
  if (/\bjhumka\b/.test(raw)) return normalizeSubtype('jhumka', category)
  if (/\bstud(s)?\b/.test(raw)) return normalizeSubtype('stud', category)
  if (/\bchandelier\b|\bdrop\b|\bhoop\b/.test(raw)) return normalizeSubtype('drop', category)
  if (/\bpendant\b/.test(raw)) return normalizeSubtype('pendant', category)
  if (/\bmangal[\s-]*sutra\b/.test(raw)) return normalizeSubtype('mangal-sutra', category)
  if (/\bcuff\b|\bkada\b|\bbangle\b/.test(raw)) return normalizeSubtype('cuff', category)
  if (/\blink\b|\bchain bracelet\b/.test(raw)) return normalizeSubtype('chain-bracelet', category)
  if (/\bcollar\b|\blayered\b|\bstatement\b|\bnecklace\b/.test(raw)) {
    return normalizeSubtype(category === 'Mangal Sutra' ? 'mangal-sutra' : 'statement-necklace', category)
  }
  return null
}

function customizationText(product) {
  const options = product?.customizationOptions || {}
  const parts = [
    Array.isArray(options?.diamondQualities) && options.diamondQualities.length
      ? `diamond qualities ${options.diamondQualities.join(', ')}`
      : '',
    Array.isArray(options?.metalPurities) && options.metalPurities.length
      ? `metal purities ${options.metalPurities.join(', ')}`
      : '',
    Array.isArray(options?.centerShapes) && options.centerShapes.length
      ? `center shapes ${options.centerShapes.join(', ')}`
      : '',
    Array.isArray(options?.centerStoneSizes) && options.centerStoneSizes.length
      ? `center stone sizes ${options.centerStoneSizes.join(', ')}`
      : '',
    Array.isArray(options?.ringSizes) && options.ringSizes.length
      ? `ring sizes ${options.ringSizes.join(', ')}`
      : '',
    Array.isArray(options?.bangleSizes) && options.bangleSizes.length
      ? `bangle sizes ${options.bangleSizes.join(', ')}`
      : '',
    Array.isArray(options?.necklaceSizes) && options.necklaceSizes.length
      ? `necklace sizes ${options.necklaceSizes.join(', ')}`
      : '',
  ]
  return parts.filter(Boolean).join('. ')
}

function productAttributesText(product) {
  const attrs = product?.productAttributes || {}
  const parts = [
    attrs.grossWeight ? `gross weight ${attrs.grossWeight}` : '',
    attrs.diamondCarats ? `diamond carats ${attrs.diamondCarats}` : '',
    attrs.diamondQuantity ? `diamond quantity ${attrs.diamondQuantity}` : '',
  ]
  return parts.filter(Boolean).join('. ')
}

function productSearchText(product) {
  return [
    product?.title || '',
    product?.category || '',
    product?.subtype || '',
    product?.material || '',
    product?.color || '',
    product?.description || '',
    product?.aiDescription || '',
    Array.isArray(product?.details) ? product.details.join(' ') : '',
    Array.isArray(product?.styleTags) ? product.styleTags.join(' ') : '',
    Array.isArray(product?.stoneTags) ? product.stoneTags.join(' ') : '',
    productAttributesText(product),
    customizationText(product),
  ]
    .filter(Boolean)
    .join(' ')
}

function inferSubtypeFromText(product) {
  const text = productSearchText(product)
  return inferSubtypeFromFreeText(text, normalizeCategory(product?.category) || product?.category || null)
}

function inferStyleTagsFromText(product) {
  const text = productSearchText(product).toLowerCase()
  const tags = []
  if (/\bbridal\b|\bengagement\b/.test(text)) tags.push('bridal')
  if (/\btraditional\b|\bheritage\b|\bfiligree\b|\bjaipur\b/.test(text)) tags.push('traditional')
  if (/\bmodern\b|\bcontemporary\b|\bgeometric\b/.test(text)) tags.push('modern')
  if (/\bminimal\b|\bdelicate\b|\beveryday\b/.test(text)) tags.push('minimal')
  if (/\bstatement\b|\bchandelier\b|\bcollar\b/.test(text)) tags.push('statement')
  return tags
}

function buildVisualSignals(source) {
  const text = [
    productSearchText(source),
    source?.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return {
    hasCenterStone: /\bcenter stone\b|\bcentre stone\b|\bsingle center\b|\bsingle dominant center\b/.test(text),
    hasSolitaireLanguage: /\bsolitaire\b|\bengagement\b/.test(text),
    hasHalo: /\bhalo\b/.test(text),
    hasCluster: /\bcluster\b|\bclustered\b/.test(text),
    hasPave: /\bpav[eé]\b/.test(text),
    hasManyStones: /\bmulti[-\s]?stone\b|\bmany diamonds?\b|\baccent diamonds?\b|\bdiamond accents?\b/.test(text),
    hasOpenRing: /\bopen[-\s]?ring\b|\bbypass\b/.test(text),
    hasOpenwork: /\bopenwork\b|\bcutout\b|\bfiligree\b|\blattice\b|\bparallel bands?\b/.test(text),
    hasNoVisibleStones: /\bno visible stones?\b|\bplain gold\b|\bplain band\b|\bwithout stones?\b/.test(text),
    mentionsDiamond: /\bdiamond\b|\bdiamonds\b/.test(text),
  }
}

function areRingProfilesCompatible(product, detected) {
  if (detected.category !== 'Rings') return true
  if (!detected.subtype) return true

  if (detected.subtype === 'solitaire') {
    return product.subtype === 'solitaire' || product.subtype === 'cluster'
  }

  if (detected.subtype === 'cluster') {
    return product.subtype === 'cluster' || product.subtype === 'multi-stone'
  }

  if (detected.subtype === 'multi-stone') {
    return product.subtype === 'multi-stone' || product.subtype === 'cluster'
  }

  return product.subtype === detected.subtype
}

function inferStoneTagsFromText(product) {
  const text = productSearchText(product).toLowerCase()
  const tags = []
  if (/\bdiamond\b|\bpav[eé]\b/.test(text)) tags.push('diamond')
  if (/\bkundan\b/.test(text)) tags.push('kundan')
  if (/\bpolki\b/.test(text)) tags.push('polki')
  if (/\bpearl\b/.test(text)) tags.push('pearl')
  if (/\bemerald\b/.test(text)) tags.push('emerald')
  if (/\bruby\b/.test(text)) tags.push('ruby')
  if (/\bblack(?:[\s-]+\w+){0,3}[\s-]+beads?\b|\bblack beads?\b/.test(text)) tags.push('black-beads')
  return tags
}

function normalizeCatalogProduct(product) {
  const category = normalizeCategory(product?.category) || product?.category || null
  const material = normalizeMaterial(product?.material) || product?.material || null
  const subtype = normalizeSubtype(product?.subtype, category) || inferSubtypeFromText(product)
  return {
    ...product,
    category,
    material,
    subtype,
    styleTags: normalizeTagArray(product?.styleTags, VALID_STYLE_TAGS).length
      ? normalizeTagArray(product?.styleTags, VALID_STYLE_TAGS)
      : inferStyleTagsFromText(product),
    stoneTags: normalizeTagArray(product?.stoneTags, VALID_STONE_TAGS).length
      ? normalizeTagArray(product?.stoneTags, VALID_STONE_TAGS)
      : inferStoneTagsFromText(product),
  }
}

function normalizeVisionPayload(raw) {
  let category = normalizeCategory(raw?.category)
  const notes = String(raw?.notes || '').trim()
  const pricingNotes = String(raw?.pricingNotes || '').trim()
  let subtype =
    normalizeSubtype(raw?.subtype, category) ||
    inferSubtypeFromFreeText(notes, category) ||
    inferSubtypeFromFreeText(raw?.category, category)
  const materials = [...new Set(toArray(raw?.materials).map(normalizeMaterial).filter(Boolean))]
  const styleTags = normalizeTagArray(raw?.styleTags, VALID_STYLE_TAGS)
  let stoneTags = normalizeTagArray(raw?.stoneTags, VALID_STONE_TAGS)
  const estimatedMetalWeightGrams = toPositiveNumber(raw?.estimatedMetalWeightGrams)
  const estimatedStoneWeightCt = toPositiveNumber(raw?.estimatedStoneWeightCt)
  let estimatedPriceMin = toPositiveNumber(raw?.estimatedPriceMin)
  let estimatedPriceMax = toPositiveNumber(raw?.estimatedPriceMax)

  if (estimatedPriceMin && estimatedPriceMax && estimatedPriceMin > estimatedPriceMax) {
    ;[estimatedPriceMin, estimatedPriceMax] = [estimatedPriceMax, estimatedPriceMin]
  }

  // Rule-based override: if notes or stoneTags mention black beads,
  // it is definitively a Mangal Sutra regardless of AI category output.
  const notesLower = notes.toLowerCase()
  const pricingLower = pricingNotes.toLowerCase()
  const combinedLower = `${notesLower} ${pricingLower}`
  const hasBlackBeadEvidence =
    stoneTags.includes('black-beads') ||
    /\bblack(?:[\s-]+\w+){0,3}[\s-]+beads?\b|\bblack beads?\b/.test(combinedLower)

  if (hasBlackBeadEvidence) {
    category = 'Mangal Sutra'
    subtype = 'mangal-sutra'
    if (!stoneTags.includes('black-beads')) stoneTags = [...stoneTags, 'black-beads']
    if (!styleTags.includes('traditional')) styleTags.push('traditional')
    if (!styleTags.includes('bridal')) styleTags.push('bridal')
  }

  // Demote false "Mangal Sutra": model often guesses wrong on plain gold chains / initials.
  const looksPersonalized =
    /\b(initials?|personalized|monogram|nameplate|alphabet\s+letters?|letters?\s+&\s+letters?|engraved\s+letters?)\b/i.test(combinedLower) ||
    /\b[a-z]\s*&\s*[a-z]\b/i.test(combinedLower) ||
    /&\s*h\b|\ba\s*&/i.test(combinedLower)

  if (category === 'Mangal Sutra' && !hasBlackBeadEvidence) {
    if (looksPersonalized || /\bbracelet\b|\bwrist\b|\bclasp\b|\blobster\b/.test(combinedLower)) {
      category = 'Bracelets'
      subtype = normalizeSubtype('chain-bracelet', 'Bracelets') || 'chain-bracelet'
      if (!styleTags.includes('modern')) styleTags.push('modern')
      if (!styleTags.includes('minimal')) styleTags.push('minimal')
    } else {
      category = 'Necklaces'
      subtype = normalizeSubtype('pendant', 'Necklaces') || 'pendant'
    }
  }

  // Earrings: do not treat silicone backs as pearls; J-hoop / sculptural wire → drop not stud
  if (category === 'Earrings') {
    const backingNotPearl =
      /\b(silicone|plastic)\b.*\b(back|backing|butterfly|clutch|nut|stopper)\b|\bclear\b.*\b(back|backing)\b|\bflower[-\s]?shaped\b.*\bback\b/i.test(
        combinedLower,
      ) || /\bpearl[-\s]?like\b/i.test(combinedLower)
    if (stoneTags.includes('pearl') && backingNotPearl) {
      stoneTags = stoneTags.filter((t) => t !== 'pearl')
    }
    const sculpturalDrop =
      /\bj[-\s]?hoop\b/i.test(combinedLower) ||
      /\bcurved\b.*\b(wire|wires|bar|branch|arch)/i.test(combinedLower) ||
      /\bsculptural\b/i.test(combinedLower) ||
      /\bextends\b.*\b(below|under)\b.*\blobe\b/i.test(combinedLower)
    if (sculpturalDrop && subtype === 'stud') {
      subtype = 'drop'
    }
  }

  const inferredColored = inferColoredStoneTagsFromCombinedText(combinedLower)
  for (const t of inferredColored) {
    if (!stoneTags.includes(t)) stoneTags = [...stoneTags, t]
  }
  if (stoneTags.some((t) => ['emerald', 'ruby', 'pearl'].includes(t))) {
    stoneTags = stoneTags.filter((t) => t !== 'stone')
  }
  stoneTags = [...new Set(stoneTags)]

  const prominentStone = normalizeProminentStone(raw?.prominentStone)

  return {
    category,
    subtype,
    materials,
    styleTags,
    stoneTags,
    prominentStone,
    estimatedMetalWeightGrams,
    estimatedStoneWeightCt,
    estimatedPriceMin,
    estimatedPriceMax,
    pricingNotes,
    notes,
  }
}

function hardFilterProducts(products, detected, options = {}) {
  const {
    requireCategory = true,
    requireSubtype = false,
    requireMaterials = false,
    requireStoneTags = false,
    requireStyleTags = false,
  } = options

  return products.filter((product) => {
    if (requireCategory && detected.category && product.category !== detected.category) return false
    if (requireSubtype && detected.subtype && !areRingProfilesCompatible(product, detected)) return false
    if (
      requireMaterials &&
      detected.materials.length &&
      !detected.materials.includes(product.material)
    ) {
      return false
    }
    if (
      requireStoneTags &&
      detected.stoneTags.length &&
      !detected.stoneTags.every((tag) => product.stoneTags?.includes(tag))
    ) {
      return false
    }
    if (
      requireStyleTags &&
      detected.styleTags.length &&
      !detected.styleTags.every((tag) => product.styleTags?.includes(tag))
    ) {
      return false
    }
    return true
  })
}

// Structural hard filter for the vector path: keep only catalog products whose
// category + material + subtype match the vision detection. This mirrors the
// text-search hard filter so both paths constrain on the same reliable facets,
// leaving stone colour / shape / fine detail to the vector ranking + description.
// Rings use ring-family compatibility (solitaire≈cluster≈multi-stone); other
// categories require an exact subtype match. If this empties the vector hits the
// handler falls through to attribute scoring, which relaxes progressively.
function matchesDetectedStructure(product, detected) {
  if (detected.category && product.category !== detected.category) return false
  if (detected.materials?.length && !detected.materials.includes(product.material)) return false
  if (detected.subtype) {
    const subtypeOk =
      detected.category === 'Rings'
        ? areRingProfilesCompatible(product, detected)
        : product.subtype === detected.subtype
    if (!subtypeOk) return false
  }
  return true
}

function pickCandidateProducts(products, detected) {
  const fallbackSteps = [
    {
      name: 'strict',
      options: {
        requireCategory: Boolean(detected.category),
        requireSubtype: Boolean(detected.subtype),
        requireMaterials: Boolean(detected.materials.length),
        requireStoneTags: Boolean(detected.category === 'Rings' && detected.stoneTags.length),
        requireStyleTags: false,
      },
    },
    {
      name: 'category-subtype-stones',
      options: {
        requireCategory: Boolean(detected.category),
        requireSubtype: Boolean(detected.category === 'Rings' && detected.subtype),
        requireMaterials: false,
        requireStoneTags: Boolean(detected.category === 'Rings' && detected.stoneTags.length),
        requireStyleTags: false,
      },
    },
    {
      name: 'category-material',
      options: {
        requireCategory: Boolean(detected.category),
        requireSubtype: false,
        requireMaterials: Boolean(detected.materials.length),
        requireStoneTags: false,
        requireStyleTags: false,
      },
    },
    {
      name: 'material-only',
      options: {
        requireCategory: false,
        requireSubtype: false,
        requireMaterials: Boolean(detected.materials.length),
        requireStoneTags: false,
        requireStyleTags: false,
      },
    },
    {
      name: 'all',
      options: {
        requireCategory: false,
        requireSubtype: false,
        requireMaterials: false,
        requireStoneTags: false,
        requireStyleTags: false,
      },
    },
  ]

  for (const step of fallbackSteps) {
    const matches = hardFilterProducts(products, detected, step.options)
    if (matches.length) return { matches, strategy: step.name }
  }

  return { matches: [], strategy: 'none' }
}

function scoreProduct(product, detected) {
  const detectedSignals = buildVisualSignals(detected)
  const productSignals = buildVisualSignals(product)
  let score = 0
  if (detected.category && product.category === detected.category) score += 50
  if (detected.subtype && product.subtype === detected.subtype) score += 35
  if (detected.materials.length && detected.materials.includes(product.material)) score += 20
  for (const tag of detected.styleTags) {
    if (product.styleTags?.includes(tag)) score += 10
  }
  for (const tag of detected.stoneTags) {
    if (product.stoneTags?.includes(tag)) score += 12
  }
  const dp = normalizeProminentStone(detected.prominentStone)
  if (dp && product.stoneTags?.includes(dp)) score += 14

  if (detected.category && product.category !== detected.category) score -= 15
  if (detected.subtype && product.subtype && product.subtype !== detected.subtype) {
    score -= detected.category === 'Rings' ? 20 : 8
  }
  if (detected.category === 'Rings' && detected.subtype && !areRingProfilesCompatible(product, detected)) {
    score -= 25
  }

  if (detectedSignals.hasCenterStone && productSignals.hasCenterStone) score += 18
  if (detectedSignals.hasSolitaireLanguage && productSignals.hasSolitaireLanguage) score += 15
  if (detectedSignals.hasHalo && productSignals.hasHalo) score += 12
  if (detectedSignals.hasCluster && productSignals.hasCluster) score += 12
  if (detectedSignals.hasPave && productSignals.hasPave) score += 15
  if (detectedSignals.hasManyStones && productSignals.hasManyStones) score += 15
  if (detectedSignals.hasOpenRing && productSignals.hasOpenRing) score += 15
  if (detectedSignals.hasOpenwork && productSignals.hasOpenwork) score += 18

  if (
    !detected.stoneTags?.length &&
    !normalizeProminentStone(detected.prominentStone) &&
    !detectedSignals.mentionsDiamond &&
    product.stoneTags?.length
  )
    score -= 18
  if ((detectedSignals.hasNoVisibleStones || detectedSignals.hasOpenwork) && product.stoneTags?.includes('diamond')) score -= 22
  if ((detectedSignals.hasNoVisibleStones || detectedSignals.hasOpenwork) && productSignals.hasManyStones) score -= 18

  if (detectedSignals.hasCenterStone && productSignals.hasManyStones) score -= 10
  if (detectedSignals.hasManyStones && productSignals.hasCenterStone && !productSignals.hasManyStones) score -= 8
  return score
}

function pruneRankedResults(ranked, detected) {
  if (!Array.isArray(ranked) || !ranked.length) return []
  const topScore = Number(ranked[0]?.score || 0)
  const detectedSignals = buildVisualSignals(detected)

  return ranked.filter((product, index) => {
    const score = Number(product?.score || 0)
    if (index === 0) return true
    if (score < 20) return false
    if (topScore >= 80 && score < topScore - 40) return false

    if (detected.category === 'Rings') {
      const productSignals = buildVisualSignals(product)
      if ((detectedSignals.hasNoVisibleStones || detectedSignals.hasOpenwork) && product.stoneTags?.includes('diamond')) {
        return false
      }
      if ((detectedSignals.hasNoVisibleStones || detectedSignals.hasOpenwork) && productSignals.hasManyStones) {
        return false
      }
    }

    return true
  })
}

function inferPricingProfile(detected) {
  const notes = String(detected?.notes || '').toLowerCase()
  const material = detected?.materials?.[0] || 'gold'
  const category = detected?.category || 'Rings'
  const subtype = detected?.subtype || null

  let metalWeightGrams = 0
  if (category === 'Rings') metalWeightGrams = material === 'silver' ? 5.5 : 4.8
  if (category === 'Earrings') metalWeightGrams = material === 'silver' ? 10 : 7
  if (category === 'Bracelets') metalWeightGrams = material === 'silver' ? 14 : 10
  // Bangles are rigid, so they carry more metal than a comparable bracelet.
  if (category === 'Bangles') metalWeightGrams = material === 'silver' ? 18 : 13
  if (category === 'Necklaces') metalWeightGrams = material === 'silver' ? 20 : 14
  if (category === 'Mangal Sutra') metalWeightGrams = 12

  if (subtype === 'solitaire') metalWeightGrams += 0.8
  if (subtype === 'cluster') metalWeightGrams += 0.5
  if (subtype === 'multi-stone') metalWeightGrams += 0.9
  if (subtype === 'statement-necklace') metalWeightGrams += 8
  if (subtype === 'mangal-sutra') metalWeightGrams += 2.5
  if (subtype === 'jhumka') metalWeightGrams += 3
  if (subtype === 'cuff') metalWeightGrams += 4

  if (detected?.styleTags?.includes('statement')) metalWeightGrams += 4
  if (detected?.styleTags?.includes('bridal')) metalWeightGrams += 2
  if (detected?.styleTags?.includes('minimal') || detected?.styleTags?.includes('everyday')) metalWeightGrams -= 0.8
  if (/\bdelicate\b|\bslim\b|\bfine chain\b|\bthin\b/.test(notes)) metalWeightGrams -= 0.7
  if (/\bheavy\b|\bbold\b|\bchunky\b|\bwide\b|\blayered\b/.test(notes)) metalWeightGrams += 3

  metalWeightGrams = Math.max(material === 'silver' ? 3 : 2.5, Number(metalWeightGrams.toFixed(1)))
  if (detected?.estimatedMetalWeightGrams) {
    const modelWeight = detected.estimatedMetalWeightGrams
    const clampedModelWeight = Math.max(metalWeightGrams * 0.6, Math.min(modelWeight, metalWeightGrams * 1.7))
    metalWeightGrams = Number(((metalWeightGrams + clampedModelWeight) / 2).toFixed(1))
  }

  let stoneWeightCt = 0
  if (detectedHasStone(detected, 'diamond')) stoneWeightCt += 0.18
  if (detectedHasStone(detected, 'kundan') || detectedHasStone(detected, 'polki')) stoneWeightCt += 0.35
  if (detectedHasStone(detected, 'emerald') || detectedHasStone(detected, 'ruby')) stoneWeightCt += 0.22
  if (detectedHasStone(detected, 'pearl')) stoneWeightCt += 0.12

  if (subtype === 'solitaire') stoneWeightCt += 0.55
  if (subtype === 'cluster') stoneWeightCt += 0.3
  if (subtype === 'multi-stone') stoneWeightCt += 0.4
  if (/\bcenter stone\b|\bsingle dominant center\b|\bsolitaire\b/.test(notes)) stoneWeightCt += 0.45
  if (/\bpav[eé]\b|\baccent diamonds?\b|\bmany diamonds?\b/.test(notes)) stoneWeightCt += 0.35
  if (/\bsmall stones?\b|\bdelicate\b/.test(notes)) stoneWeightCt -= 0.08

  stoneWeightCt = Math.max(0, Number(stoneWeightCt.toFixed(2)))
  if (detected?.estimatedStoneWeightCt) {
    const modelStoneWeight = detected.estimatedStoneWeightCt
    const clampedModelStoneWeight = Math.max(stoneWeightCt * 0.4, Math.min(modelStoneWeight, Math.max(0.2, stoneWeightCt * 2.2)))
    stoneWeightCt = Number(((stoneWeightCt + clampedModelStoneWeight) / 2).toFixed(2))
  }

  const materialRatePerGram = material === 'silver' ? 110 : 7200
  let stoneRatePerCt = 0
  if (detectedHasStone(detected, 'diamond')) stoneRatePerCt = subtype === 'solitaire' ? 90000 : 65000
  else if (detectedHasStone(detected, 'kundan') || detectedHasStone(detected, 'polki')) stoneRatePerCt = 45000
  else if (detectedHasStone(detected, 'emerald') || detectedHasStone(detected, 'ruby')) stoneRatePerCt = 30000
  else if (detectedHasStone(detected, 'pearl')) stoneRatePerCt = 12000

  const metalValue = Math.round(metalWeightGrams * materialRatePerGram)
  const stoneValue = Math.round(stoneWeightCt * stoneRatePerCt)

  let makingCharge = 12000
  if (category === 'Rings') makingCharge = 14000
  if (category === 'Earrings') makingCharge = 16000
  if (category === 'Bracelets') makingCharge = 18000
  if (category === 'Bangles') makingCharge = 20000
  if (category === 'Necklaces') makingCharge = 24000
  if (category === 'Mangal Sutra') makingCharge = 22000

  if (detected?.styleTags?.includes('bridal')) makingCharge += 6000
  if (detected?.styleTags?.includes('statement')) makingCharge += 8000
  if (detected?.styleTags?.includes('minimal')) makingCharge -= 3000
  if (material === 'silver') makingCharge = Math.max(3500, Math.round(makingCharge * 0.45))

  const baseEstimate = metalValue + stoneValue + makingCharge
  let minPrice = Math.max(8000, Math.round(baseEstimate * 0.85 / 1000) * 1000)
  let maxPrice = Math.max(minPrice + 5000, Math.round(baseEstimate * 1.2 / 1000) * 1000)

  if (detected?.estimatedPriceMin || detected?.estimatedPriceMax) {
    const modelMin = detected.estimatedPriceMin || detected.estimatedPriceMax || minPrice
    const modelMax = detected.estimatedPriceMax || detected.estimatedPriceMin || maxPrice
    const safeModelMin = Math.max(minPrice * 0.7, Math.min(modelMin, maxPrice * 1.4))
    const safeModelMax = Math.max(safeModelMin + 5000, Math.min(modelMax, maxPrice * 1.6))
    minPrice = Math.round(((minPrice + safeModelMin) / 2) / 1000) * 1000
    maxPrice = Math.round(((maxPrice + safeModelMax) / 2) / 1000) * 1000
    if (maxPrice <= minPrice) maxPrice = minPrice + 5000
  }

  return {
    minPrice,
    maxPrice,
    material,
    estimatedMetalWeightGrams: metalWeightGrams,
    estimatedStoneWeightCt: stoneWeightCt,
    estimatedMetalValue: metalValue,
    estimatedStoneValue: stoneValue,
    estimatedMakingCharge: makingCharge,
    pricingNotes: detected?.pricingNotes || '',
  }
}

function inferDiamondOriginFromText(text) {
  const raw = String(text || '').toLowerCase()
  if (/\blab[\s-]?grown\b|\blab diamond\b|\blg diamond\b/.test(raw)) return 'lab-grown'
  if (/\bnatural diamond\b|\bmined diamond\b/.test(raw)) return 'natural'
  return 'unknown'
}

function inferGoldPurityFromText(text) {
  const raw = String(text || '').toLowerCase()
  if (/\b18k\b|\b18kt\b/.test(raw)) return '18K'
  if (/\b14k\b|\b14kt\b/.test(raw)) return '14K'
  if (/\b22k\b|\b22kt\b/.test(raw)) return '22K'
  return null
}

function buildPricingNarrative(detected, pricingEstimate, promptText = '') {
  if (!pricingEstimate) return null

  const formatInr = (value) => `$${Math.round(value / 83).toLocaleString('en-US')}`
  const combinedText = `${promptText} ${detected?.notes || ''} ${detected?.pricingNotes || ''}`
  const diamondOrigin = inferDiamondOriginFromText(combinedText)
  const purity = inferGoldPurityFromText(combinedText)
  const materialLabel = pricingEstimate.material === 'gold' ? `${purity || 'gold'}` : pricingEstimate.material
  const categoryLabel = [detected?.materials?.[0], detected?.subtype ? detected.subtype.replace(/-/g, ' ') : detected?.category]
    .filter(Boolean)
    .join(' ')
    .trim()

  let broadMin = pricingEstimate.minPrice
  let broadMax = pricingEstimate.maxPrice
  let bestGuessMin = Math.round(pricingEstimate.minPrice * 1.08 / 1000) * 1000
  let bestGuessMax = Math.round(pricingEstimate.maxPrice * 0.9 / 1000) * 1000

  if (diamondOrigin === 'lab-grown') {
    broadMin = Math.round(pricingEstimate.minPrice * 0.8 / 1000) * 1000
    broadMax = Math.round(pricingEstimate.maxPrice * 0.92 / 1000) * 1000
    bestGuessMin = Math.round(broadMin * 1.08 / 1000) * 1000
    bestGuessMax = Math.round(broadMax * 0.88 / 1000) * 1000
  } else if (diamondOrigin === 'natural') {
    broadMin = Math.round(pricingEstimate.minPrice * 1.45 / 1000) * 1000
    broadMax = Math.round(pricingEstimate.maxPrice * 2.3 / 1000) * 1000
    bestGuessMin = Math.round(broadMin * 1.08 / 1000) * 1000
    bestGuessMax = Math.round(broadMax * 0.82 / 1000) * 1000
  }

  if (bestGuessMax <= bestGuessMin) bestGuessMax = bestGuessMin + 10000

  const centerStoneLow = Math.max(0.25, Number((pricingEstimate.estimatedStoneWeightCt * 0.75).toFixed(2)))
  const centerStoneHigh = Math.max(centerStoneLow, Number((pricingEstimate.estimatedStoneWeightCt * 1.2).toFixed(2)))

  const lines = []
  lines.push(
    `Based on the image alone, this looks like a${categoryLabel ? ` ${categoryLabel}` : ' jewellery piece'}${detectedHasStone(detected, 'diamond') ? ' with diamond detailing' : ''}.`
  )
  lines.push('')
  lines.push('A rough price estimate would be:')
  lines.push(`${diamondOrigin === 'lab-grown' ? 'Lab-grown diamond version' : diamondOrigin === 'natural' ? 'Natural diamond version' : 'Estimated version'}: ${formatInr(broadMin)} to ${formatInr(broadMax)}`)
  lines.push('')
  lines.push('What changes the price most:')
  lines.push(`center stone size, which looks roughly around ${centerStoneLow} to ${centerStoneHigh} carat`)
  lines.push(`${detectedHasStone(detected, 'diamond') ? 'whether the diamond is natural or lab-grown' : 'whether the stones are diamonds, polki, or another gemstone'}`)
  lines.push(`gold purity: ${purity || '14K vs 18K'}`)
  lines.push('diamond quality: color, clarity, cut')
  lines.push('making and brand markup')
  lines.push('')
  lines.push('If I had to give a single best-guess estimate from the photo:')
  lines.push(`${diamondOrigin === 'lab-grown' ? 'lab-grown' : diamondOrigin === 'natural' ? 'natural' : 'best guess'}: around ${formatInr(bestGuessMin)} to ${formatInr(bestGuessMax)}`)
  lines.push('')
  if (materialLabel) {
    const metalLow = Math.round(pricingEstimate.estimatedMetalValue * 0.9 / 1000) * 1000
    const metalHigh = Math.round(pricingEstimate.estimatedMetalValue * 1.15 / 1000) * 1000
    const stoneLow = Math.round(pricingEstimate.estimatedStoneValue * 0.85 / 1000) * 1000
    const stoneHigh = Math.round(pricingEstimate.estimatedStoneValue * 1.2 / 1000) * 1000
    const makingLow = Math.round(pricingEstimate.estimatedMakingCharge * 0.9 / 1000) * 1000
    const makingHigh = Math.round(pricingEstimate.estimatedMakingCharge * 1.15 / 1000) * 1000
    lines.push('Very rough breakup:')
    lines.push(`${materialLabel} + making: ${formatInr(Math.max(1000, metalLow + makingLow))} to ${formatInr(Math.max(6000, metalHigh + makingHigh))}`)
    if (pricingEstimate.estimatedStoneWeightCt > 0) {
      lines.push(`stones: ${formatInr(Math.max(2000, stoneLow))} to ${formatInr(Math.max(5000, stoneHigh))}`)
    }
    lines.push('')
  }
  lines.push(`This is only a visual estimate. Without the exact gold weight, stone certificate, and final specs, the price can swing quite a lot.`)

  return lines.join('\n')
}

function buildUserMessage(prompt) {
  const defaultPrompt =
    'Identify the jewellery in this image and return only JSON with category, subtype, materials, styleTags, stoneTags, prominentStone, and notes.'
  return prompt && String(prompt).trim() ? String(prompt).trim() : defaultPrompt
}

async function callOpenAIVisionModel(apiKey, imageDataUrl, prompt) {
  const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_DEFAULT_MODEL,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: VISION_SCHEMA_PROMPT,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildUserMessage(prompt) },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI vision error ${response.status}: ${err}`)
  }
  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || ''
}

async function callOpenAIPricingResponse(apiKey, imageDataUrl, prompt, detected) {
  const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_DEFAULT_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: PRICING_RESPONSE_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `User request: ${prompt || 'Give a price estimate for this jewellery image.'}

Detected attributes:
${JSON.stringify(
  {
    category: detected?.category || null,
    subtype: detected?.subtype || null,
    materials: detected?.materials || [],
    styleTags: detected?.styleTags || [],
    stoneTags: detected?.stoneTags || [],
    prominentStone: detected?.prominentStone ?? null,
    notes: detected?.notes || '',
  },
  null,
  2
)}`,
            },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI pricing error ${response.status}: ${err}`)
  }
  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || ''
}

async function callHuggingFaceVisionModel(token, imageDataUrl, prompt) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: HF_DEFAULT_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: VISION_SCHEMA_PROMPT,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildUserMessage(prompt) },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Hugging Face vision error ${response.status}: ${err}`)
  }
  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || ''
}

async function callHuggingFacePricingResponse(token, imageDataUrl, prompt, detected) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: HF_DEFAULT_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: PRICING_RESPONSE_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `User request: ${prompt || 'Give a price estimate for this jewellery image.'}

Detected attributes:
${JSON.stringify(
  {
    category: detected?.category || null,
    subtype: detected?.subtype || null,
    materials: detected?.materials || [],
    styleTags: detected?.styleTags || [],
    stoneTags: detected?.stoneTags || [],
    prominentStone: detected?.prominentStone ?? null,
    notes: detected?.notes || '',
  },
  null,
  2
)}`,
            },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Hugging Face pricing error ${response.status}: ${err}`)
  }
  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || ''
}

async function runVisionModel({ imageDataUrl, prompt }) {
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (openaiKey) {
    return {
      provider: 'openai',
      model: OPENAI_DEFAULT_MODEL,
      rawMessage: await callOpenAIVisionModel(openaiKey, imageDataUrl, prompt),
    }
  }

  const token = String(process.env.HF_TOKEN || process.env.HUGGINGFACE_HF_TOKEN || '').trim()
  if (token) {
    return {
      provider: 'huggingface',
      model: HF_DEFAULT_MODEL,
      rawMessage: await callHuggingFaceVisionModel(token, imageDataUrl, prompt),
    }
  }

  throw new Error(
    'Visual search is not configured. Set OPENAI_API_KEY for OpenAI vision (default gpt-4o), or configure HF_TOKEN with a supported vision model.'
  )
}

async function runPricingResponseModel({ imageDataUrl, prompt, detected }) {
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (openaiKey) {
    return {
      provider: 'openai',
      model: OPENAI_DEFAULT_MODEL,
      message: await callOpenAIPricingResponse(openaiKey, imageDataUrl, prompt, detected),
    }
  }

  const token = String(process.env.HF_TOKEN || process.env.HUGGINGFACE_HF_TOKEN || '').trim()
  if (token) {
    return {
      provider: 'huggingface',
      model: HF_DEFAULT_MODEL,
      message: await callHuggingFacePricingResponse(token, imageDataUrl, prompt, detected),
    }
  }

  throw new Error(
    'Visual pricing is not configured. Set OPENAI_API_KEY for OpenAI vision (default gpt-4o), or configure HF_TOKEN with a supported vision model.'
  )
}

async function resolveCatalog() {
  const products = await getCatalogProducts()
  const source = Array.isArray(products) ? products : []
  return source.map(normalizeCatalogProduct)
}

/**
 * Convert a text description to a 1536-dim embedding vector using OpenAI.
 * Throws on failure so the caller can surface the error in debug output.
 */
async function generateQueryEmbedding(text) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY not set — cannot generate query embedding')

  const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI embeddings error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  const vector = data?.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('OpenAI returned an empty embedding vector')
  }
  return vector
}

/**
 * Build the same text description used when seeding, so query and catalog
 * embeddings are in the same semantic space.
 */
function buildSearchText(detected) {
  const prominent = normalizeProminentStone(detected?.prominentStone)
  const parts = [
    detected.category,
    detected.subtype ? detected.subtype.replace(/-/g, ' ') : null,
    detected.materials?.join(' '),
    prominent ? `Prominent stone: ${prominent}` : null,
    detected.notes,
    detected.pricingNotes,
    detected.styleTags?.length ? `Style: ${detected.styleTags.join(', ')}` : null,
    detected.stoneTags?.length ? `Stones: ${detected.stoneTags.join(', ')}` : null,
  ]
  return parts.filter(Boolean).join('. ')
}

/**
 * Query Postgres for products whose embedding cosine similarity >= threshold.
 * Returns API-shaped product objects with an added `vectorScore` field.
 *
 * NOTE: The vector literal must be injected via $queryRawUnsafe — Prisma's
 * parameterized queries wrap strings in quotes that prevent `::vector` casting.
 * The vector string is safe: it only contains digits, commas, and brackets.
 */
async function vectorSearchProducts(queryVector, limit, threshold = VECTOR_SIMILARITY_THRESHOLD) {
  try {
    // Safe: vector values are floats — no user input, no injection risk
    const vecStr = `[${queryVector.join(',')}]`

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        p.id,
        (1 - (p.embedding <=> '${vecStr}'::vector))::float AS similarity
      FROM "Product" p
      WHERE p.active = true
        AND p.embedding IS NOT NULL
        AND (1 - (p.embedding <=> '${vecStr}'::vector)) >= $1
      ORDER BY similarity DESC
      LIMIT $2
    `, threshold, limit)

    if (!rows.length) return []

    return hydrateProductsWithScores(rows.map((r) => ({ id: r.id, similarity: Number(r.similarity) })))
  } catch (err) {
    console.error('Vector search error:', err)
    throw err  // re-throw so the handler surfaces it in debug
  }
}

/**
 * Load API-shaped products for [{ id, similarity }] rows and attach the
 * similarity as `vectorScore`, ordered best-first. Shared by the text-vector
 * and image-vector search paths.
 */
async function hydrateProductsWithScores(rows) {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const simMap = Object.fromEntries(rows.map((r) => [r.id, Number(r.similarity)]))

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: {
      variants: { where: { active: true }, orderBy: { listPricePaise: 'asc' } },
      images: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        take: 2,
      },
      priceBookMap: {
        where: { minQty: { lte: 1 }, priceBook: { active: true, channel: 'B2C' } },
        include: { priceBook: true },
        orderBy: [{ minQty: 'asc' }, { validFrom: 'desc' }],
      },
    },
  })

  const products = dbProducts
    .map((p) => ({ ...toApiProduct(p), vectorScore: simMap[p.id] ?? 0 }))
    .sort((a, b) => b.vectorScore - a.vectorScore)
  // S3-only products (no ProductImage rows) are indexed from their S3 photos,
  // so without this merge the best photo matches render as empty placeholders.
  return applyS3Images(products)
}

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const body = safeJsonParse(req.body)
  const imageDataUrl = String(body?.imageDataUrl || '').trim()
  const prompt = String(body?.prompt || '').trim()
  const limit = Math.min(Math.max(Number(body?.limit) || 6, 1), 12)
  const mode = String(body?.mode || 'search').trim().toLowerCase() === 'pricing' ? 'pricing' : 'search'

  if (!imageDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ message: 'Body must include imageDataUrl as a data URL.' })
  }

  const base64Payload = imageDataUrl.split(',')[1] || ''
  const sizeInBytes = Buffer.byteLength(base64Payload, 'base64')
  if (sizeInBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({ message: 'Image is too large. Please upload an image under 5 MB.' })
  }

  try {
    // Vision classification (for the detected payload + structural filters) and
    // the Titan query-image embedding are independent — run them concurrently.
    // A Titan failure must not sink the request: it resolves to null and the
    // handler falls through to the text-vector path.
    let imageVectorDebugError = null
    const [vision, queryImageVector] = await Promise.all([
      runVisionModel({ imageDataUrl, prompt }),
      isImageVectorSearchEnabled() && isImageEmbeddingConfigured()
        ? generateImageEmbeddingFromDataUrl(imageDataUrl).catch((err) => {
            imageVectorDebugError = err instanceof Error ? err.message : String(err)
            console.error('Query image embedding failed, falling back to text-vector search:', imageVectorDebugError)
            return null
          })
        : Promise.resolve(null),
    ])
    const rawMessage = vision.rawMessage
    const extracted = normalizeVisionPayload(extractJsonObject(rawMessage) || {})

    // --- Image-vector search (primary path: photo-to-photo similarity) ---
    let imageVectorResults = []
    let imageVectorHits = 0
    let imageVectorRelaxed = false
    if (queryImageVector) {
      try {
        const fetchLimit = Math.min(Math.max(limit * 4, 24), 60)
        let rows = await imageVectorSearchProductIds(queryImageVector, { limit: fetchLimit })
        if (!rows.length) {
          rows = await imageVectorSearchProductIds(queryImageVector, {
            limit: fetchLimit,
            threshold: IMAGE_VECTOR_RELAXED_THRESHOLD,
          })
          imageVectorRelaxed = rows.length > 0
        }
        imageVectorHits = rows.length
        const hydrated = (
          await hydrateProductsWithScores(rows.map((r) => ({ id: r.productId, similarity: r.similarity })))
        ).map(normalizeCatalogProduct)
        // Structural guardrail: prefer hits matching the detected category /
        // material / subtype, but never trade visually-close results for an
        // empty list — if the filter empties the set, keep the raw ranking.
        // A near-duplicate photo match (>= trust threshold) always survives:
        // the photo is stronger evidence than regex-inferred metadata.
        const structural = hydrated.filter(
          (p) =>
            Number(p.vectorScore) >= IMAGE_VECTOR_TRUST_THRESHOLD ||
            matchesDetectedStructure(p, extracted)
        )
        imageVectorResults = (structural.length ? structural : hydrated).slice(0, limit)
      } catch (err) {
        imageVectorDebugError = err instanceof Error ? err.message : String(err)
        console.error('Image-vector search failed, falling back to text-vector search:', imageVectorDebugError)
      }
    }

    // --- Text-vector search (fallback when image embeddings are unavailable) ---
    const searchText = buildSearchText(extracted)
    let vectorResults = []
    let usedVectorSearch = false
    let vectorDebugError = null

    let vectorRelaxed = false
    let vectorStrictHits = 0
    const prom = normalizeProminentStone(extracted.prominentStone)
    const specificColoredStone =
      SPECIFIC_STONE_TAGS.some((t) => extracted.stoneTags?.includes(t)) ||
      (prom != null && SPECIFIC_STONE_TAGS.includes(prom))
    const vecFetchLimit = specificColoredStone ? Math.min(Math.max(limit * 4, 24), 50) : limit
    const strictThreshold = specificColoredStone
      ? Math.min(VECTOR_SIMILARITY_THRESHOLD, 0.62)
      : VECTOR_SIMILARITY_THRESHOLD
    if (!imageVectorResults.length) try {
      const queryVector = await generateQueryEmbedding(searchText)
      const strictVec = await vectorSearchProducts(queryVector, vecFetchLimit, strictThreshold)
      vectorStrictHits = strictVec.length
      vectorResults = strictVec.map(normalizeCatalogProduct)
      if (!vectorResults.length) {
        vectorResults = (await vectorSearchProducts(queryVector, vecFetchLimit, VECTOR_RELAXED_THRESHOLD)).map(normalizeCatalogProduct)
        vectorRelaxed = vectorResults.length > 0
      }
      const wantsEmerald = detectedHasStone(extracted, 'emerald')
      const wantsRuby = detectedHasStone(extracted, 'ruby')
      const needsColoredMerge =
        (wantsEmerald && !vectorResults.some((p) => p.stoneTags?.includes('emerald'))) ||
        (wantsRuby && !vectorResults.some((p) => p.stoneTags?.includes('ruby')))
      if (specificColoredStone && vectorResults.length && needsColoredMerge) {
        const relaxedMerge = (await vectorSearchProducts(queryVector, vecFetchLimit, VECTOR_RELAXED_THRESHOLD)).map(normalizeCatalogProduct)
        vectorRelaxed = true
        const byId = new Map(vectorResults.map((p) => [p.id, p]))
        for (const p of relaxedMerge) {
          const prev = byId.get(p.id)
          if (!prev || Number(p.vectorScore) > Number(prev.vectorScore)) byId.set(p.id, p)
        }
        vectorResults = [...byId.values()].sort((a, b) => Number(b.vectorScore) - Number(a.vectorScore))
      }
      if (specificColoredStone && vectorResults.length > 1) {
        vectorResults = rerankVectorResultsByStone(vectorResults, extracted)
      }
      // Hard-filter the vector hits on category + material + subtype so image
      // search respects the same structural constraints as text search, instead
      // of returning loosely-similar pieces of the wrong type. If this empties
      // the list, the !vectorResults.length branch below relaxes via attribute scoring.
      vectorResults = vectorResults.filter((p) => matchesDetectedStructure(p, extracted))
      vectorResults = vectorResults.slice(0, limit)
      usedVectorSearch = true
    } catch (vecErr) {
      vectorDebugError = vecErr instanceof Error ? vecErr.message : String(vecErr)
      console.error('Vector search failed, falling back to attribute scoring:', vectorDebugError)
      vectorStrictHits = 0
      vectorRelaxed = false
    }

    // --- Attribute scoring (fallback when both vector paths return nothing) ---
    let prunedRanked = imageVectorResults.length ? imageVectorResults : vectorResults
    let strategy = imageVectorResults.length
      ? 'image-vector'
      : usedVectorSearch
        ? 'vector'
        : 'attribute'
    const vectorHits = vectorResults.length

    if (!prunedRanked.length) {
      const catalog = await resolveCatalog()
      const { matches: candidateProducts, strategy: fallbackStrategy } = pickCandidateProducts(catalog, extracted)
      const ranked = candidateProducts
        .map((product) => ({ ...product, score: scoreProduct(product, extracted) }))
        .sort((a, b) => b.score - a.score || (b.rating || 0) - (a.rating || 0))
        .slice(0, limit)
      prunedRanked = pruneRankedResults(ranked, extracted).slice(0, limit)
      strategy = fallbackStrategy
    }

    const pricingEstimate = mode === 'pricing' ? inferPricingProfile(extracted) : null
    const pricingResponse =
      mode === 'pricing'
        ? await runPricingResponseModel({ imageDataUrl, prompt, detected: extracted })
        : null

    const resultMessage =
      mode === 'pricing'
        ? pricingResponse?.message
          ? pricingResponse.message
          : 'I could identify the jewellery, but I could not estimate pricing from the image yet.'
        : prunedRanked.length
          ? `Found ${prunedRanked.length} similar ${prunedRanked.length === 1 ? 'piece' : 'pieces'} based on the uploaded image.`
          : 'I could identify the jewellery, but I could not find a close catalog match yet.'

    return res.status(200).json({
      message: resultMessage,
      detected: extracted,
      results: prunedRanked,
      rawModelOutput: rawMessage,
      pricingEstimate,
      debug: {
        provider: vision.provider,
        model: vision.model,
        mode,
        strategy,
        imageVectorRan: Boolean(queryImageVector),
        imageVectorHits,
        imageVectorRelaxed,
        imageVectorThreshold: IMAGE_VECTOR_SIMILARITY_THRESHOLD,
        imageVectorRelaxedThreshold: IMAGE_VECTOR_RELAXED_THRESHOLD,
        imageVectorError: imageVectorDebugError,
        imageVectorSearchEnabled: isImageVectorSearchEnabled(),
        imageEmbedProvider: imageEmbeddingProvider(),
        imageEmbedConfigured: isImageEmbeddingConfigured(),
        vectorRan: usedVectorSearch,
        vectorHits,
        vectorStrictHits,
        vectorRelaxed,
        vectorThreshold: VECTOR_SIMILARITY_THRESHOLD,
        vectorRelaxedThreshold: VECTOR_RELAXED_THRESHOLD,
        vectorError: vectorDebugError,
        pricingProvider: pricingResponse?.provider || null,
        pricingModel: pricingResponse?.model || null,
        hasOpenAIKey: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
        hasHFKey: Boolean(String(process.env.HF_TOKEN || process.env.HUGGINGFACE_HF_TOKEN || '').trim()),
      },
    })
  } catch (err) {
    console.error('Visual search error:', err)
    return res.status(500).json({
      message: err instanceof Error ? err.message : 'Visual search failed.',
      debug: {
        provider: String(process.env.OPENAI_API_KEY || '').trim() ? 'openai' : String(process.env.HF_TOKEN || process.env.HUGGINGFACE_HF_TOKEN || '').trim() ? 'huggingface' : 'none',
        model: String(process.env.OPENAI_API_KEY || '').trim() ? OPENAI_DEFAULT_MODEL : HF_DEFAULT_MODEL,
        hasOpenAIKey: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
        hasHFKey: Boolean(String(process.env.HF_TOKEN || process.env.HUGGINGFACE_HF_TOKEN || '').trim()),
      },
    })
  }
}
