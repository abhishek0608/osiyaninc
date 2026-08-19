/**
 * Seed a demo catalog — five products per category — and give each one a photo
 * folder in S3.
 *
 * The storefront reads products from Postgres and photos from the bucket
 * (`<BASE_PREFIX>/<slug>/…`, see server/api/s3-images.js), so both halves are
 * written here:
 *   - Product + ProductVariant (list price) + a B2C price-book item when a B2C
 *     book exists, exactly like the bulk import in api/internal.js.
 *   - Photos resized to WebP and uploaded as "<slug>_thumbnail.webp" plus
 *     "<slug>_<n>.webp", the names s3-images.js parses for gallery order.
 *   - ProductImage rows holding those same public S3 URLs, so the catalog still
 *     shows the photos on an environment that has no AWS credentials (the S3
 *     folder wins wherever listing *is* configured — same URLs either way).
 *
 * Source photos are the jewellery shots already in public/. There are fewer
 * shots than products, so several products share one — and where a product's
 * metal differs from the shot's, `tint` recolours the metal on the way out
 * (yellow gold -> white gold / rose gold / oxidised silver). Products whose
 * shot already shows the right metal carry no tint, and shots with a model in
 * frame are only ever used untinted so skin tones are never shifted.
 *
 * Credentials come from the standard AWS chain (~/.aws/credentials or AWS_*
 * env vars), so no key has to live in .env.
 *
 * Dry-run by default; pass --apply to write.
 *   node --env-file=.env scripts/seed-dummy-products.mjs
 *   node --env-file=.env scripts/seed-dummy-products.mjs --apply
 *
 * Flags:
 *   --apply              actually upload and write (default: report only)
 *   --overwrite          re-upload photos and update products that already exist
 *   --skip-s3            database only, no uploads (rows point at the S3 URLs
 *                        the upload would have created)
 *   --remove             delete exactly these seeded products and their S3
 *                        folders, leaving anything else in the bucket alone
 *   --category=<name>    limit to one category (repeatable), e.g. --category=Rings
 *   --bucket=<name>      override AWS_S3_BUCKET (default: osiyaninc)
 *   --prefix=<name>      override AWS_S3_BASE_PREFIX (default: Osiyan-product-images)
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  S3Client,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { prisma } from '../server/api/db.js'
import { syncStoneSizesInUse } from '../server/api/stone-size-source.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(HERE, '..', 'public')

function flag(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
function flags(name) {
  return process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3))
}

const apply = process.argv.includes('--apply')
const overwrite = process.argv.includes('--overwrite')
const skipS3 = process.argv.includes('--skip-s3')
const remove = process.argv.includes('--remove')
const onlyCategories = flags('category').map((c) => c.toLowerCase())

const REGION = process.env.AWS_REGION || 'us-east-1'
const BUCKET = flag('bucket') || process.env.AWS_S3_BUCKET || 'osiyaninc'
const BASE_PREFIX = (flag('prefix') || process.env.AWS_S3_BASE_PREFIX || 'Osiyan-product-images').replace(
  /\/+$/,
  '',
)

// Web-friendly output size for the demo photos. The originals in public/ range
// from 6 KB line art to a 4 MB hero shot; one WebP pass makes the whole folder
// consistent and small.
const MAX_EDGE = 1200
const WEBP_QUALITY = 82

// Metal recolouring, applied to a yellow-gold source shot so it reads as the
// metal the product is actually described in. Hue rotation only moves colour
// that is already there, which is why these only ever run yellow -> other.
const METAL_TINT = {
  white: { saturation: 0.1, brightness: 1.06 },
  rose: { hue: -22, saturation: 0.95 },
  oxidised: { saturation: 0.06, brightness: 0.94 },
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const DIAMOND_QUALITIES = ['VVS-VS / GH', 'VS / GH', 'VS-SI / GH', 'SI-I / GH']
const RING_SIZES = ['10', '11', '12', '13', '14', '15', '16', '17', '18']
const BANGLE_SIZES = ['2.2', '2.4', '2.6', '2.8']
const NECKLACE_SIZES = ['16"', '18"', '20"', '22"']

function goldRingOptions({ shapes, sizes }) {
  return {
    diamondQualities: DIAMOND_QUALITIES,
    metalPurities: ['14k Gold', '18k Gold', '22k Gold'],
    centerShapes: shapes,
    centerStoneSizes: sizes,
    stoneTypes: ['Natural Diamond', 'Lab-Grown Diamond', 'Moissanite'],
    ringSizes: RING_SIZES,
  }
}
function earringOptions({ shapes = [], sizes = [], stoneTypes } = {}) {
  return {
    diamondQualities: DIAMOND_QUALITIES,
    metalPurities: ['14k Gold', '18k Gold'],
    centerShapes: shapes,
    centerStoneSizes: sizes,
    stoneTypes: stoneTypes || ['Natural Diamond', 'Lab-Grown Diamond'],
  }
}
function necklaceOptions({ shapes = [], sizes = [] } = {}) {
  return {
    diamondQualities: DIAMOND_QUALITIES,
    metalPurities: ['14k Gold', '18k Gold', '22k Gold'],
    centerShapes: shapes,
    centerStoneSizes: sizes,
    necklaceSizes: NECKLACE_SIZES,
  }
}
function bangleOptions() {
  return {
    diamondQualities: DIAMOND_QUALITIES,
    metalPurities: ['18k Gold', '22k Gold'],
    bangleSizes: BANGLE_SIZES,
  }
}
function silverOptions(extra = {}) {
  return { metalPurities: ['Sterling Silver'], ...extra }
}

/**
 * Demo catalog: five products per category.
 *   photos — filenames in public/; the first becomes the product-card thumbnail
 *   tint   — recolour the metal in those shots ('white' | 'rose' | 'oxidised'),
 *            omitted when the shot already shows the product's metal
 *   price  — whole-dollar list price (ProductVariant.listPricePaise holds USD
 *            units in this codebase — see formatUsd in product-presenter.js)
 */
