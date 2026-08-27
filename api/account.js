import { prisma } from '../server/api/db.js'
import { toApiProduct } from '../server/api/product-presenter.js'
import { getCatalogProducts } from '../server/api/products-source.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'
import { creditLimitToUsd } from '../server/api/money.js'
import { createPresignedServiceUpload, isUploadConfigured } from '../server/api/s3-upload.js'
import {
  createServiceRequestRecord,
  toServiceRequestPayload,
} from '../server/api/service-requests.js'
import {
  createSignupRequestRecord,
  notifySignupRequested,
  toSignupRequestPayload,
} from '../server/api/signup-requests.js'
import {
  MemoError,
  convertMemoToOrder,
  createMemo,
  extendMemo,
  getMemoOutstandingPaise,
  getMemoCustomer,
  formatMemoMoney,
  MEMO_PAYLOAD_INCLUDE,
  toMemoPayload,
} from '../server/api/memo.js'
import { getMyOrders } from '../server/api/checkout.js'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {}
  try {
    return JSON.parse(req.body || '{}')
  } catch {
    return {}
  }
}

function getMode(req, body) {
  return String(req?.query?.mode || body?.mode || '')
    .trim()
    .toLowerCase()
}

function parseUserId(req, body) {
  return String(req?.query?.userId || body?.userId || '').trim()
}

function normalizeCustomization(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const normalized = {}

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = String(rawKey).trim()
    if (!key) continue

    if (key === 'isCustomized') {
      if (rawValue === true) normalized.isCustomized = true
      continue
    }

    const value = typeof rawValue === 'string' ? rawValue.trim() : ''
    if (value) normalized[key] = value
  }

  if (!Object.keys(normalized).length) return null

  const sortedEntries = Object.entries(normalized).sort(([a], [b]) => {
    if (a === 'isCustomized') return -1
    if (b === 'isCustomized') return 1
    return a.localeCompare(b)
  })

  return Object.fromEntries(sortedEntries)
}

function customizationSignature(input) {
  const normalized = normalizeCustomization(input)
  return normalized ? JSON.stringify(normalized) : ''
}

function toUserPayload(customer) {
  return {
    id: customer.id,
    name:
      [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() ||
      customer.email ||
      'User',
    email: customer.email,
    isInternal: Boolean(customer.isInternal),
    isAdmin: Boolean(customer.isAdmin),
    canMemo: Boolean(customer.canMemo),
    memoLimitPaise: customer.memoLimitPaise ?? null,
    memoDays: customer.memoDays ?? 30,
    canPayTerms: Boolean(customer.canPayTerms),
    termsLimitPaise: customer.termsLimitPaise ?? null,
    termsDays: customer.termsDays ?? 30,
  }
}

function isInternalEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return false
  const allowedEmails = String(process.env.INTERNAL_USER_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  const allowedDomains = String(process.env.INTERNAL_USER_DOMAINS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
  const domain = normalized.split('@')[1] || ''
  return allowedEmails.includes(normalized) || allowedDomains.includes(domain)
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false
  const [salt, savedHash] = stored.split(':')
  if (!salt || !savedHash) return false
  const computedHash = scryptSync(password, salt, 64).toString('hex')
  const a = Buffer.from(savedHash, 'hex')
  const b = Buffer.from(computedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function hashResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

function resolveSiteUrl(req) {
  const fromEnv = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const origin = String(req?.headers?.origin || '').trim().replace(/\/$/, '')
  if (origin) return origin
  const host = String(req?.headers?.host || '').trim()
  if (host) {
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
    return `${proto}://${host}`
  }
  return ''
}

async function sendResetEmail({ to, resetUrl }) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[account] RESEND_API_KEY not set; skipping reset email.')
    return { ok: false, skipped: true }
  }
  const from = String(process.env.RESEND_FROM || 'Kiana <onboarding@resend.dev>').trim()
  const safeUrl = String(resetUrl).replace(/"/g, '%22')
  const html = `
    <div style="background:#f7efeb;padding:32px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #f0ddda;border-radius:24px;overflow:hidden;">
        <div style="padding:32px;">
          <p style="margin:0 0 10px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:0.18em;text-transform:uppercase;color:#c6536b;">Kiana Jewels</p>
          <h1 style="margin:0 0 10px;font:400 28px/1.2 Georgia,'Times New Roman',serif;color:#2f2725;">Reset your password</h1>
          <p style="margin:0 0 22px;font:400 15px/1.7 Arial,sans-serif;color:#655854;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
          <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;background:#c6536b;color:#ffffff;font:600 13px/1 Arial,sans-serif;letter-spacing:0.08em;text-transform:uppercase;border-radius:12px;text-decoration:none;">Reset password</a>
          <p style="margin:24px 0 0;font:400 13px/1.6 Arial,sans-serif;color:#7b6b66;">If you did not request this, you can safely ignore this email — your password will not change.</p>
        </div>
      </div>
    </div>`
  const text = `Reset your Kiana password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'Reset your Kiana password', html, text }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Resend ${res.status}: ${t}`)
  }
  return { ok: true }
}

async function getOrCreateCart(customerId) {
  const existing = await prisma.cart.findFirst({
    where: { customerId, channel: 'B2C' },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing
  return prisma.cart.create({ data: { customerId, channel: 'B2C' } })
}

async function resolveCart(customerId, cartId) {
  if (cartId) {
    const byId = await prisma.cart.findFirst({
      where: { id: cartId, customerId, channel: 'B2C' },
    })
    if (byId) return byId
  }
  return getOrCreateCart(customerId)
}

async function resolveVariantBySlug(slug) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { variants: { where: { active: true }, orderBy: { listPricePaise: 'asc' } } },
  })
  if (!product || !product.variants.length) return null
  return product.variants[0]
}

