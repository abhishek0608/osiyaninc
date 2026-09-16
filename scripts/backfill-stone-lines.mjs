/**
 * One-off migration for the packing-list model: products used to record their
 * stones as two flat strings (`diamondCarats`, `diamondQuantity`) plus a
 * `centerShapes` / `diamondQualities` / `stoneTypes` list of what could be
 * chosen. A piece now carries a `stoneLines` array of what was actually set, so
 * this folds the old values into one stone line and drops the retired keys —
 * without it, existing products lose their stone detail on the storefront.
 *
 * Only products that have no stone lines yet are touched, so a piece already
 * entered off a packing list is never overwritten. The retired customization
 * options go too; `centerStoneSizes` and `metalPurities` are kept, since the
 * packing list carries neither millimetres nor karat as a stone line.
 *
 * Dry run by default — it prints what it would do and changes nothing:
 *   node --env-file=.env scripts/backfill-stone-lines.mjs
 * Add --apply to write:
 *   node --env-file=.env scripts/backfill-stone-lines.mjs --apply
 */
import { prisma } from '../server/api/db.js'

const APPLY = process.argv.includes('--apply')
const RETIRED_ATTRS = ['diamondCarats', 'diamondQuantity']
const RETIRED_OPTIONS = ['diamondQualities', 'centerShapes', 'stoneTypes', 'allowCustomStoneType']

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Strip the unit a hand-entered value may carry: "0.92 ct" -> "0.92". */
function numericPart(value) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/)
  return match ? match[0] : ''
}

function omit(source, keys) {
  const next = { ...source }
  for (const key of keys) delete next[key]
  return next
}

/**
 * The old fields say how many stones and how many carats, but not their shape
 * or quality — so those stay empty rather than being invented. The line is
 * filed under D: the flat fields only ever described diamonds.
 */
function stoneLineFromLegacy(attrs) {
  const cts = numericPart(attrs.diamondCarats)
  const pcs = numericPart(attrs.diamondQuantity)
  if (!cts && !pcs) return null
  return { group: 'D', shape: '', quality: '', pcs, cts }
}

async function backfill() {
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, productAttributes: true, customizationOptions: true },
    orderBy: { slug: 'asc' },
  })

  let changed = 0
  let skippedExisting = 0

  for (const product of products) {
    const attrs = isPlainObject(product.productAttributes) ? product.productAttributes : {}
    const opts = isPlainObject(product.customizationOptions) ? product.customizationOptions : {}

    const hasStoneLines = Array.isArray(attrs.stoneLines) && attrs.stoneLines.length > 0
    const hasRetiredAttrs = RETIRED_ATTRS.some((key) => key in attrs)
    const hasRetiredOptions = RETIRED_OPTIONS.some((key) => key in opts)
    if (!hasRetiredAttrs && !hasRetiredOptions) continue
    if (hasStoneLines) skippedExisting += 1

    const line = hasStoneLines ? null : stoneLineFromLegacy(attrs)
    const nextAttrs = omit(attrs, RETIRED_ATTRS)
    if (line) nextAttrs.stoneLines = [line]

    const nextOpts = omit(opts, RETIRED_OPTIONS)

    console.log(
      `${product.slug}: ${line ? `+1 stone line (${line.pcs || '?'} pcs / ${line.cts || '?'} ct)` : 'stone lines kept'}` +
        `, dropped ${RETIRED_ATTRS.filter((k) => k in attrs).length + RETIRED_OPTIONS.filter((k) => k in opts).length} retired key(s)`,
    )

    if (APPLY) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.product.update({
        where: { id: product.id },
        data: {
          productAttributes: Object.keys(nextAttrs).length ? nextAttrs : null,
          customizationOptions: Object.keys(nextOpts).length ? nextOpts : null,
        },
      })
    }
    changed += 1
  }

  console.log(
    `\n${APPLY ? 'Updated' : 'Would update'} ${changed} product(s).` +
      (skippedExisting ? ` ${skippedExisting} already had stone lines and kept them.` : '') +
      (APPLY ? '' : '\nRe-run with --apply to write these changes.'),
  )
}

backfill()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