const PRODUCTS = [
  // ---------------------------------------------------------------- Rings ---
  {
    slug: 'amrita-halo-ring',
    title: 'Amrita Halo Ring',
    category: 'Rings',
    subtype: 'cluster',
    material: 'gold',
    color: 'rose',
    price: 2480,
    description:
      'A brilliant-cut centre stone ringed by a halo of pavé diamonds in warm rose gold, on a tapered band that keeps the silhouette light on the hand.',
    styleTags: ['bridal', 'classic'],
    stoneTags: ['diamond'],
    isBestSeller: true,
    rating: 4.8,
    reviewCount: 96,
    attributes: { grossWeight: '4.4 g', diamondCarats: '0.92 ct', diamondQuantity: '37' },
    options: goldRingOptions({ shapes: ['Round', 'Oval', 'Cushion'], sizes: ['6×6', '7×7', '7×5'] }),
    photos: ['celeste-solitaire-ring-1.webp', 'celeste-solitaire-ring-2.webp'],
  },
  {
    slug: 'surya-solitaire-ring',
    title: 'Surya Solitaire Ring',
    category: 'Rings',
    subtype: 'solitaire',
    material: 'gold',
    color: 'white',
    price: 3150,
    description:
      'A single dominant round centre diamond in a four-prong white-gold setting, shoulders lined with pavé. Built for an engagement and made to be worn every day after.',
    styleTags: ['bridal', 'minimal'],
    stoneTags: ['diamond'],
    isNewArrival: true,
    rating: 4.9,
    reviewCount: 64,
    attributes: { grossWeight: '4.8 g', diamondCarats: '1.05 ct', diamondQuantity: '1' },
    options: goldRingOptions({ shapes: ['Round', 'Princess', 'Pear'], sizes: ['6×6', '7×7', '8×6'] }),
    photos: ['celeste-solitaire-ring-1.webp'],
    tint: 'white',
  },
  {
    slug: 'jharokha-openwork-ring',
    title: 'Jharokha Openwork Ring',
    category: 'Rings',
    subtype: 'open-ring',
    material: 'gold',
    color: 'yellow',
    price: 1180,
    description:
      'Interlaced bands drawn from the carved jharokha windows of Rajasthan, cut through 18k gold and traced with pavé so the ring reads airy from every angle.',
    styleTags: ['traditional', 'modern'],
    stoneTags: ['diamond'],
    rating: 4.6,
    reviewCount: 22,
    attributes: { grossWeight: '5.2 g', diamondCarats: '0.36 ct', diamondQuantity: '29' },
    options: goldRingOptions({ shapes: ['Round'], sizes: ['5×5', '6×6'] }),
    photos: ['ring-2.jpg', 'ring-1.jpg'],
  },
  {
    slug: 'rani-emerald-ring',
    title: 'Rani Emerald Ring',
    category: 'Rings',
    subtype: 'multi-stone',
    material: 'gold',
    color: 'yellow',
    price: 2940,
    description:
      'Twin emerald-cut emeralds set at the open ends of a bypass band in polished yellow gold — a colour-forward take on the heirloom cocktail ring.',
    styleTags: ['statement', 'traditional'],
    stoneTags: ['emerald', 'diamond'],
    isNewArrival: true,
    rating: 4.7,
    reviewCount: 41,
    attributes: { grossWeight: '5.6 g', diamondCarats: '0.48 ct', diamondQuantity: '24' },
    options: goldRingOptions({ shapes: ['Emerald', 'Oval', 'Marquise'], sizes: ['7×5', '8×6', '9×7'] }),
    photos: ['verde-duet-ring-1.png', 'verde-duet-ring-2.png'],
  },
  {
    slug: 'chandani-silver-band',
    title: 'Chandani Silver Band',
    category: 'Rings',
    subtype: 'open-ring',
    material: 'silver',
    color: 'oxidised',
    price: 64,
    description:
      'A braided sterling band with a hand-set line of white stones along the twist. Wear it alone or stacked three deep.',
    styleTags: ['minimal', 'everyday'],
    stoneTags: [],
    rating: 4.4,
    reviewCount: 37,
    attributes: { grossWeight: '2.9 g' },
    options: silverOptions({ ringSizes: RING_SIZES }),
    photos: ['ring-1.jpg'],
    tint: 'oxidised',
  },

  // ------------------------------------------------------------- Earrings ---
  {
    slug: 'mehrangarh-jhumka',
    title: 'Mehrangarh Jhumka',
    category: 'Earrings',
    subtype: 'jhumka',
    material: 'silver',
    color: 'oxidised',
    price: 86,
    description:
      'A domed oxidised silver jhumka with granulated beadwork along the rim and a fringe of freshwater pearls that moves with you. Traditional filigree, handworked in Jaipur.',
    styleTags: ['traditional', 'bridal'],
    stoneTags: ['pearl'],
    isBestSeller: true,
    rating: 4.8,
    reviewCount: 148,
    attributes: { grossWeight: '7.4 g' },
    options: silverOptions(),
    photos: ['earring-er03525-2.png', 'earring-er03525-1.png'],
  },
  {
    slug: 'bindu-diamond-studs',
    title: 'Bindu Diamond Studs',
    category: 'Earrings',
    subtype: 'stud',
    material: 'gold',
    color: 'yellow',
    price: 1190,
    description:
      'Sculptural yellow-gold studs curved around a cluster of round brilliants, on comfort-back posts. The pair you stop thinking about after a week.',
    styleTags: ['minimal', 'everyday'],
    stoneTags: ['diamond'],
    isBestSeller: true,
    rating: 4.9,
    reviewCount: 211,
    attributes: { grossWeight: '2.1 g', diamondCarats: '0.60 ct', diamondQuantity: '14' },
    options: earringOptions({ shapes: ['Round', 'Princess'], sizes: ['5×5', '6×6'] }),
    photos: ['earring-1.jpg', 'earring-2.jpg'],
  },
  {
    slug: 'trishul-temple-earrings',
    title: 'Trishul Temple Earrings',
    category: 'Earrings',
    subtype: 'drop',
    material: 'silver',
    color: 'oxidised',
    price: 92,
    description:
      'The trishul rendered as a long oxidised silver drop, coiled at the base and finished by hand so each pair carries its own marks.',
    styleTags: ['traditional', 'statement'],
    stoneTags: [],
    isNewArrival: true,
    rating: 4.7,
    reviewCount: 58,
    attributes: { grossWeight: '5.8 g' },
    options: silverOptions(),
    photos: ['isha-chandelier-1.png', 'isha-chandelier-2.png'],
  },
  {
    slug: 'sanjhi-rose-gold-earrings',
    title: 'Sanjhi Rose Gold Earrings',
    category: 'Earrings',
    subtype: 'stud',
    material: 'gold',
    color: 'rose',
    price: 2610,
    description:
      'Paper-cut Sanjhi motifs traced in rose gold and lined with pavé, curving up behind the lobe. An occasion earring with real presence and surprisingly little weight.',
    styleTags: ['statement', 'bridal'],
    stoneTags: ['diamond'],
    rating: 4.8,
    reviewCount: 33,
    attributes: { grossWeight: '8.9 g', diamondCarats: '0.71 ct', diamondQuantity: '52' },
    options: earringOptions({ shapes: ['Pear', 'Oval'], sizes: ['8×6', '9×7'] }),
    photos: ['earring-1.jpg'],
    tint: 'rose',
  },
  {
    slug: 'tara-gold-hoops',
    title: 'Tara Gold Hoops',
    category: 'Earrings',
    subtype: 'stud',
    material: 'gold',
    color: 'yellow',
    price: 640,
    description:
      'Small 14k hoops with a single bezel-set diamond at the front, light enough for a full day and small enough to sleep in.',
    styleTags: ['minimal', 'everyday'],
    stoneTags: ['diamond'],
    rating: 4.5,
    reviewCount: 74,
    attributes: { grossWeight: '1.8 g', diamondCarats: '0.08 ct', diamondQuantity: '2' },
    options: earringOptions({ shapes: ['Round'], sizes: ['5×5'] }),
    photos: ['amara-hoop-earrings-2.png', 'amara-hoop-earrings-1.png'],
  },

  // ------------------------------------------------------------ Necklaces ---
  {
    slug: 'osiyan-lotus-pendant',
    title: 'Osiyan Lotus Pendant',
    category: 'Necklaces',
    subtype: 'pendant',
    material: 'gold',
    color: 'yellow',
    price: 1340,
    description:
      'The lotus carved into the Osiyan temple walls, rendered as a layered gold pendant with a pear-cut drop and hung on a fine cable chain.',
    styleTags: ['traditional', 'minimal'],
    stoneTags: ['diamond'],
    isBestSeller: true,
    rating: 4.8,
    reviewCount: 118,
    attributes: { grossWeight: '5.1 g', diamondCarats: '0.26 ct', diamondQuantity: '11' },
    options: necklaceOptions({ shapes: ['Pear', 'Round'], sizes: ['7×5', '6×6'] }),
    photos: ['pendant-1.jpg'],
  },
  {
    slug: 'gulaab-diamond-pendant',
    title: 'Gulaab Diamond Pendant',
    category: 'Necklaces',
    subtype: 'pendant',
    material: 'gold',
    color: 'white',
    price: 2210,
    description:
      'A rose in bloom, petals set with graduated pavé diamonds in white gold, hung from an 18-inch cable chain.',
    styleTags: ['modern', 'bridal'],
    stoneTags: ['diamond'],
    isNewArrival: true,
    rating: 4.7,
    reviewCount: 52,
    attributes: { grossWeight: '4.6 g', diamondCarats: '0.55 ct', diamondQuantity: '44' },
    options: necklaceOptions({ shapes: ['Round', 'Pear'], sizes: ['6×6', '7×5'] }),
    photos: ['pendant-1.jpg'],
    tint: 'white',
  },
  {
    slug: 'maru-collar-necklace',
    title: 'Maru Collar Necklace',
    category: 'Necklaces',
    subtype: 'statement-necklace',
    material: 'gold',
    color: 'white',
    price: 4480,
    description:
      'An unbroken line of bezel-set brilliants graduating toward the throat in white gold, with a matching pair of drops. The piece the rest of the outfit answers to.',
    styleTags: ['statement', 'bridal'],
    stoneTags: ['diamond'],
    rating: 4.9,
    reviewCount: 27,
    attributes: { grossWeight: '22.4 g', diamondCarats: '3.20 ct', diamondQuantity: '96' },
    options: necklaceOptions({ shapes: ['Round', 'Oval'], sizes: ['5×5', '6×4'] }),
    photos: ['ziya-silver-collar-2.png', 'ziya-silver-collar-1.png'],
  },
  {
    slug: 'sitara-drop-necklace',
    title: 'Sitara Drop Necklace',
    category: 'Necklaces',
    subtype: 'pendant',
    material: 'gold',
    color: 'rose',
    price: 3120,
    description:
      'A single rose-gold teardrop on a whisper-fine chain, sized to sit just below the collarbone and layer with anything else you already own.',
    styleTags: ['modern', 'minimal'],
    stoneTags: ['diamond'],
    isNewArrival: true,
    rating: 4.6,
    reviewCount: 45,
    attributes: { grossWeight: '11.8 g', diamondCarats: '0.62 ct', diamondQuantity: '31' },
    options: necklaceOptions({ shapes: ['Pear', 'Oval'], sizes: ['8×6', '7×5'] }),
    photos: ['pendant-2.jpg'],
  },
  {
    slug: 'nadi-silver-pendant',
    title: 'Nadi Silver Pendant',
    category: 'Necklaces',
    subtype: 'pendant',
    material: 'silver',
    color: 'oxidised',
    price: 72,
    description:
      'A slim sterling river-curve pendant on an 18-inch chain — the quiet piece that goes with everything in the drawer.',
    styleTags: ['minimal', 'everyday'],
    stoneTags: [],
    rating: 4.4,
    reviewCount: 61,
    attributes: { grossWeight: '3.8 g' },
    options: silverOptions({ necklaceSizes: NECKLACE_SIZES }),
    photos: ['pendant-1.jpg'],
    tint: 'oxidised',
  },

  // ------------------------------------------------------------ Bracelets ---
  {
    slug: 'anokhi-nameplate-bracelet',
    title: 'Anokhi Nameplate Bracelet',
    category: 'Bracelets',
    subtype: 'chain-bracelet',
    material: 'gold',
    color: 'yellow',
    price: 980,
    description:
      'A fine yellow-gold rolo chain carrying your initials in a modern serif, cut to order. Lobster clasp, adjustable at two lengths.',
    styleTags: ['minimal', 'everyday'],
    stoneTags: [],
    isBestSeller: true,
    rating: 4.5,
    reviewCount: 67,
    attributes: { grossWeight: '4.9 g' },
    options: { metalPurities: ['14k Gold', '18k Gold', '22k Gold'], bangleSizes: BANGLE_SIZES },
    photos: ['bracelet-1.jpg'],
  },
  {
    slug: 'bandhani-tennis-bracelet',
    title: 'Bandhani Tennis Bracelet',
    category: 'Bracelets',
    subtype: 'chain-bracelet',
    material: 'gold',
    color: 'white',
    price: 3480,
    description:
      'An unbroken line of claw-set round brilliants in white gold, spaced the way bandhani dots march across cloth. Double safety catch.',
    styleTags: ['classic', 'bridal'],
    stoneTags: ['diamond'],
    isNewArrival: true,
    rating: 4.9,
    reviewCount: 39,
    attributes: { grossWeight: '7.8 g', diamondCarats: '2.10 ct', diamondQuantity: '42' },
    options: {
      diamondQualities: DIAMOND_QUALITIES,
      metalPurities: ['14k Gold', '18k Gold'],
      centerShapes: ['Round'],
      centerStoneSizes: ['5×5', '6×6'],
      bangleSizes: BANGLE_SIZES,
    },
    photos: ['veda-silver-bracelet-1.jpg'],
  },
  {
    slug: 'preeti-heart-link-bracelet',
    title: 'Preeti Heart Link Bracelet',
    category: 'Bracelets',
    subtype: 'chain-bracelet',
    material: 'gold',
    color: 'white',
    price: 1690,
    description:
      'Alternating heart and flower stations set with white stones along a white-gold chain, with an extender so it sits where you want it.',
    styleTags: ['modern', 'everyday'],
    stoneTags: ['diamond'],
    rating: 4.7,
    reviewCount: 88,
    attributes: { grossWeight: '9.6 g', diamondCarats: '0.88 ct', diamondQuantity: '34' },
    options: {
      diamondQualities: DIAMOND_QUALITIES,
      metalPurities: ['14k Gold', '18k Gold'],
      bangleSizes: BANGLE_SIZES,
    },
    photos: ['indra-link-bracelet-1.jpg'],
  },
  {
    slug: 'kirti-cuff-bracelet',
    title: 'Kirti Cuff Bracelet',
    category: 'Bracelets',
    subtype: 'cuff',
    material: 'gold',
    color: 'rose',
    price: 2260,
    description:
      'A smooth rose-gold cuff turned from a single tube, high-polished inside and out. Springs open just enough to slip on.',
    styleTags: ['modern', 'statement'],
    stoneTags: [],
    rating: 4.6,
    reviewCount: 29,
    attributes: { grossWeight: '12.2 g' },
    options: bangleOptions(),
    photos: ['veer-gold-kada-1.png'],
    tint: 'rose',
  },
  {
    slug: 'roopa-silver-bracelet',
    title: 'Roopa Silver Bracelet',
    category: 'Bracelets',
    subtype: 'chain-bracelet',
    material: 'silver',
    color: 'oxidised',
    price: 68,
    description:
      'A sterling line bracelet with a hand-finished matte face, sized for daily wear and priced to own in twos.',
    styleTags: ['minimal', 'everyday'],
    stoneTags: [],
    rating: 4.3,
    reviewCount: 52,
    attributes: { grossWeight: '8.1 g' },
    options: silverOptions({ bangleSizes: BANGLE_SIZES }),
    photos: ['veda-silver-bracelet-1.jpg'],
    tint: 'oxidised',
  },

  // -------------------------------------------------------------- Bangles ---
  {
    slug: 'ranthambore-gold-kada',
    title: 'Ranthambore Gold Kada',
    category: 'Bangles',
    subtype: 'cuff',
    material: 'gold',
    color: 'yellow',
    price: 2870,
    description:
      'A heavyweight 22k kada, ridged along the face and finished to a mirror polish. Built to be handed down.',
    styleTags: ['traditional', 'statement'],
    stoneTags: [],
    isBestSeller: true,
    rating: 4.8,
    reviewCount: 54,
    attributes: { grossWeight: '18.6 g' },
    options: bangleOptions(),
    photos: ['veer-gold-kada-1.png', 'veer-gold-kada-2.png'],
  },
  {
    slug: 'padmini-white-gold-bangle',
    title: 'Padmini White Gold Bangle',
    category: 'Bangles',
    subtype: 'cuff',
    material: 'gold',
    color: 'white',
    price: 2980,
    description:
      'A slim white-gold bangle turned from a single band, hinged at the back so it opens without losing the line.',
    styleTags: ['bridal', 'classic'],
    stoneTags: [],
    isNewArrival: true,
    rating: 4.9,
    reviewCount: 31,
    attributes: { grossWeight: '10.4 g' },
    options: bangleOptions(),
    photos: ['veer-gold-kada-2.png'],
    tint: 'white',
  },
  {
    slug: 'jodha-emerald-bangles',
    title: 'Jodha Emerald Bangles',
    category: 'Bangles',
    subtype: 'cuff',
    material: 'gold',
    color: 'yellow',
    price: 2120,
    description:
      'A set of three narrow 22k bangles — one channel-set with emeralds, one pavé, one plain — meant to be worn stacked and heard.',
    styleTags: ['traditional', 'bridal'],
    stoneTags: ['emerald', 'diamond'],
    rating: 4.7,
    reviewCount: 43,
    attributes: { grossWeight: '14.2 g', diamondCarats: '0.44 ct', diamondQuantity: '21' },
    options: bangleOptions(),
    photos: ['osiyan-yoga-bangles.jpg'],
  },
  {
    slug: 'sanchi-rose-gold-bangle',
    title: 'Sanchi Rose Gold Bangle',
    category: 'Bangles',
    subtype: 'cuff',
    material: 'gold',
    color: 'rose',
    price: 1780,
    description:
      'Rose gold drawn into a clean round profile with a tuck-away clasp — the bangle that goes on in the morning and stays on.',
    styleTags: ['modern', 'everyday'],
    stoneTags: [],
    rating: 4.6,
    reviewCount: 25,
    attributes: { grossWeight: '9.1 g' },
    options: bangleOptions(),
    photos: ['veer-gold-kada-1.png'],
    tint: 'rose',
  },
  {
    slug: 'meenal-silver-bangle',
    title: 'Meenal Silver Bangle',
    category: 'Bangles',
    subtype: 'cuff',
    material: 'silver',
    color: 'oxidised',
    price: 84,
    description:
      'Oxidised sterling with a ridged crest and a soft antique finish — the everyday bangle that survives a whole monsoon.',
    styleTags: ['traditional', 'everyday'],
    stoneTags: [],
    rating: 4.4,
    reviewCount: 58,
    attributes: { grossWeight: '11.3 g' },
    options: silverOptions({ bangleSizes: BANGLE_SIZES }),
    photos: ['veer-gold-kada-2.png'],
    tint: 'oxidised',
  },

  // --------------------------------------------------------- Mangal Sutra ---
  {
    slug: 'raaga-mangalsutra',
    title: 'Raaga Mangal Sutra',
    category: 'Mangal Sutra',
    subtype: 'mangal-sutra',
    material: 'gold',
    color: 'yellow',
    price: 940,
    description:
      'A 22k gold pendant set with a cluster of brilliants, strung on the traditional black-bead chain with gold spacers throughout.',
    styleTags: ['traditional', 'bridal'],
    stoneTags: ['black-beads', 'diamond'],
    isBestSeller: true,
    rating: 4.8,
    reviewCount: 72,
    attributes: { grossWeight: '4.2 g', diamondCarats: '0.22 ct', diamondQuantity: '13' },
    options: { metalPurities: ['18k Gold', '22k Gold'], necklaceSizes: NECKLACE_SIZES },
    photos: ['raaga-mangalsutra-1.png', 'raaga-mangalsutra-2.png'],
  },
  {
    slug: 'anant-knot-mangalsutra',
    title: 'Anant Knot Mangal Sutra',
    category: 'Mangal Sutra',
    subtype: 'mangal-sutra',
    material: 'gold',
    color: 'yellow',
    price: 860,
    description:
      'An endless-knot motif in polished gold on a single black-bead strand, adjustable to sit at any neckline.',
    styleTags: ['modern', 'bridal'],
    stoneTags: ['black-beads'],
    isNewArrival: true,
    rating: 4.7,
    reviewCount: 49,
    attributes: { grossWeight: '3.4 g' },
    options: { metalPurities: ['14k Gold', '18k Gold', '22k Gold'], necklaceSizes: NECKLACE_SIZES },
    photos: ['necklace-1.jpg'],
  },
  {
    slug: 'tulsi-bead-mangalsutra',
    title: 'Tulsi Bead Mangal Sutra',
    category: 'Mangal Sutra',
    subtype: 'mangal-sutra',
    material: 'gold',
    color: 'yellow',
    price: 1120,
    description:
      'Gold tulsi beads alternate with the black beads along the full length, closing on a small diamond-set pendant.',
    styleTags: ['traditional', 'bridal'],
    stoneTags: ['black-beads', 'diamond'],
    rating: 4.6,
    reviewCount: 34,
    attributes: { grossWeight: '5.6 g', diamondCarats: '0.18 ct', diamondQuantity: '9' },
    options: {
      diamondQualities: DIAMOND_QUALITIES,
      metalPurities: ['18k Gold', '22k Gold'],
      necklaceSizes: NECKLACE_SIZES,
    },
    photos: ['raaga-mangalsutra-1.png', 'necklace-1.jpg'],
  },
  {
    slug: 'viraasat-heritage-mangalsutra',
    title: 'Viraasat Heritage Mangal Sutra',
    category: 'Mangal Sutra',
    subtype: 'mangal-sutra',
    material: 'gold',
    color: 'yellow',
    price: 1480,
    description:
      'A long ceremonial mangal sutra: twin black-bead strands, gold spacers throughout, and a temple-work pendant with a jhumki drop.',
    styleTags: ['traditional', 'bridal'],
    stoneTags: ['black-beads'],
    rating: 4.9,
    reviewCount: 21,
    attributes: { grossWeight: '8.8 g' },
    options: { metalPurities: ['22k Gold'], necklaceSizes: NECKLACE_SIZES },
    photos: ['raaga-mangalsutra-2.png', 'raaga-mangalsutra-1.png'],
  },
  {
    slug: 'saanjh-minimal-mangalsutra',
    title: 'Saanjh Minimal Mangal Sutra',
    category: 'Mangal Sutra',
    subtype: 'mangal-sutra',
    material: 'gold',
    color: 'rose',
    price: 720,
    description:
      'A pared-back mangal sutra for daily wear: one fine rose-gold chain, a handful of black beads, and a bezel-set solitaire.',
    styleTags: ['minimal', 'modern'],
    stoneTags: ['black-beads', 'diamond'],
    isNewArrival: true,
    rating: 4.5,
    reviewCount: 56,
    attributes: { grossWeight: '2.8 g', diamondCarats: '0.10 ct', diamondQuantity: '1' },
    options: {
      diamondQualities: DIAMOND_QUALITIES,
      metalPurities: ['14k Gold', '18k Gold'],
      necklaceSizes: NECKLACE_SIZES,
    },
    photos: ['necklace-1.jpg'],
    tint: 'rose',
  },
]