async function resolveVariantByProductId(productId) {
  if (!productId) return null
  return prisma.productVariant.findFirst({
    where: { productId, active: true },
    orderBy: { listPricePaise: 'asc' },
  })
}

async function fetchCartItems(customerId, cartId) {
  const cart = await resolveCart(customerId, cartId)
  const rows = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: {
      variant: {
        include: {
          product: {
            include: {
              variants: { where: { active: true }, orderBy: { listPricePaise: 'asc' } },
              images: {
                where: { active: true },
                orderBy: { sortOrder: 'asc' },
                take: 2,
              },
              priceBookMap: {
                where: {
                  minQty: { lte: 1 },
                  priceBook: { active: true, channel: 'B2C' },
                },
                include: { priceBook: true },
                orderBy: [{ minQty: 'asc' }, { validFrom: 'desc' }],
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  const items = rows.map((row) => ({
    id: row.id,
    product: toApiProduct(row.variant.product, row.variant),
    qty: row.qty,
    customization: normalizeCustomization(row.customization),
  }))
  await enrichWithCatalogImages(items.map((item) => item.product))
  return items
}

// The wishlist/cart queries read images straight from the DB, but S3 is the
// source of truth for photos (see products-source.js). Replace them with the
// cached catalog's S3-resolved set wherever there is one: products whose photos
// live only in S3 would otherwise render nothing, and products still holding
// legacy base64 rows would render those instead of their S3 photos. DB rows
// remain the fallback for products with no S3 folder. Failures are non-fatal.
async function enrichWithCatalogImages(products) {
  const targets = Array.isArray(products) ? products.filter(Boolean) : []
  if (!targets.length) return
  try {
    const catalog = await getCatalogProducts()
    if (!Array.isArray(catalog) || !catalog.length) return
    const imagesBySlug = new Map(catalog.map((p) => [p.slug, p.images]))
    for (const product of targets) {
      const catalogImages = imagesBySlug.get(product.slug)
      if (Array.isArray(catalogImages) && catalogImages.length) {
        product.images = catalogImages
      }
    }
  } catch (err) {
    console.error('Catalog image enrich failed:', err?.message || err)
  }
}

async function fetchWishlistProducts(customerId) {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId },
    include: {
      product: {
        include: {
          variants: { where: { active: true }, orderBy: { listPricePaise: 'asc' } },
          images: {
            where: { active: true },
            orderBy: { sortOrder: 'asc' },
            take: 2,
          },
          priceBookMap: {
            where: {
              minQty: { lte: 1 },
              priceBook: { active: true, channel: 'B2C' },
            },
            include: { priceBook: true },
            orderBy: [{ minQty: 'asc' }, { validFrom: 'desc' }],
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  const products = rows.map((row) => ({
    ...toApiProduct(row.product),
    wishlistGroup: row.groupName || null,
  }))
  await enrichWithCatalogImages(products)
  return products
}

function normalizeGroupName(input) {
  const name = String(input ?? '').trim()
  if (!name) return null
  return name.slice(0, 60)
}

// Sign-up is approval-gated: this records a SignupRequest and returns no
// session. A Full Admin turns it into a real User from the internal workspace
// (api/internal.js, resource=signup-requests) — see server/api/signup-requests.js.
async function handleSignup(res, body) {
  const result = await createSignupRequestRecord({ body })
  if (result.error) return res.status(400).json({ message: result.error })

  // Notifications must never fail the submission the applicant just made.
  try {
    await notifySignupRequested(result.request)
  } catch (err) {
    console.error('[account] Sign-up notification failed:', err?.message || err)
  }

  return res.status(200).json({
    request: toSignupRequestPayload(result.request),
    message:
      'Thank you. Your sign-up request is with our team — we will email you as soon as it is approved.',
  })
}

// Where an email has a request but no account yet, say so instead of the
// generic "user not found", so applicants are not left guessing.
async function describePendingSignup(email) {
  const request = await prisma.signupRequest.findFirst({
    // New requests are normalized to lowercase, but use an insensitive match
    // so requests created before that normalization are recognized too.
    where: {
      email: { equals: email, mode: 'insensitive' },
      status: { in: ['PENDING', 'REJECTED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { reference: true, status: true },
  })
  if (!request) return null
  if (request.status === 'PENDING') {
    return `Your account is awaiting approval. We will email you as soon as it is approved. (Request ${request.reference})`
  }
  return `Your sign-up request (${request.reference}) was not approved. Please contact us if you think this was a mistake.`
}

async function handleSignin(res, body) {
  const email = String(body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(body?.password || '')
  if (!email) return res.status(400).json({ message: 'Email is required.' })
  if (!password) return res.status(400).json({ message: 'Password is required.' })
  let customer = await prisma.user.findUnique({ where: { email } })
  if (!customer) {
    const pending = await describePendingSignup(email)
    if (pending) return res.status(403).json({ message: pending })
    return res.status(404).json({ message: 'User not found. Please sign up first.' })
  }
  if (!customer.passwordHash || !verifyPassword(password, customer.passwordHash)) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }
  if (!customer.isInternal && isInternalEmail(email)) {
    customer = await prisma.user.update({ where: { id: customer.id }, data: { isInternal: true } })
  }
  return res.status(200).json({ user: toUserPayload(customer) })
}

async function handleResetRequest(req, res, body) {
  const email = String(body?.email || '')
    .trim()
    .toLowerCase()
  // Always respond with the same generic message so we never reveal whether
  // an account exists for the supplied email.
  const generic = { message: 'If an account exists for that email, a reset link is on its way.' }
  if (!email) return res.status(400).json({ message: 'Email is required.' })

  const customer = await prisma.user.findUnique({ where: { email } })
  if (!customer) return res.status(200).json(generic)

  const token = randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: customer.id },
    data: {
      resetTokenHash: hashResetToken(token),
      resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  })

  const siteUrl = resolveSiteUrl(req)
  const resetUrl = `${siteUrl}/reset-password?token=${token}`
  try {
    await sendResetEmail({ to: email, resetUrl })
  } catch (err) {
    console.error('[account] Failed to send reset email:', err)
    // Don't surface delivery failures to the caller; keep the response generic.
  }
  return res.status(200).json(generic)
}

async function handleResetConfirm(res, body) {
  const token = String(body?.token || '').trim()
  const password = String(body?.password || '')
  if (!token) return res.status(400).json({ message: 'Reset token is required.' })
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters.' })

  const customer = await prisma.user.findFirst({
    where: {
      resetTokenHash: hashResetToken(token),
      resetTokenExpiry: { gt: new Date() },
    },
  })
  if (!customer) {
    return res.status(400).json({ message: 'This reset link is invalid or has expired.' })
  }

  await prisma.user.update({
    where: { id: customer.id },
    data: {
      passwordHash: hashPassword(password),
      resetTokenHash: null,
      resetTokenExpiry: null,
    },
  })
  return res.status(200).json({ message: 'Your password has been updated. You can now sign in.' })
}

async function handleChangePassword(res, customerId, body) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const currentPassword = String(body?.currentPassword || '')
  const newPassword = String(body?.newPassword || '')
  if (!currentPassword) return res.status(400).json({ message: 'Current password is required.' })
  if (newPassword.length < 8)
    return res.status(400).json({ message: 'New password must be at least 8 characters.' })

  const customer = await prisma.user.findUnique({ where: { id: customerId } })
  if (!customer) return res.status(404).json({ message: 'User not found.' })
  if (!customer.passwordHash || !verifyPassword(currentPassword, customer.passwordHash)) {
    return res.status(401).json({ message: 'Current password is incorrect.' })
  }

  await prisma.user.update({
    where: { id: customer.id },
    data: {
      passwordHash: hashPassword(newPassword),
      resetTokenHash: null,
      resetTokenExpiry: null,
    },
  })
  return res.status(200).json({ message: 'Your password has been updated.' })
}

async function handleGetProfile(res, customerId) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const customer = await prisma.user.findUnique({ where: { id: customerId } })
  if (!customer) return res.status(404).json({ message: 'User not found.' })
  return res.status(200).json({ user: toUserPayload(customer) })
}

async function handleGetCart(res, customerId) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const cart = await getOrCreateCart(customerId)
  const items = await fetchCartItems(customerId, cart.id)
  return res.status(200).json({ cartId: cart.id, items })
}

async function handlePostCart(res, customerId, body) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const action = String(body?.action || '').toLowerCase()
  const inputCartId = String(body?.cartId || '').trim()
  const cartItemId = String(body?.cartItemId || '').trim()
  const productId = String(body?.productId || '').trim()
  const slug = String(body?.slug || '').trim()
  const qty = Number(body?.qty || 1)
  const customization = normalizeCustomization(body?.customization)

  const cart = await resolveCart(customerId, inputCartId)
  if (action === 'clear') {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
    return res.status(200).json({ cartId: cart.id, items: [] })
  }

  if ((action === 'remove' || action === 'set') && cartItemId) {
    if (action === 'remove' || qty <= 0) {
      await prisma.cartItem.deleteMany({
        where: { id: cartItemId, cartId: cart.id },
      })
    } else {
      await prisma.cartItem.updateMany({
        where: { id: cartItemId, cartId: cart.id },
        data: { qty },
      })
    }
    const items = await fetchCartItems(customerId, cart.id)
    return res.status(200).json({ cartId: cart.id, items })
  }

  const variant =
    (productId ? await resolveVariantByProductId(productId) : null) ||
    (slug ? await resolveVariantBySlug(slug) : null)
  if (!variant) {
    return res.status(400).json({ message: 'productId or valid slug is required.' })
  }

  if (action === 'remove' || qty <= 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId: variant.id } })
  } else {
    const matchingItems = await prisma.cartItem.findMany({
      where: { cartId: cart.id, variantId: variant.id },
      orderBy: { createdAt: 'asc' },
    })
    const existing = matchingItems.find(
      (item) => customizationSignature(item.customization) === customizationSignature(customization),
    )
    if (existing) {
      const nextQty = action === 'set' ? qty : existing.qty + qty
      if (nextQty <= 0) await prisma.cartItem.delete({ where: { id: existing.id } })
      else await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: nextQty } })
    } else if (qty > 0) {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: variant.id,
          qty: action === 'set' ? qty : Math.max(qty, 1),
          customization,
        },
      })
    }
  }

  const items = await fetchCartItems(customerId, cart.id)
  return res.status(200).json({ cartId: cart.id, items })
}

