function formatUsd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return ''
  return `$${value.toLocaleString('en-US')}`
}

function inferSubtype(dbProduct) {
  const text = `${dbProduct?.title || ''} ${dbProduct?.description || ''} ${
    Array.isArray(dbProduct?.details) ? dbProduct.details.join(' ') : ''
  }`.toLowerCase()
  if (!text.trim()) return null
  // Pendant wins over halo/cluster: a halo pendant is still a pendant —
  // halo/cluster describe the setting, pendant describes the piece.
  if (/\bpendant\b/.test(text)) return 'pendant'
  if (/\bhalo\b/.test(text)) return 'cluster'
  if (/\bcluster\b|\bclustered\b/.test(text)) return 'cluster'
  if (/\bmulti[-\s]?stone\b|\baccent diamonds?\b|\bpav[eé]\b|\bmany diamonds?\b/.test(text)) return 'multi-stone'
  if (/\bsolitaire\b|\bsingle dominant center\b|\bsingle center\b|\bcenter stone\b/.test(text)) return 'solitaire'
  if (/\bopen[-\s]?ring\b/.test(text)) return 'open-ring'
  if (/\bpendant\b/.test(text)) return 'pendant'
  if (/\bmangal[\s-]*sutra\b/.test(text)) return 'mangal-sutra'
  if (/\bjhumka\b/.test(text)) return 'jhumka'
  if (/\bstud(s)?\b/.test(text)) return 'stud'
  if (/\bchandelier\b|\bdrop\b/.test(text)) return 'drop'
  if (/\bcuff\b|\bkada\b/.test(text)) return 'cuff'
  if (/\bbracelet\b|\bchain\b|\blink\b/.test(text)) return 'chain-bracelet'
  if (/\bcollar\b|\blayered\b|\bstatement\b/.test(text)) return 'statement-necklace'
  return null
}

function inferStoneTags(dbProduct) {
  const text = `${dbProduct?.title || ''} ${dbProduct?.description || ''} ${
    Array.isArray(dbProduct?.details) ? dbProduct.details.join(' ') : ''
  }`.toLowerCase()
  const tags = []
  if (/\bdiamond\b|\bpav[eé]\b/.test(text)) tags.push('diamond')
  if (/\bkundan\b/.test(text)) tags.push('kundan')
  if (/\bpolki\b/.test(text)) tags.push('polki')
  if (/\bpearl\b/.test(text)) tags.push('pearl')
  if (/\bemerald\b/.test(text)) tags.push('emerald')
  if (/\bruby\b/.test(text)) tags.push('ruby')
  if (/\bblack bead/.test(text)) tags.push('black-beads')
  return tags
}

function inferStyleTags(dbProduct) {
  const text = `${dbProduct?.title || ''} ${dbProduct?.description || ''}`.toLowerCase()
  const tags = []
  if (/\bbridal\b|\bengagement\b/.test(text)) tags.push('bridal')
  if (/\btraditional\b|\bheritage\b|\bjaipur\b|\bfiligree\b/.test(text)) tags.push('traditional')
  if (/\bmodern\b|\bcontemporary\b|\bgeometric\b/.test(text)) tags.push('modern')
  if (/\bminimal\b|\bdelicate\b|\beveryday\b/.test(text)) tags.push('minimal')
  if (/\bstatement\b|\bchandelier\b|\bcollar\b/.test(text)) tags.push('statement')
  return tags
}

function pickPriceFromPriceBook(dbProduct) {
  const items = Array.isArray(dbProduct?.priceBookMap) ? dbProduct.priceBookMap : []
  if (!items.length) return null
  const now = new Date()
  const eligible = items.filter((item) => {
    const active = item?.priceBook?.active !== false
    const channelOk = item?.priceBook?.channel === 'B2C'
    const minQtyOk = Number(item?.minQty || 1) <= 1
    const validFromOk = !item?.validFrom || new Date(item.validFrom) <= now
    const validToOk = !item?.validTo || new Date(item.validTo) >= now
    return active && channelOk && minQtyOk && validFromOk && validToOk
  })
  if (!eligible.length) return null
  eligible.sort((a, b) => {
    const aQty = Number(a.minQty || 1)
    const bQty = Number(b.minQty || 1)
    if (aQty !== bQty) return aQty - bQty
    const aFrom = a.validFrom ? new Date(a.validFrom).getTime() : 0
    const bFrom = b.validFrom ? new Date(b.validFrom).getTime() : 0
    return bFrom - aFrom
  })
  const top = eligible[0]
  return typeof top?.pricePaise === 'number' && Number.isFinite(top.pricePaise) ? top.pricePaise : null
}

