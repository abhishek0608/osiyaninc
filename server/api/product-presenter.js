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

function normalizeStoneLines(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((line) => {
      if (!line || typeof line !== 'object') return null
      const group = String(line.group || '').trim().toUpperCase()
      const normalized = {
        group: group === 'F' || group === 'C' ? group : 'D',
        shape: String(line.shape || '').trim(),
        quality: String(line.quality || '').trim(),
        pcs: String(line.pcs ?? '').trim(),
        cts: String(line.cts ?? '').trim(),
      }
      // A line with nothing but its group carries no information - the bench
      // either set stones or it didn't.
      if (!normalized.shape && !normalized.quality && !normalized.pcs && !normalized.cts) return null
      return normalized
    })
    .filter(Boolean)
}

function normalizeProductAttributes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined

  const normalized = {
    grossWeight: String(input.grossWeight || '').trim(),
    metalPurity: String(input.metalPurity || '').trim(),
    centerStoneSize: String(input.centerStoneSize || '').trim(),
    bagNo: String(input.bagNo || '').trim(),
    styleNo: String(input.styleNo || '').trim(),
    netWeight: String(input.netWeight || '').trim(),
    goldRate: String(input.goldRate || '').trim(),
    goldValue: String(input.goldValue || '').trim(),
    stoneLines: normalizeStoneLines(input.stoneLines),
  }

  const hasValues =
    normalized.grossWeight ||
    normalized.metalPurity ||
    normalized.centerStoneSize ||
    normalized.bagNo ||
    normalized.styleNo ||
    normalized.netWeight ||
    normalized.goldRate ||
    normalized.goldValue ||
    normalized.stoneLines.length
  return hasValues ? normalized : undefined
}

/**
 * The price breakup the cart tooltip shows. It is built from the packing list:
 * gold weight and value come straight off the piece, stone weight is the sum of
 * its stone lines, and stone value is what the price leaves over once the gold
 * is paid for - which is exactly how the packing list itself adds up (PRICE =
 * Gold Value + stone value, with making already folded into the gold value).
 *
 * That residual only holds while the sale price is the packing-list price. If a
 * piece is marked up, the markup lands in the stone line, so the whole breakup
 * is withheld rather than shown wrong: anything short of a positive residual
 * falls back to the placeholder row.
 */
function buildPriceBreakup(attributes, price, priceValue) {
  const placeholder = {
    goldWeight: '\u2014',
    goldValue: '\u2014',
    stoneWeight: '\u2014',
    stoneValue: '\u2014',
    labour: price || '\u2014',
    total: price || '\u2014',
  }
  if (!attributes) return placeholder

  const goldValue = Number(String(attributes.goldValue || '').trim())
  if (!Number.isFinite(goldValue) || goldValue <= 0) return placeholder

  const stoneValue = priceValue - goldValue
  if (!Number.isFinite(stoneValue) || stoneValue < 0) return placeholder

  // Weights are entered by hand, so "2.522" and "2.522 g" both turn up.
  const goldWeight = String(attributes.netWeight || attributes.grossWeight || '')
    .trim()
    .replace(/\s*(?:g|gm|gms|gram|grams)$/i, '')
    .trim()
  const carats = sumStoneCarats(attributes.stoneLines)

  return {
    goldWeight: goldWeight ? `${goldWeight} g` : '\u2014',
    goldValue: formatUsd(Math.round(goldValue)),
    stoneWeight: carats != null ? `${carats.toFixed(2)} ct` : '\u2014',
    stoneValue: formatUsd(Math.round(stoneValue)),
    // The packing list has no separate labour line - making is already inside
    // the gold value - so there is nothing honest to put here.
    labour: '\u2014',
    total: price || '\u2014',
  }
}

function sumStoneCarats(lines) {
  if (!Array.isArray(lines) || !lines.length) return null
  let total = 0
  let sawNumber = false
  for (const line of lines) {
    const parsed = Number(String(line?.cts ?? '').trim())
    if (!Number.isFinite(parsed)) continue
    sawNumber = true
    total += parsed
  }
  return sawNumber ? total : null
}

// Certification as the storefront consumes it. certLab is the switch: without a
// grading house there is nothing to claim, so the whole object is dropped and
// no tag renders. `fileUrl` is absent until the report itself is uploaded — a
// piece can be tagged as certified before its scan is on file.
function normalizeCertification(dbProduct) {
  const lab = String(dbProduct?.certLab || '').trim()
  if (!lab) return undefined
  const certifiedAt = dbProduct?.certifiedAt ? new Date(dbProduct.certifiedAt) : null
  return {
    lab,
    number: String(dbProduct?.certNumber || '').trim(),
    fileUrl: String(dbProduct?.certFileUrl || '').trim(),
    certifiedAt: certifiedAt && !Number.isNaN(certifiedAt.getTime()) ? certifiedAt.toISOString() : '',
  }
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
  const productAttributes = normalizeProductAttributes(dbProduct.productAttributes)
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
    collection: dbProduct.collection || undefined,
    material: dbProduct.material,
    color: dbProduct.color || 'yellow',
    price,
    priceValue,
    description: dbProduct.description || '',
    aiDescription: dbProduct.aiDescription || '',
    details: [],
    styleTags: Array.isArray(dbProduct.styleTags) ? dbProduct.styleTags : inferStyleTags(dbProduct),
    stoneTags: Array.isArray(dbProduct.stoneTags) ? dbProduct.stoneTags : inferStoneTags(dbProduct),
    breakup: buildPriceBreakup(productAttributes, price, priceValue),
    images,
    isNewArrival: Boolean(dbProduct.isNewArrival),
    isBestSeller: Boolean(dbProduct.isBestSeller),
    rating: typeof dbProduct.rating === 'number' ? dbProduct.rating : 0,
    reviewCount: typeof dbProduct.reviewCount === 'number' ? dbProduct.reviewCount : 0,
    productAttributes,
    certification: normalizeCertification(dbProduct),
  }
}