async function handleGetWishlist(res, customerId) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const products = await fetchWishlistProducts(customerId)
  return res.status(200).json({ products })
}

async function handlePostWishlist(res, customerId, body) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const action = String(body?.action || '').toLowerCase()
  const slug = String(body?.slug || '').trim()

  if (action === 'clear') {
    await prisma.wishlistItem.deleteMany({ where: { customerId } })
    return res.status(200).json({ products: [] })
  }

  if (action === 'rename-group') {
    const from = normalizeGroupName(body?.from)
    const to = normalizeGroupName(body?.to)
    if (!from) return res.status(400).json({ message: 'from group name is required.' })
    await prisma.wishlistItem.updateMany({
      where: { customerId, groupName: from },
      data: { groupName: to },
    })
    const products = await fetchWishlistProducts(customerId)
    return res.status(200).json({ products })
  }

  if (!slug) return res.status(400).json({ message: 'slug is required.' })

  const product = await prisma.product.findUnique({ where: { slug }, select: { id: true } })
  if (!product) return res.status(404).json({ message: 'Product not found.' })

  const exists = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId, productId: product.id } },
  })
  const groupName = normalizeGroupName(body?.group)

  if (action === 'set-group') {
    if (exists) {
      await prisma.wishlistItem.update({ where: { id: exists.id }, data: { groupName } })
    }
  } else if (action === 'remove') {
    if (exists) await prisma.wishlistItem.delete({ where: { id: exists.id } })
  } else if (action === 'toggle') {
    if (exists) await prisma.wishlistItem.delete({ where: { id: exists.id } })
    else await prisma.wishlistItem.create({ data: { customerId, productId: product.id, groupName } })
  } else if (!exists) {
    await prisma.wishlistItem.create({ data: { customerId, productId: product.id, groupName } })
  }

  const products = await fetchWishlistProducts(customerId)
  return res.status(200).json({ products })
}