function normalizeOptionArray(input) {
  if (!Array.isArray(input)) return []
  return input.map((value) => String(value || '').trim()).filter(Boolean)
}

function normalizeCustomizationOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined

  const normalized = {
    diamondQualities: normalizeOptionArray(input.diamondQualities),
    metalPurities: normalizeOptionArray(input.metalPurities),
    centerShapes: normalizeOptionArray(input.centerShapes),
    centerStoneSizes: normalizeOptionArray(input.centerStoneSizes),
    allowCustomCenterStoneSize: input.allowCustomCenterStoneSize !== false,
    stoneTypes: normalizeOptionArray(input.stoneTypes),
    allowCustomStoneType: input.allowCustomStoneType !== false,
    ringSizes: normalizeOptionArray(input.ringSizes),
    bangleSizes: normalizeOptionArray(input.bangleSizes),
    necklaceSizes: normalizeOptionArray(input.necklaceSizes),
  }

  const hasValues =
    normalized.allowCustomCenterStoneSize ||
    normalized.allowCustomStoneType ||
    normalized.diamondQualities.length ||
    normalized.metalPurities.length ||
    normalized.centerShapes.length ||
    normalized.centerStoneSizes.length ||
    normalized.stoneTypes.length ||
    normalized.ringSizes.length ||
    normalized.bangleSizes.length ||
    normalized.necklaceSizes.length

  return hasValues ? normalized : undefined
}

function normalizeProductAttributes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined

  const normalized = {
    grossWeight: String(input.grossWeight || '').trim(),
    diamondCarats: String(input.diamondCarats || '').trim(),
    diamondQuantity: String(input.diamondQuantity || '').trim(),
  }

  const hasValues = normalized.grossWeight || normalized.diamondCarats || normalized.diamondQuantity
  return hasValues ? normalized : undefined
}

/** Prefer a variant with a real list price; catalog query sorts by listPricePaise asc so a $0 stub would otherwise win. */
export function pickVariantForPricing(activeVariants, preferredVariant) {
  if (preferredVariant) return preferredVariant
  if (!Array.isArray(activeVariants) || !activeVariants.length) return null
  const withPrice = activeVariants.find(
    (v) => typeof v?.listPricePaise === 'number' && Number.isFinite(v.listPricePaise) && v.listPricePaise > 0,
  )
  return withPrice || activeVariants[0]
}

export function toApiProduct(dbProduct, preferredVariant = null) {
  const activeVariants = Array.isArray(dbProduct?.variants)
    ? dbProduct.variants.filter((v) => v?.active !== false)
    : []
  const firstVariant = pickVariantForPricing(activeVariants, preferredVariant)
  const variantPrice =
    typeof firstVariant?.listPricePaise === 'number' && Number.isFinite(firstVariant.listPricePaise)
      ? firstVariant.listPricePaise
      : 0
  const priceBookPrice = pickPriceFromPriceBook(dbProduct)
  const priceValue =
    priceBookPrice != null && priceBookPrice > 0 ? priceBookPrice : variantPrice
  const price = formatUsd(priceValue)
  const images = Array.isArray(dbProduct?.images)
    ? dbProduct.images
        .filter((img) => img?.active !== false && typeof img?.url === 'string' && img.url.trim())
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((img) => img.url)
    : []

  return {
    id: dbProduct.id,
    slug: dbProduct.slug,
    title: dbProduct.title,
    category: dbProduct.category,
    subtype: dbProduct.subtype || inferSubtype(dbProduct) || undefined,
    material: dbProduct.material,
    color: dbProduct.color || 'yellow',
    price,
    priceValue,
    description: dbProduct.description || '',
    aiDescription: dbProduct.aiDescription || '',
    details: [],
    styleTags: Array.isArray(dbProduct.styleTags) ? dbProduct.styleTags : inferStyleTags(dbProduct),
    stoneTags: Array.isArray(dbProduct.stoneTags) ? dbProduct.stoneTags : inferStoneTags(dbProduct),
    breakup: {
      goldWeight: '—',
      goldValue: '—',
      stoneWeight: '—',
      stoneValue: '—',
      labour: price || '—',
      total: price || '—',
    },
    images,
    isNewArrival: Boolean(dbProduct.isNewArrival),
    isBestSeller: Boolean(dbProduct.isBestSeller),
    rating: typeof dbProduct.rating === 'number' ? dbProduct.rating : 0,
    reviewCount: typeof dbProduct.reviewCount === 'number' ? dbProduct.reviewCount : 0,
    customizationOptions: normalizeCustomizationOptions(dbProduct.customizationOptions),
    productAttributes: normalizeProductAttributes(dbProduct.productAttributes),
  }
}
