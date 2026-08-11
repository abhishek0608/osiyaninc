import { prisma } from '../server/api/db.js'
import { toApiProduct } from '../server/api/product-presenter.js'
import { getCatalogProducts } from '../server/api/products-source.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'
import { createPresignedServiceUpload, isUploadConfigured } from '../server/api/s3-upload.js'
import {
  createServiceRequestRecord,
  toServiceRequestPayload,
} from '../server/api/service-requests.js'
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

async function handleSignup(res, body) {
  const name = String(body?.name || '').trim()
  const email = String(body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(body?.password || '')
  if (!email) return res.status(400).json({ message: 'Email is required.' })
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters.' })

  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean)
  const lastName = rest.join(' ')
  const customer = await prisma.user.upsert({
    where: { email },
    update: {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      passwordHash: hashPassword(password),
      ...(isInternalEmail(email) ? { isInternal: true } : {}),
    },
    create: {
      email,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      passwordHash: hashPassword(password),
      isInternal: isInternalEmail(email),
    },
  })
  return res.status(200).json({ user: toUserPayload(customer) })
}

async function handleSignin(res, body) {
  const email = String(body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(body?.password || '')
  if (!email) return res.status(400).json({ message: 'Email is required.' })
  if (!password) return res.status(400).json({ message: 'Password is required.' })
  let customer = await prisma.user.findUnique({ where: { email } })
  if (!customer) return res.status(404).json({ message: 'User not found. Please sign up first.' })
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
      if (mode === 'service-request') return await handlePostServiceRequest(res, body)
      if (mode === 'service-upload') return await handlePostServiceUpload(res, body)
      return res.status(400).json({ message: 'Invalid mode for POST.' })
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  } catch (err) {
    console.error('Account API failed:', err)
    return res.status(500).json({ message: 'Account operation failed.' })
  }
}