// ---------------------------------------------------------------------------
// Service requests (mode=service-request / mode=service-upload)
// ---------------------------------------------------------------------------

async function handlePostServiceRequest(res, body) {
  const result = await createServiceRequestRecord({ body })
  if (result.error) return res.status(400).json({ message: result.error })
  return res.status(200).json({ request: toServiceRequestPayload(result.request) })
}

// Presigned PUT for booking attachments. Public by design (bookings don't
// require sign-in); the helper validates type/extension and generated keys
// never leak filenames. 501 tells the client to fall back to filename-only.
async function handlePostServiceUpload(res, body) {
  if (!isUploadConfigured()) {
    return res.status(501).json({ message: 'File uploads are not configured.' })
  }
  const kind = body?.kind === 'cad' ? 'cad' : 'image'
  try {
    const result = await createPresignedServiceUpload({
      kind,
      contentType: String(body?.contentType || '').trim(),
      fileName: String(body?.fileName || '').trim(),
    })
    return res.status(200).json(result)
  } catch (error) {
    if (error?.code === 'UNSUPPORTED_TYPE') {
      return res.status(400).json({ message: error.message })
    }
    console.error('[account service-upload] presign failed:', error)
    return res.status(500).json({ message: 'Unable to start the upload.' })
  }
}