// ---------------------------------------------------------------------------
// S3
// ---------------------------------------------------------------------------

let cachedClient = null
function getClient() {
  // Default credential chain: AWS_* env vars, then ~/.aws/credentials.
  if (!cachedClient) cachedClient = new S3Client({ region: REGION })
  return cachedClient
}

function publicUrlForKey(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURI(key)}`
}

// "<slug>_thumbnail.webp" for the card image, then "<slug>_2.webp" onwards —
// the names server/api/s3-images.js parses to order a gallery.
function keyForPhoto(slug, index) {
  const name = index === 0 ? `${slug}_thumbnail` : `${slug}_${index + 1}`
  return `${BASE_PREFIX}/${slug}/${name}.webp`
}

async function listFolder(slug) {
  const prefix = `${BASE_PREFIX}/${slug}/`
  const keys = []
  let token
  do {
    const res = await getClient().send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
    )
    for (const obj of res.Contents || []) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function toWebp(filename, tint) {
  const buffer = await readFile(path.join(PUBLIC_DIR, filename))
  let pipeline = sharp(buffer)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
  if (tint && METAL_TINT[tint]) pipeline = pipeline.modulate(METAL_TINT[tint])
  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
}

async function uploadPhotos(product) {
  const uploaded = []
  for (const [index, filename] of product.photos.entries()) {
    const key = keyForPhoto(product.slug, index)
    const body = await toWebp(filename, product.tint)
    await getClient().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
    uploaded.push({ key, url: publicUrlForKey(key), bytes: body.length })
  }
  return uploaded
}

async function deleteFolder(slug) {
  const keys = await listFolder(slug)
  if (!keys.length) return 0
  for (let i = 0; i < keys.length; i += 1000) {
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    )
  }
  return keys.length
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function skuFor(slug) {
  return `${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 32)}-DEMO`
}

function productData(product) {
  return {
    slug: product.slug,
    title: product.title,
    category: product.category,
    subtype: product.subtype || null,
    material: product.material,
    color: product.color,
    description: product.description,
    productAttributes: product.attributes || null,
    customizationOptions: product.options || null,
    styleTags: product.styleTags || [],
    stoneTags: product.stoneTags || [],
    isNewArrival: Boolean(product.isNewArrival),
    isBestSeller: Boolean(product.isBestSeller),
    rating: product.rating ?? null,
    reviewCount: product.reviewCount ?? null,
    active: true,
  }
}

// Mirrors upsertB2CPriceBookItem in api/internal.js: only writes when a B2C
// book already exists — the catalog falls back to the variant price otherwise.
async function upsertB2CPrice(tx, productId, price) {
  const book = await tx.priceBook.findFirst({ where: { channel: 'B2C', active: true } })
  if (!book) return false
  await tx.priceBookItem.upsert({
    where: { priceBookId_productId_minQty: { priceBookId: book.id, productId, minQty: 1 } },
    update: { pricePaise: price },
    create: { priceBookId: book.id, productId, pricePaise: price, minQty: 1 },
  })
  return true
}

async function writeProduct(product, images) {
  const data = productData(product)
  await prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { slug: product.slug }, select: { id: true } })
    const row = existing
      ? await tx.product.update({ where: { id: existing.id }, data })
      : await tx.product.create({ data })

    const variantSku = skuFor(product.slug)
    const variant = await tx.productVariant.findUnique({ where: { sku: variantSku }, select: { id: true } })
    if (variant) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { productId: row.id, title: product.title, listPricePaise: product.price, currency: 'USD', active: true },
      })
    } else {
      await tx.productVariant.create({
        data: {
          productId: row.id,
          sku: variantSku,
          title: product.title,
          listPricePaise: product.price,
          currency: 'USD',
          active: true,
        },
      })
    }

    await upsertB2CPrice(tx, row.id, product.price)

    await tx.productImage.deleteMany({ where: { productId: row.id } })
    if (images.length) {
      await tx.productImage.createMany({
        data: images.map((image, index) => ({
          productId: row.id,
          url: image.url,
          alt: `${product.title} — view ${index + 1}`,
          sortOrder: index,
          active: true,
        })),
      })
    }
  })
  await syncStoneSizesInUse(product.options?.centerStoneSizes)
}

// ---------------------------------------------------------------------------

function inScope(product) {
  return !onlyCategories.length || onlyCategories.includes(product.category.toLowerCase())
}

async function runRemove(scope) {
  let deletedProducts = 0
  let deletedObjects = 0
  for (const product of scope) {
    const existing = await prisma.product.findUnique({ where: { slug: product.slug }, select: { id: true } })
    const objects = skipS3 ? [] : await listFolder(product.slug)
    console.log(
      `${product.slug}: ${existing ? 'product row' : 'no product row'}, ${objects.length} S3 object(s)`,
    )
    if (!apply) continue
    if (existing) {
      // Variants, images and price-book items cascade from Product.
      await prisma.product.delete({ where: { id: existing.id } })
      deletedProducts++
    }
    if (!skipS3) deletedObjects += await deleteFolder(product.slug)
  }
  console.log('\n--- summary ---')
  console.log(`products deleted: ${deletedProducts}`)
  console.log(`S3 objects deleted: ${deletedObjects}`)
  if (!apply) console.log('\nDRY RUN — re-run with --apply to delete.')
}

async function runSeed(scope) {
  const totals = { created: 0, updated: 0, skipped: 0, uploaded: 0, bytes: 0 }

  for (const product of scope) {
    const existing = await prisma.product.findUnique({ where: { slug: product.slug }, select: { id: true } })
    if (existing && !overwrite) {
      totals.skipped++
      console.log(`${product.slug}: exists — skipped (pass --overwrite to update)`)
      continue
    }

    const planned = product.photos.map((filename, index) => ({
      filename,
      key: keyForPhoto(product.slug, index),
      url: publicUrlForKey(keyForPhoto(product.slug, index)),
    }))

    let images = planned
    if (!skipS3) {
      const inBucket = await listFolder(product.slug)
      if (inBucket.length && !overwrite) {
        console.log(`  ${product.slug}: S3 folder already holds ${inBucket.length} object(s) — not re-uploading`)
      } else if (apply) {
        images = await uploadPhotos(product)
        totals.uploaded += images.length
        totals.bytes += images.reduce((n, i) => n + i.bytes, 0)
      }
    }

    if (!apply) {
      console.log(
        `${product.slug}: would ${existing ? 'update' : 'create'} (${product.category}, $${product.price}) with ${planned.length} photo(s)${product.tint ? ` tinted ${product.tint}` : ''}`,
      )
      continue
    }

    await writeProduct(product, images)
    if (existing) totals.updated++
    else totals.created++
    console.log(
      `${product.slug}: ${existing ? 'updated' : 'created'} (${product.category}, $${product.price}, ${images.length} photo(s)${product.tint ? ` tinted ${product.tint}` : ''})`,
    )
  }

  console.log('\n--- summary ---')
  console.log(`products created: ${totals.created}`)
  console.log(`products updated: ${totals.updated}`)
  console.log(`products skipped: ${totals.skipped}`)
  console.log(`photos uploaded:  ${totals.uploaded} (${(totals.bytes / 1048576).toFixed(1)} MB)`)
  if (!apply) console.log('\nDRY RUN — re-run with --apply to write.')
}

async function run() {
  const scope = PRODUCTS.filter(inScope)
  if (!scope.length) throw new Error(`No products match --category=${onlyCategories.join(',')}`)

  const byCategory = scope.reduce((acc, p) => ({ ...acc, [p.category]: (acc[p.category] || 0) + 1 }), {})
  console.log(`bucket: s3://${BUCKET}/${BASE_PREFIX}/  (region ${REGION})`)
  console.log(`${scope.length} demo product(s) in scope:`, byCategory)
  if (skipS3) console.log('--skip-s3: no uploads; image rows still point at the S3 URLs\n')
  else console.log('')

  if (remove) return runRemove(scope)
  return runSeed(scope)
}

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