// Classify a thrown error into a short, non-sensitive reason code. Prisma puts
// the useful detail in the message text rather than a property, but that text
// can embed the database host and connection parameters — so we match against
// known phrases and return only the label, never the message itself.
function describeFailure(err) {
  const text = String(err?.message || '')
  const pCode = /\bP\d{4}\b/.exec(text)?.[0] || err?.errorCode || null
  let reason = 'UNKNOWN'
  if (/Authentication failed/i.test(text)) reason = 'DB_AUTH_FAILED'
  else if (/Can't reach database server|ECONNREFUSED|ENOTFOUND/i.test(text)) reason = 'DB_UNREACHABLE'
  else if (/Environment variable not found/i.test(text)) reason = 'DB_URL_MISSING'
  else if (/timed out|ETIMEDOUT/i.test(text)) reason = 'DB_TIMEOUT'
  else if (/too many connections|connection limit/i.test(text)) reason = 'DB_CONNECTION_LIMIT'
  return { error: err?.name || 'Error', reason, code: pCode }
}

// --- Orders ----------------------------------------------------------------
// Orders live in the database from the moment checkout opens one, so the
// account page reads them from there rather than from any browser-side copy.

async function handleGetOrders(res, customerId) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const customer = await prisma.user.findUnique({ where: { id: customerId }, select: { id: true } })
  if (!customer) return res.status(404).json({ message: 'User not found.' })
  return res.status(200).json({ orders: await getMyOrders(customerId) })
}

// --- Memo (consignment) ---------------------------------------------------
// Goods leave without payment, so the permission and the limit are enforced
// here, server-side; the checkout button only mirrors what this allows.

function memoErrorResponse(res, err) {
  if (err instanceof MemoError) {
    return res.status(err.status).json({ message: err.message, code: err.code })
  }
  throw err
}

async function handleGetMemos(res, customerId) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const customer = await getMemoCustomer(customerId)
  if (!customer) return res.status(404).json({ message: 'User not found.' })

  const memos = await prisma.memo.findMany({
    where: { customerId },
    include: MEMO_PAYLOAD_INCLUDE,
    orderBy: { issuedAt: 'desc' },
  })
  const outstandingPaise = await getMemoOutstandingPaise(customerId)
  // memoLimitPaise is stored in cents; everything else in this payload is in
  // whole dollars, so the limit is converted once here and the whole response
  // speaks a single unit.
  const limitPaise = creditLimitToUsd(customer.memoLimitPaise)
  const availablePaise = limitPaise == null ? null : Math.max(limitPaise - outstandingPaise, 0)

  return res.status(200).json({
    canMemo: Boolean(customer.canMemo),
    memoDays: customer.memoDays ?? 30,
    limitPaise,
    formattedLimit: limitPaise == null ? null : formatMemoMoney(limitPaise),
    outstandingPaise,
    formattedOutstanding: formatMemoMoney(outstandingPaise),
    availablePaise,
    formattedAvailable: availablePaise == null ? null : formatMemoMoney(availablePaise),
    memos: memos.map((memo) => toMemoPayload(memo)),
  })
}

async function handlePostMemo(res, customerId, body) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })

  const cart = await resolveCart(customerId, String(body?.cartId || '').trim())
  const rows = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: {
      variant: {
        include: {
          product: {
            include: {
              variants: { where: { active: true }, orderBy: { listPricePaise: 'asc' } },
              priceBookMap: {
                where: { minQty: { lte: 1 }, priceBook: { active: true, channel: 'B2C' } },
                include: { priceBook: true },
                orderBy: [{ minQty: 'asc' }, { validFrom: 'desc' }],
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!rows.length) return res.status(400).json({ message: 'Your cart is empty.' })

  // A customized piece does not exist yet, so it cannot physically go out on
  // memo — those lines still have to go through the quote flow.
  const customized = rows.find((row) => normalizeCustomization(row.customization)?.isCustomized)
  if (customized) {
    return res.status(400).json({
      message: `"${customized.variant.product.title}" is a customized piece and cannot go out on memo.`,
      code: 'MEMO_CUSTOMIZED_ITEM',
    })
  }

  const lines = rows.map((row) => {
    const presented = toApiProduct(row.variant.product, row.variant)
    return {
      variantId: row.variantId,
      titleSnapshot: row.variant.product.title,
      pricePaise: Number(presented.priceValue) || row.variant.listPricePaise || 0,
      qty: row.qty,
    }
  })

  let memo
  try {
    memo = await createMemo({
      customerId,
      lines,
      shipTo: normalizeMemoShipTo(body?.shipTo),
      notes: String(body?.notes || '').trim(),
      actorId: customerId,
      currency: rows[0].variant.currency || 'USD',
    })
  } catch (err) {
    return memoErrorResponse(res, err)
  }

  // The pieces are out, so they leave the cart the same way a placed order
  // would clear it.
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })

  return res.status(201).json({ memo: toMemoPayload(memo), cartId: cart.id, items: [] })
}

// Extending is the customer's own action, so the rules (final window, one
// extension, still open) live in extendMemo — this only proves whose memo it is.
async function handlePostMemoExtend(res, customerId, body) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const memoId = String(body?.memoId || '').trim()
  if (!memoId) return res.status(400).json({ message: 'memoId is required.' })

  let memo
  try {
    memo = await extendMemo({ memoId, customerId, actorId: customerId, bySelf: true })
  } catch (err) {
    return memoErrorResponse(res, err)
  }
  return res.status(200).json({ memo: toMemoPayload(memo) })
}

// Buying the pieces is the customer's own action, like extending: the line
// rules (still open, qty still out) live in convertMemoToOrder — this only
// proves whose memo it is before handing over.
async function handlePostMemoConvert(res, customerId, body) {
  if (!customerId) return res.status(400).json({ message: 'userId is required.' })
  const memoId = String(body?.memoId || '').trim()
  if (!memoId) return res.status(400).json({ message: 'memoId is required.' })
  // Optional: specific lines to keep. Omitting them buys everything still out.
  const lines = Array.isArray(body?.lines) ? body.lines : null

  let result
  try {
    result = await convertMemoToOrder({ memoId, lines, actorId: customerId, customerId })
  } catch (err) {
    return memoErrorResponse(res, err)
  }
  return res.status(200).json({
    memo: toMemoPayload(result.memo),
    order: result.order,
    invoice: result.invoice,
  })
}

function normalizeMemoShipTo(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const allowed = ['name', 'email', 'phone', 'address', 'city', 'state', 'country', 'pincode']
  const out = {}
  for (const key of allowed) {
    const value = typeof input[key] === 'string' ? input[key].trim() : ''
    if (value) out[key] = value
  }
  return Object.keys(out).length ? out : null
}

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  const body = parseBody(req)
  const mode = getMode(req, body)
  const userId = parseUserId(req, body)

  try {
    if (req.method === 'GET') {
      if (mode === 'profile') return await handleGetProfile(res, userId)
      if (mode === 'cart') return await handleGetCart(res, userId)
      if (mode === 'wishlist') return await handleGetWishlist(res, userId)
      if (mode === 'orders') return await handleGetOrders(res, userId)
      if (mode === 'memos') return await handleGetMemos(res, userId)
      return res.status(400).json({ message: 'Invalid mode for GET.' })
    }

    if (req.method === 'POST') {
      if (mode === 'signup') return await handleSignup(res, body)
      if (mode === 'signin') return await handleSignin(res, body)
      if (mode === 'reset-request') return await handleResetRequest(req, res, body)
      if (mode === 'reset-confirm') return await handleResetConfirm(res, body)
      if (mode === 'change-password') return await handleChangePassword(res, userId, body)
      if (mode === 'cart') return await handlePostCart(res, userId, body)
      if (mode === 'wishlist') return await handlePostWishlist(res, userId, body)
      if (mode === 'memo') return await handlePostMemo(res, userId, body)
      if (mode === 'memo-extend') return await handlePostMemoExtend(res, userId, body)
      if (mode === 'memo-convert') return await handlePostMemoConvert(res, userId, body)
      if (mode === 'service-request') return await handlePostServiceRequest(res, body)
      if (mode === 'service-upload') return await handlePostServiceUpload(res, body)
      return res.status(400).json({ message: 'Invalid mode for POST.' })
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  } catch (err) {
    console.error('Account API failed:', err)
    // Surface a non-sensitive reason alongside the generic message so
    // production failures are diagnosable from the response alone.
    return res.status(500).json({ message: 'Account operation failed.', ...describeFailure(err) })
  }
}
