import { randomBytes, scryptSync } from 'node:crypto'
import { prisma } from '../server/api/db.js'
import { applyCors, handlePreflight } from '../server/api/cors.js'
import { resolveActorMap, actorName } from '../server/api/audit.js'
import { invalidateCatalogProductsCache } from '../server/api/products-source.js'
import { generateProductAiDescription } from '../server/api/product-ai.js'
import { updateProductEmbeddingSafe } from '../server/api/product-embedding.js'
import {
  isImageEmbeddingConfigured,
  updateProductImageEmbeddings,
  updateProductImageEmbeddingsSafe,
} from '../server/api/image-embedding.js'
import { pickVariantForPricing } from '../server/api/product-presenter.js'
import { isS3Configured, listProductImagesBySlug } from '../server/api/s3-images.js'
import { getAllHomepageSlides } from '../server/api/homepage-slides-source.js'
import { getSiteConfig, saveSiteConfig } from '../server/api/site-config-source.js'
import {
  getAllStoneSizes,
  invalidateStoneSizesCache,
  syncStoneSizesInUse,
} from '../server/api/stone-size-source.js'
import {
  createPresignedCertificateUpload,
  createPresignedHomepageUpload,
  deleteCertificateFile,
  isUploadConfigured,
} from '../server/api/s3-upload.js'
import {
  createPresignedProductImageUploads,
  deleteProductImage,
  isProductImageWriteConfigured,
} from '../server/api/s3-product-images.js'
import {
  SERVICE_REQUEST_STATUSES,
  createServiceRequestRecord,
  toServiceRequestPayload,
} from '../server/api/service-requests.js'

// This file is a single Vercel serverless function that fans out to the
// internal-admin resources by `?resource=` (product, homepage-slides,
// site-config, stone-sizes, upload-image, product-image) or, when omitted, the dashboard. The endpoints
// were merged into one function to stay under the Hobby plan's 12-function
// deployment cap.

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {}
  try {
    return JSON.parse(req.body || '{}')
  } catch {
    return {}
  }
}

// Internal-or-admin access (dashboard + site-config).
async function assertInternalUser(userId) {
  if (!userId) return null
  const customer = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isInternal: true, isAdmin: true },
  })
  return customer?.isInternal || customer?.isAdmin ? customer : null
}

// Internal-only access (product + homepage-slides) — does not accept admins
// who are not also flagged internal, preserving the original endpoints.
async function assertInternalStrict(userId) {
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isInternal: true },
  })
  return user?.isInternal ? user : null
}

async function assertAdminUser(userId) {
  if (!userId) return null
  const customer = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true },
  })
  return customer?.isAdmin ? customer : null
}

// ---------------------------------------------------------------------------
// Dashboard (no resource param)
// ---------------------------------------------------------------------------

function formatMoney(paise, currency = 'USD') {
  const value = Number(paise || 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

async function buildDashboardPayload() {
  const [orders, users, products, orderCount, userCount, productCount] = await Promise.all([
    prisma.order.findMany({
      take: 25,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: { include: { variant: { include: { product: { select: { title: true } } } } } },
      },
    }),
    prisma.user.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isInternal: true,
        isAdmin: true,
        channel: true,
        createdById: true,
        updatedById: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.product.findMany({
      take: 50,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        category: true,
        material: true,
        active: true,
        createdById: true,
        updatedById: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.order.count(),
    prisma.user.count(),
    prisma.product.count(),
  ])

  // Resolve every distinct created-by / modified-by id across all records to a
  // display name in one query, then attach the four audit fields per record.
  const actorMap = await resolveActorMap([
    ...orders.flatMap((o) => [o.createdById, o.updatedById]),
    ...users.flatMap((u) => [u.createdById, u.updatedById]),
    ...products.flatMap((p) => [p.createdById, p.updatedById]),
  ])

  return {
    summary: {
      orders: orderCount,
      users: userCount,
      products: productCount,
      services: 0,
    },
    orders: orders.map((order) => {
      const customerName =
        [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ').trim() ||
        order.customer?.email ||
        'Guest'
      return {
        id: order.id,
        orderNo: order.orderNo,
        customerId: order.customer?.id || null,
        customer: customerName,
        customerEmail: order.customer?.email || '',
        status: order.status,
        total: formatMoney(order.totalPaise, order.currency),
        itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
        // An order with no recorded actor was placed by the customer themselves.
        createdBy: actorName(actorMap, order.createdById) || customerName,
        createdAt: order.createdAt,
        modifiedBy: actorName(actorMap, order.updatedById),
        modifiedAt: order.updatedAt,
      }
    }),
    users: users.map((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'User',
      email: user.email || '',
      isInternal: user.isInternal,
      isAdmin: user.isAdmin,
      channel: user.channel,
      orderCount: user._count.orders,
      // A user with no recorded creator self-registered through the storefront.
      createdBy: actorName(actorMap, user.createdById) || 'Self (signup)',
      createdAt: user.createdAt,
      modifiedBy: actorName(actorMap, user.updatedById),
      modifiedAt: user.updatedAt,
    })),
    products: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      category: product.category,
      material: product.material,
      active: product.active,
      createdBy: actorName(actorMap, product.createdById),
      createdAt: product.createdAt,
      modifiedBy: actorName(actorMap, product.updatedById),
      modifiedAt: product.updatedAt,
      updatedAt: product.updatedAt,
    })),
  }
}

async function handleUpdateUserRole(res, requesterId, body) {
  const admin = await assertAdminUser(requesterId)
  if (!admin) return res.status(403).json({ message: 'Full admin access required.' })

  const targetUserId = String(body?.targetUserId || '').trim()
  if (!targetUserId) return res.status(400).json({ message: 'targetUserId is required.' })

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isInternal: true, isAdmin: true },
  })
  if (!target) return res.status(404).json({ message: 'User not found.' })

  // Resolve the requested next state, defaulting to the current value when omitted.
  const nextAdmin = typeof body?.isAdmin === 'boolean' ? body.isAdmin : target.isAdmin
  // An admin is always internal; granting admin implies internal access.
  const nextInternal =
    typeof body?.isInternal === 'boolean' ? body.isInternal || nextAdmin : target.isInternal || nextAdmin

  // Prevent an admin from removing their own admin rights (avoids lockout footguns).
  if (target.id === admin.id && target.isAdmin && !nextAdmin) {
    return res.status(400).json({ message: 'You cannot remove your own admin access.' })
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { isInternal: nextInternal, isAdmin: nextAdmin, updatedById: admin.id },
    select: { id: true, isInternal: true, isAdmin: true },
  })
  return res.status(200).json({ user: updated })
}

async function handleDashboardResource(req, res, body) {
  const userId = String(req?.query?.userId || body?.userId || '').trim()

  try {
    if (req.method === 'POST') {
      const action = String(req?.query?.action || body?.action || '').trim()
      if (action === 'update-user-role') return await handleUpdateUserRole(res, userId, body)
      return res.status(400).json({ message: 'Unknown action.' })
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET,POST,OPTIONS')
      return res.status(405).json({ message: 'Method not allowed' })
    }

    const internalUser = await assertInternalUser(userId)
    if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

    return res.status(200).json(await buildDashboardPayload())
  } catch (err) {
    console.error('Internal API failed:', err)
    return res.status(500).json({ message: 'Unable to load internal dashboard.' })
  }
}

// ---------------------------------------------------------------------------
// Products list (resource=products-list) — paginated + searchable
// ---------------------------------------------------------------------------

const PRODUCT_PAGE_SIZE = 50

async function handleProductsListResource(req, res, body) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()

  try {
    const internalUser = await assertInternalUser(userId)
    if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

    const search = String(req?.query?.search || '').trim()
    const skip = Math.max(Number(req?.query?.skip) || 0, 0)
    // Status filter: 'active' → active only, 'hidden' → hidden only, anything else → all.
    const status = String(req?.query?.status || '').trim().toLowerCase()
    // Photo-vector filter: 'synced' → has ≥1 image embedding, 'missing' → none.
    const vectors = String(req?.query?.vectors || '').trim().toLowerCase()

    // Case-insensitive match across the fields shown in the products table.
    const where = {}
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { material: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (status === 'active') where.active = true
    else if (status === 'hidden') where.active = false

    // Per-product embedded-photo counts, also used for the synced/missing
    // filter. Raw SQL because Prisma cannot touch Unsupported("vector") columns.
    const vectorRows = await prisma.$queryRawUnsafe(
      'SELECT "productId", COUNT(*)::int AS count FROM "ProductImageEmbedding" WHERE embedding IS NOT NULL GROUP BY "productId"'
    )
    const vectorCounts = new Map(vectorRows.map((r) => [r.productId, Number(r.count)]))
    if (vectors === 'synced') where.id = { in: [...vectorCounts.keys()] }
    else if (vectors === 'missing') where.id = { notIn: [...vectorCounts.keys()] }

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: PRODUCT_PAGE_SIZE,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          category: true,
          material: true,
          active: true,
          createdById: true,
          updatedById: true,
          createdAt: true,
          updatedAt: true,
          variants: {
            where: { active: true },
            select: { id: true, listPricePaise: true, currency: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ])

    const actorMap = await resolveActorMap(rows.flatMap((p) => [p.createdById, p.updatedById]))
    const products = rows.map((product) => {
      const variant = pickVariantForPricing(product.variants)
      return {
        id: product.id,
        slug: product.slug,
        title: product.title,
        description: product.description,
        category: product.category,
        material: product.material,
        active: product.active,
        imageVectors: vectorCounts.get(product.id) || 0,
        pricePaise: variant?.listPricePaise ?? null,
        price: variant ? formatMoney(variant.listPricePaise, variant.currency || 'USD') : null,
        createdBy: actorName(actorMap, product.createdById),
        createdAt: product.createdAt,
        modifiedBy: actorName(actorMap, product.updatedById),
        modifiedAt: product.updatedAt,
        updatedAt: product.updatedAt,
      }
    })

    return res.status(200).json({ products, total, hasMore: skip + rows.length < total })
  } catch (err) {
    console.error('Internal products list failed:', err)
    return res.status(500).json({ message: 'Unable to load products.' })
  }
}

// ---------------------------------------------------------------------------
// Orders list (resource=orders-list) — paginated + searchable
// ---------------------------------------------------------------------------

const ORDER_PAGE_SIZE = 50
const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'FULFILLED', 'CANCELLED', 'REFUNDED']

async function handleOrdersListResource(req, res, body) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()

  try {
    const internalUser = await assertInternalUser(userId)
    if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

    const search = String(req?.query?.search || '').trim()
    const skip = Math.max(Number(req?.query?.skip) || 0, 0)

    // Case-insensitive match across the fields shown in the orders table.
    // Status is an enum, so it only matches when the term is a status name.
    const where = {}
    if (search) {
      where.OR = [
        { orderNo: { contains: search, mode: 'insensitive' } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
        { customer: { firstName: { contains: search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: search, mode: 'insensitive' } } },
      ]
      if (ORDER_STATUSES.includes(search.toUpperCase())) {
        where.OR.push({ status: search.toUpperCase() })
      }
    }

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: ORDER_PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, email: true, firstName: true, lastName: true } },
          items: { select: { qty: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    const actorMap = await resolveActorMap(rows.flatMap((o) => [o.createdById, o.updatedById]))
    const orders = rows.map((order) => {
      const customerName =
        [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ').trim() ||
        order.customer?.email ||
        'Guest'
      return {
        id: order.id,
        orderNo: order.orderNo,
        customerId: order.customer?.id || null,
        customer: customerName,
        customerEmail: order.customer?.email || '',
        status: order.status,
        total: formatMoney(order.totalPaise, order.currency),
        itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
        // An order with no recorded actor was placed by the customer themselves.
        createdBy: actorName(actorMap, order.createdById) || customerName,
        createdAt: order.createdAt,
        modifiedBy: actorName(actorMap, order.updatedById),
        modifiedAt: order.updatedAt,
      }
    })

    return res.status(200).json({ orders, total, hasMore: skip + rows.length < total })
  } catch (err) {
    console.error('Internal orders list failed:', err)
    return res.status(500).json({ message: 'Unable to load orders.' })
  }
}

// ---------------------------------------------------------------------------
// Users list (resource=users-list) — paginated + searchable
// ---------------------------------------------------------------------------

const USER_PAGE_SIZE = 50

async function handleUsersListResource(req, res, body) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()

  try {
    const internalUser = await assertInternalUser(userId)
    if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

    const search = String(req?.query?.search || '').trim()
    const skip = Math.max(Number(req?.query?.skip) || 0, 0)

    // Case-insensitive match across the fields shown in the users table.
    const where = {}
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: USER_PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isInternal: true,
          isAdmin: true,
          channel: true,
          createdById: true,
          updatedById: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    const actorMap = await resolveActorMap(rows.flatMap((u) => [u.createdById, u.updatedById]))
    const users = rows.map((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'User',
      email: user.email || '',
      isInternal: user.isInternal,
      isAdmin: user.isAdmin,
      channel: user.channel,
      orderCount: user._count.orders,
      // A user with no recorded creator self-registered through the storefront.
      createdBy: actorName(actorMap, user.createdById) || 'Self (signup)',
      createdAt: user.createdAt,
      modifiedBy: actorName(actorMap, user.updatedById),
      modifiedAt: user.updatedAt,
    }))

    return res.status(200).json({ users, total, hasMore: skip + rows.length < total })
  } catch (err) {
    console.error('Internal users list failed:', err)
    return res.status(500).json({ message: 'Unable to load users.' })
  }
}

// ---------------------------------------------------------------------------
// User create (resource=user-create) — Full Admins add customers/teammates
// ---------------------------------------------------------------------------

// Same salt:hash scrypt scheme as the storefront signup in api/account.js, so
// admin-created users can sign in (or run password reset) like anyone else.
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function handleUserCreateResource(req, res, body) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()

  try {
    const admin = await assertAdminUser(userId)
    if (!admin) return res.status(403).json({ message: 'Full Admin access required.' })

    const firstName = String(body?.firstName || '').trim()
    const lastName = String(body?.lastName || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const phone = String(body?.phone || '').trim()
    const channel = body?.channel === 'B2B' ? 'B2B' : 'B2C'
    const role = String(body?.role || 'customer').toLowerCase()
    const password = String(body?.password || '')

    if (!firstName) return res.status(400).json({ message: 'First name is required.' })
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'A valid email is required.' })
    }
    if (password && password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' })
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) return res.status(409).json({ message: 'A user with this email already exists.' })

    const created = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName: lastName || undefined,
        phone: phone || undefined,
        channel,
        isInternal: role === 'internal' || role === 'admin',
        isAdmin: role === 'admin',
        passwordHash: password ? hashPassword(password) : undefined,
        createdById: admin.id,
        updatedById: admin.id,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    })

    return res.status(200).json({ user: created })
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ message: 'A user with this email or phone already exists.' })
    }
    console.error('Internal user create failed:', err)
    return res.status(500).json({ message: 'Unable to create user.' })
  }
}

// ---------------------------------------------------------------------------
// Order create (resource=order-create) — manual/offline orders keyed in by the
// team (phone orders, exhibition sales). Prices come from each product's
// active variant; payment stays outside Razorpay, so status starts PENDING
// unless the admin picks otherwise.
// ---------------------------------------------------------------------------

async function handleOrderCreateResource(req, res, body) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()

  try {
    const internalUser = await assertInternalUser(userId)
    if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

    const customerId = String(body?.customerId || '').trim()
    const notes = String(body?.notes || '').trim()
    const requestedStatus = String(body?.status || '').toUpperCase()
    const status = ORDER_STATUSES.includes(requestedStatus) ? requestedStatus : 'PENDING'
    const requested = (Array.isArray(body?.items) ? body.items : [])
      .map((item) => ({
        slug: String(item?.slug || '').trim(),
        qty: Math.min(Math.floor(Number(item?.qty) || 0), 999),
      }))
      .filter((item) => item.slug && item.qty > 0)
    if (!requested.length) {
      return res.status(400).json({ message: 'Add at least one product to the order.' })
    }

    let customer = null
    if (customerId) {
      customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: { id: true, channel: true },
      })
      if (!customer) return res.status(400).json({ message: 'Selected customer no longer exists.' })
    }

    const products = await prisma.product.findMany({
      where: { slug: { in: requested.map((item) => item.slug) } },
      include: { variants: { where: { active: true } } },
    })
    const bySlug = new Map(products.map((p) => [p.slug, p]))

    const lines = []
    for (const item of requested) {
      const product = bySlug.get(item.slug)
      const variant = pickVariantForPricing(product?.variants || [])
      if (!product || !variant) {
        return res.status(400).json({ message: `No purchasable variant found for "${item.slug}".` })
      }
      lines.push({
        variantId: variant.id,
        titleSnapshot: product.title,
        pricePaise: variant.listPricePaise || 0,
        qty: item.qty,
        currency: variant.currency || 'USD',
      })
    }

    const subtotalPaise = lines.reduce((sum, line) => sum + line.pricePaise * line.qty, 0)
    const currency = lines[0].currency

    // Sequential ORD-000123 numbers; orderNo is unique, so retry with the next
    // number if a concurrent create grabbed the same one.
    let order = null
    let seq = (await prisma.order.count()) + 1
    for (let attempt = 0; attempt < 5 && !order; attempt += 1, seq += 1) {
      try {
        order = await prisma.order.create({
          data: {
            orderNo: `ORD-${String(seq).padStart(6, '0')}`,
            channel: customer?.channel || 'B2C',
            status,
            customerId: customer?.id || undefined,
            subtotalPaise,
            totalPaise: subtotalPaise,
            currency,
            notes: notes || undefined,
            createdById: internalUser.id,
            updatedById: internalUser.id,
            items: {
              create: lines.map(({ variantId, titleSnapshot, pricePaise, qty }) => ({
                variantId,
                titleSnapshot,
                pricePaise,
                qty,
              })),
            },
          },
          select: { id: true, orderNo: true },
        })
      } catch (err) {
        if (err?.code !== 'P2002') throw err
      }
    }
    if (!order) {
      return res.status(500).json({ message: 'Could not allocate an order number. Please try again.' })
    }

    return res.status(200).json({ order })
  } catch (err) {
    console.error('Internal order create failed:', err)
    return res.status(500).json({ message: 'Unable to create order.' })
  }
}

// ---------------------------------------------------------------------------
// Product (resource=product)
// ---------------------------------------------------------------------------

async function upsertB2CPriceBookItem(tx, productId, pricePaise) {
  const b2cBook = await tx.priceBook.findFirst({ where: { channel: 'B2C', active: true } })
  if (!b2cBook) return
  await tx.priceBookItem.upsert({
    where: { priceBookId_productId_minQty: { priceBookId: b2cBook.id, productId, minQty: 1 } },
    update: { pricePaise: Math.round(pricePaise) },
    create: { priceBookId: b2cBook.id, productId, pricePaise: Math.round(pricePaise), minQty: 1 },
  })
}

function createSkuFromSlug(slug) {
  const base = String(slug || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return `${base || 'PRODUCT'}-${Date.now().toString().slice(-6)}`
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function normalizeImages(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((image, index) => ({
      url: String(image?.url || '').trim(),
      alt: String(image?.alt || '').trim() || null,
      sortOrder:
        Number.isFinite(Number(image?.sortOrder)) && Number(image?.sortOrder) >= 0
          ? Number(image.sortOrder)
          : index,
      active: image?.active !== false,
    }))
    .filter((image) => image.url)
}

function validateImages(images) {
  const oversized = images.find((image) => image.url.length > 750000)
  if (oversized) {
    return 'One uploaded image is too large to save. Please use a smaller image or an image URL.'
  }
  return ''
}

function normalizeOptionArray(input) {
  if (!Array.isArray(input)) return []
  return input.map((value) => String(value || '').trim()).filter(Boolean)
}

function normalizeCustomizationOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null

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

  return hasValues ? normalized : null
}

function normalizeProductAttributes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null

  const normalized = {
    grossWeight: String(input.grossWeight || '').trim(),
    diamondCarats: String(input.diamondCarats || '').trim(),
    diamondQuantity: String(input.diamondQuantity || '').trim(),
  }

  const hasValues = normalized.grossWeight || normalized.diamondCarats || normalized.diamondQuantity
  return hasValues ? normalized : null
}

// Certification metadata sent by the edit form. certLab is the on/off switch:
// clearing it un-certifies the piece, so the number and date are dropped with
// it and the storefront tag disappears. The uploaded file is managed separately
// (resource=product-certificate) and is deliberately untouched here.
function normalizeCertificationInput(body) {
  const lab = String(body?.certLab || '').trim()
  if (!lab) return { certLab: null, certNumber: null, certifiedAt: null }

  const rawDate = String(body?.certifiedAt || '').trim()
  const parsed = rawDate ? new Date(rawDate) : null
  return {
    certLab: lab,
    certNumber: String(body?.certNumber || '').trim() || null,
    certifiedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Shared by the bulk import. Builds the Prisma `data` for create/update.
// Images are intentionally excluded — the portal pulls them from S3 by slug.
function buildBulkProductData(row) {
  const data = {
    slug: String(row?.slug || '').trim(),
    title: String(row?.title || '').trim(),
    category: String(row?.category || '').trim(),
    subtype: String(row?.subtype || '').trim() || null,
    material: String(row?.material || '').trim(),
    color: String(row?.color || '').trim(),
    description: String(row?.description || '').trim() || null,
    productAttributes: normalizeProductAttributes(row?.productAttributes),
    customizationOptions: normalizeCustomizationOptions(row?.customizationOptions),
    isNewArrival: Boolean(row?.isNewArrival),
    isBestSeller: Boolean(row?.isBestSeller),
    active: row?.active !== false,
    rating: toNumberOrNull(row?.rating),
    reviewCount: toNumberOrNull(row?.reviewCount),
  }
  if (Array.isArray(row?.styleTags)) data.styleTags = normalizeTags(row.styleTags)
  if (Array.isArray(row?.stoneTags)) data.stoneTags = normalizeTags(row.stoneTags)
  return data
}

function validateBulkRow(row) {
  const errors = []
  if (!String(row?.slug || '').trim()) errors.push('slug')
  if (!String(row?.title || '').trim()) errors.push('title')
  if (!String(row?.category || '').trim()) errors.push('category')
  if (!String(row?.material || '').trim()) errors.push('material')
  if (!String(row?.color || '').trim()) errors.push('color')
  return errors
}

async function importOneBulkRow(row, mode) {
  const slug = String(row?.slug || '').trim()
  const missing = validateBulkRow(row)
  if (missing.length) {
    return { slug, status: 'error', message: `Missing required field(s): ${missing.join(', ')}` }
  }

  const data = buildBulkProductData(row)
  const price = toNumberOrNull(row?.variantPricePaise ?? row?.price)
  const listPricePaise = price != null && price > 0 ? Math.round(price) : 0

  const existing = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, variants: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
  })

  if (existing && mode !== 'overwrite') {
    return { slug, status: 'skipped', message: 'Already exists (skipped)' }
  }

  try {
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id: existing.id }, data })
        if (listPricePaise > 0) {
          const primary = existing.variants[0]
          if (primary) {
            await tx.productVariant.update({
              where: { id: primary.id },
              data: { listPricePaise, title: data.title },
            })
          } else {
            await tx.productVariant.create({
              data: { productId: existing.id, sku: createSkuFromSlug(slug), title: data.title, listPricePaise, currency: 'USD', active: true },
            })
          }
          await upsertB2CPriceBookItem(tx, existing.id, listPricePaise)
        }
      })
      await syncStoneSizesInUse(data.customizationOptions?.centerStoneSizes)
      return { slug, status: 'updated', message: 'Updated' }
    }

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data })
      await tx.productVariant.create({
        data: { productId: product.id, sku: createSkuFromSlug(slug), title: data.title, listPricePaise, currency: 'USD', active: true },
      })
      if (listPricePaise > 0) await upsertB2CPriceBookItem(tx, product.id, listPricePaise)
    })
    await syncStoneSizesInUse(data.customizationOptions?.centerStoneSizes)
    return { slug, status: 'created', message: 'Created' }
  } catch (error) {
    const message =
      error?.code === 'P2002' ? 'Slug already in use' : String(error?.message || 'Unable to save').slice(0, 200)
    return { slug, status: 'error', message }
  }
}

// Export every product as rows matching the bulk-import column schema, so an
// exported file can be edited and re-uploaded without creating duplicates
// (the import upserts by slug). Returns JSON rows; the client builds the CSV
// from its own COLUMNS list, keeping a single source of truth for ordering.
async function handleProductExport(res) {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      variants: { orderBy: { createdAt: 'asc' }, take: 1, select: { listPricePaise: true } },
    },
  })

  const rows = products.map((p) => {
    const attrs = p.productAttributes && typeof p.productAttributes === 'object' ? p.productAttributes : {}
    const opts = p.customizationOptions && typeof p.customizationOptions === 'object' ? p.customizationOptions : {}
    const list = (value) => (Array.isArray(value) ? value.join('|') : '')
    const price = p.variants[0]?.listPricePaise
    return {
      slug: p.slug,
      title: p.title,
      category: p.category,
      subtype: p.subtype || '',
      material: p.material,
      color: p.color,
      price: price != null ? String(price) : '',
      description: p.description || '',
      grossWeight: attrs.grossWeight || '',
      diamondCarats: attrs.diamondCarats || '',
      diamondQuantity: attrs.diamondQuantity || '',
      styleTags: list(p.styleTags),
      stoneTags: list(p.stoneTags),
      isNewArrival: p.isNewArrival ? 'true' : 'false',
      isBestSeller: p.isBestSeller ? 'true' : 'false',
      active: p.active ? 'true' : 'false',
      rating: p.rating != null ? String(p.rating) : '',
      reviewCount: p.reviewCount != null ? String(p.reviewCount) : '',
      diamondQualities: list(opts.diamondQualities),
      metalPurities: list(opts.metalPurities),
      centerShapes: list(opts.centerShapes),
      centerStoneSizes: list(opts.centerStoneSizes),
      stoneTypes: list(opts.stoneTypes),
      ringSizes: list(opts.ringSizes),
      bangleSizes: list(opts.bangleSizes),
      necklaceSizes: list(opts.necklaceSizes),
      allowCustomCenterStoneSize: opts.allowCustomCenterStoneSize === false ? 'false' : 'true',
      allowCustomStoneType: opts.allowCustomStoneType === false ? 'false' : 'true',
    }
  })

  return res.status(200).json({ rows, count: rows.length })
}

// Bulk import. Images are not part of the payload; the portal resolves them
// from S3 by slug. AI descriptions/embeddings are left to backfill scripts.
async function handleBulk(res, body) {
  const products = Array.isArray(body?.products) ? body.products : null
  if (!products || !products.length) return res.status(400).json({ message: 'No products provided.' })
  if (products.length > 200) {
    return res.status(400).json({ message: 'Too many rows in one request. Send 200 or fewer per batch.' })
  }
  const mode = body?.mode === 'overwrite' ? 'overwrite' : 'skip'

  const results = []
  for (const row of products) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await importOneBulkRow(row, mode))
  }
  const summary = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    },
    { created: 0, updated: 0, skipped: 0, error: 0 },
  )
  if (summary.created || summary.updated) invalidateCatalogProductsCache()
  return res.status(200).json({ summary, results })
}

// Resolve the image URLs to feed the AI for a product. Prefers active DB images;
// falls back to the product's S3 folder (folder name === slug) so bulk-imported
// products — which keep no DB images — still get described and vectorized.
async function resolveAiImagesForProduct(product) {
  let urls = (product.images || []).map((image) => image.url).filter(Boolean)
  if (!urls.length && isS3Configured()) {
    try {
      const s3 = await listProductImagesBySlug(product.slug)
      urls = s3.map((img) => img.url).filter(Boolean)
    } catch (error) {
      console.error('[internal-product] bulk-ai s3 list failed for', product.slug, '-', error?.message || error)
    }
  }
  return urls
}

// Bulk "run all products through AI": regenerate the AI description and the
// image-search vector for a batch of products. Processed in small batches and
// driven by the client (cursor pagination by id) to stay under request timeouts.
// scope 'missing' only touches products with no AI description yet; 'all' redoes
// every active product (overwriting existing AI descriptions).
async function handleBulkAi(res, body) {
  const scope = body?.scope === 'all' ? 'all' : 'missing'
  const limit = Math.min(Math.max(Number(body?.limit) || 3, 1), 8)
  const cursor = body?.cursor ? String(body.cursor) : null

  const baseWhere = { active: true }
  if (scope === 'missing') baseWhere.OR = [{ aiDescription: null }, { aiDescription: '' }]

  const total = await prisma.product.count({ where: baseWhere })

  const batch = await prisma.product.findMany({
    where: cursor ? { ...baseWhere, id: { gt: cursor } } : baseWhere,
    orderBy: { id: 'asc' },
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      images: { where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { url: true } },
    },
  })

  const results = []
  let nextCursor = cursor
  let touched = false
  for (const product of batch) {
    nextCursor = product.id
    // eslint-disable-next-line no-await-in-loop
    const imageUrls = await resolveAiImagesForProduct(product)
    if (!imageUrls.length) {
      results.push({ slug: product.slug, status: 'skipped', message: 'No images (DB or S3)' })
      continue
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const aiDescription = await generateProductAiDescription({
        images: imageUrls,
        category: product.category,
        title: product.title,
      })
      // eslint-disable-next-line no-await-in-loop
      await prisma.product.update({ where: { id: product.id }, data: { aiDescription: aiDescription || null } })
      // Refresh the vector, feeding the first image so S3-only products get a
      // vision-based embedding too (the DB-only path would have no image).
      // eslint-disable-next-line no-await-in-loop
      await updateProductEmbeddingSafe(product.id, { imageUrl: imageUrls[0] })
      // eslint-disable-next-line no-await-in-loop
      await updateProductImageEmbeddingsSafe(product.id)
      touched = true
      results.push({
        slug: product.slug,
        status: aiDescription ? 'generated' : 'empty',
        message: aiDescription ? 'Generated description + vector' : 'No description returned by AI',
      })
    } catch (error) {
      console.error('[internal-product] bulk-ai failed for', product.slug, '-', error?.message || error)
      results.push({ slug: product.slug, status: 'error', message: String(error?.message || 'Failed').slice(0, 160) })
    }
  }

  if (touched) invalidateCatalogProductsCache()
  // Last page when the batch came back smaller than the requested limit.
  return res.status(200).json({ results, total, nextCursor, done: batch.length < limit })
}

// Resync only the image-search vectors (ProductImageEmbedding rows), leaving
// AI descriptions and the text vector alone. Covers the S3-first workflow —
// create the product, drop photos into its S3 folder later, then run this to
// pick them up. Cheap to re-run: unchanged photos are matched by their
// imageKey hash and skipped, so only new/changed photos hit the embedding
// API. Pass a slug to sync one product; omit it to sweep active products in
// client-driven cursor batches (same pattern as bulk-ai). scope 'missing'
// restricts the sweep to products with no image vectors at all — note that a
// product with even one vector is then skipped, so use the default 'all'
// sweep to catch new photos added to already-covered products.
async function handleResyncImageEmbeddings(res, body, slug) {
  if (!isImageEmbeddingConfigured()) {
    return res.status(501).json({ message: 'Image embeddings are not configured.' })
  }

  if (slug) {
    const product = await prisma.product.findUnique({ where: { slug }, select: { id: true } })
    if (!product) return res.status(404).json({ message: 'Product not found.' })
    const result = await resyncOneImageEmbedding({ id: product.id, slug })
    return res.status(200).json({ results: [result], total: 1, nextCursor: null, done: true })
  }

  const scope = body?.scope === 'missing' ? 'missing' : 'all'
  // One product per request, regardless of the caller's limit: a single
  // product can need up to 12 photo embeddings, and batching several such
  // products in one invocation 504s the serverless function.
  const limit = 1
  const cursor = body?.cursor ? String(body.cursor) : null

  const where = { active: true }
  if (scope === 'missing') {
    // Raw SQL: Prisma's client API cannot filter on Unsupported("vector") columns.
    const covered = await prisma.$queryRawUnsafe(
      'SELECT DISTINCT "productId" FROM "ProductImageEmbedding" WHERE embedding IS NOT NULL'
    )
    where.id = { notIn: covered.map((r) => r.productId) }
  }

  // Keyset pagination on (createdAt, id) rather than Prisma's `cursor`: under
  // 'missing' scope the cursor product gains vectors as soon as it's synced,
  // drops out of `where` on the next request, and cursor+skip would then skip
  // an unprocessed product.
  let cursorFilter = null
  if (cursor) {
    const cursorRow = await prisma.product.findUnique({
      where: { id: cursor },
      select: { createdAt: true },
    })
    cursorFilter = cursorRow
      ? {
          OR: [
            { createdAt: { gt: cursorRow.createdAt } },
            { createdAt: cursorRow.createdAt, id: { gt: cursor } },
          ],
        }
      : // Cursor product was deleted mid-sweep; fall back to id order for this
        // page. Resync is idempotent, so any resulting overlap is harmless.
        { id: { gt: cursor } }
  }

  const total = await prisma.product.count({ where })
  const batch = await prisma.product.findMany({
    where: cursorFilter ? { AND: [where, cursorFilter] } : where,
    // Sweep oldest catalog entries first. The id tiebreak keeps the order
    // stable across requests when bulk-imported products share a createdAt.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, slug: true },
  })

  const results = []
  let nextCursor = cursor
  for (const product of batch) {
    nextCursor = product.id
    // eslint-disable-next-line no-await-in-loop
    results.push(await resyncOneImageEmbedding(product))
  }

  return res.status(200).json({ results, total, nextCursor, done: batch.length < limit })
}

async function resyncOneImageEmbedding(product) {
  try {
    const result = await updateProductImageEmbeddings(product.id)
    if (!result.ok) {
      return { slug: product.slug, status: 'skipped', message: 'Product not found' }
    }
    const status = result.embedded ? 'synced' : result.total ? 'unchanged' : 'no-images'
    return {
      slug: product.slug,
      status,
      message: `${result.embedded} embedded, ${result.skipped} skipped, ${result.removed} removed`,
    }
  } catch (error) {
    console.error('[internal-product] image resync failed for', product.slug, '-', error?.message || error)
    return { slug: product.slug, status: 'error', message: String(error?.message || 'Failed').slice(0, 160) }
  }
}

async function getProductPayload(slug) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!product) return null

  const activeVariants = (product.variants || []).filter((v) => v?.active !== false)
  const primaryVariant =
    pickVariantForPricing(activeVariants, null) || product.variants[0] || null

  const actorMap = await resolveActorMap([product.createdById, product.updatedById])

  // The product's gallery, straight from its S3 folder (folder name === slug).
  // S3 is the source of truth for product photos, so this is what the internal
  // workspace shows and edits; `key` identifies the object to delete. The
  // `images` rows below are legacy base64 uploads, kept only because the
  // storefront still merges them — the workspace no longer displays them.
  let s3Images = []
  if (isS3Configured()) {
    try {
      const found = await listProductImagesBySlug(product.slug)
      s3Images = found.map((img, index) => ({
        url: img.url,
        key: img.key,
        sku: img.sku || null,
        sortOrder: index,
        source: 's3',
      }))
    } catch (error) {
      console.error('[internal-product] s3 image list failed:', error?.message || error)
    }
  }

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    category: product.category,
    subtype: product.subtype || '',
    material: product.material,
    color: product.color,
    description: product.description || '',
    aiDescription: product.aiDescription || '',
    productAttributes: normalizeProductAttributes(product.productAttributes),
    certLab: product.certLab || '',
    certNumber: product.certNumber || '',
    certFileUrl: product.certFileUrl || '',
    certFileKey: product.certFileKey || '',
    certifiedAt: product.certifiedAt || null,
    styleTags: Array.isArray(product.styleTags) ? product.styleTags : [],
    stoneTags: Array.isArray(product.stoneTags) ? product.stoneTags : [],
    customizationOptions: normalizeCustomizationOptions(product.customizationOptions),
    isNewArrival: Boolean(product.isNewArrival),
    isBestSeller: Boolean(product.isBestSeller),
    active: Boolean(product.active),
    rating: typeof product.rating === 'number' ? product.rating : null,
    reviewCount: typeof product.reviewCount === 'number' ? product.reviewCount : null,
    createdBy: actorName(actorMap, product.createdById),
    createdAt: product.createdAt,
    modifiedBy: actorName(actorMap, product.updatedById),
    modifiedAt: product.updatedAt,
    updatedAt: product.updatedAt,
    variantPricePaise:
      typeof primaryVariant?.listPricePaise === 'number' ? primaryVariant.listPricePaise : null,
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt || '',
      sortOrder: image.sortOrder,
      active: Boolean(image.active),
      source: 'db',
    })),
    s3Images,
  }
}

async function handleProductGet(res, slug) {
  if (!slug) return res.status(400).json({ message: 'slug is required.' })
  const product = await getProductPayload(slug)
  if (!product) return res.status(404).json({ message: 'Product not found.' })
  return res.status(200).json({ product })
}

async function handleGenerateAiDescription(res, currentSlug) {
  if (!currentSlug) return res.status(400).json({ message: 'current slug is required.' })

  const existing = await prisma.product.findUnique({
    where: { slug: currentSlug },
    include: {
      images: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!existing) return res.status(404).json({ message: 'Product not found.' })

  // Prefer the S3 gallery — that's where uploads land now. Legacy base64 rows
  // are the fallback for products that predate the S3-only workflow.
  let imageUrls = []
  if (isS3Configured()) {
    try {
      const s3 = await listProductImagesBySlug(existing.slug)
      imageUrls = s3.map((img) => img.url).filter(Boolean)
    } catch (error) {
      console.error('[internal-product] s3 image list failed for', existing.slug, '-', error?.message || error)
    }
  }
  if (!imageUrls.length) {
    imageUrls = existing.images.map((image) => image.url).filter(Boolean)
  }
  if (!imageUrls.length) {
    return res.status(400).json({ message: 'Upload at least one image before generating AI description.' })
  }

  let aiDescription = null
  try {
    aiDescription = await generateProductAiDescription({
      images: imageUrls,
      category: existing.category,
      title: existing.title,
    })
  } catch (error) {
    console.error('[internal-product] ai description generation failed:', error)
    return res.status(500).json({ message: 'Unable to generate AI description right now.' })
  }

  await prisma.product.update({
    where: { id: existing.id },
    data: { aiDescription },
  })

  // Refresh the image-search vector now that the AI description changed.
  await updateProductEmbeddingSafe(existing.id)

  invalidateCatalogProductsCache()
  const updated = await getProductPayload(currentSlug)
  return res.status(200).json({ product: updated })
}

async function handleProductPatch(res, currentSlug, body, userId) {
  if (!currentSlug) return res.status(400).json({ message: 'current slug is required.' })

  const existing = await prisma.product.findUnique({
    where: { slug: currentSlug },
    include: {
      variants: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!existing) return res.status(404).json({ message: 'Product not found.' })

  const nextSlug = String(body?.slug || '').trim()
  const title = String(body?.title || '').trim()
  const category = String(body?.category || '').trim()
  const material = String(body?.material || '').trim()
  const color = String(body?.color || '').trim()

  if (!nextSlug) return res.status(400).json({ message: 'Slug is required.' })
  if (!title) return res.status(400).json({ message: 'Title is required.' })
  if (!category) return res.status(400).json({ message: 'Category is required.' })
  if (!material) return res.status(400).json({ message: 'Material is required.' })
  if (!color) return res.status(400).json({ message: 'Color is required.' })

  // Product photos live in S3 now, so the edit form no longer sends an `images`
  // array. Absent means "leave the image rows alone" — the legacy base64 rows
  // some products still carry must survive a save. Only an explicitly supplied
  // array (older clients, scripts) rewrites them.
  const managesImageRows = Array.isArray(body?.images)
  const images = normalizeImages(body?.images)
  const imageError = validateImages(images)
  if (imageError) return res.status(400).json({ message: imageError })
  const customizationOptions = normalizeCustomizationOptions(body?.customizationOptions)
  const productAttributes = normalizeProductAttributes(body?.productAttributes)
  const certification = normalizeCertificationInput(body)
  const manualDescription = String(body?.description || '').trim()
  const variantPricePaise =
    body?.variantPricePaise === null || body?.variantPricePaise === ''
      ? null
      : Number(body?.variantPricePaise)

  let nextAiDescription = existing.aiDescription || null
  if (images.length) {
    try {
      nextAiDescription = await generateProductAiDescription({
        images: images.map((image) => image.url),
        category,
        title,
      })
    } catch (error) {
      console.error('[internal-product] ai description generation failed:', error)
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: {
          slug: nextSlug,
          title,
          category,
          subtype: String(body?.subtype || '').trim() || null,
          material,
          color,
          description: manualDescription || null,
          aiDescription: nextAiDescription,
          productAttributes,
          ...certification,
          styleTags: Array.isArray(body?.styleTags) ? normalizeTags(body.styleTags) : undefined,
          stoneTags: Array.isArray(body?.stoneTags) ? normalizeTags(body.stoneTags) : undefined,
          customizationOptions,
          isNewArrival: Boolean(body?.isNewArrival),
          isBestSeller: Boolean(body?.isBestSeller),
          active: body?.active !== false,
          rating:
            body?.rating === null || body?.rating === '' ? null : Number(body?.rating || 0),
          reviewCount:
            body?.reviewCount === null || body?.reviewCount === ''
              ? null
              : Number(body?.reviewCount || 0),
          updatedById: userId || null,
        },
      })

      if (managesImageRows) {
        await tx.productImage.deleteMany({ where: { productId: existing.id } })
        if (images.length) {
          await tx.productImage.createMany({
            data: images.map((image) => ({
              productId: existing.id,
              url: image.url,
              alt: image.alt,
              sortOrder: image.sortOrder,
              active: image.active,
            })),
          })
        }
      }

      if (Number.isFinite(variantPricePaise) && variantPricePaise != null && variantPricePaise > 0) {
        const primaryVariant = existing.variants[0]
        if (primaryVariant) {
          await tx.productVariant.update({
            where: { id: primaryVariant.id },
            data: {
              listPricePaise: Math.round(variantPricePaise),
              title: primaryVariant.title || title,
            },
          })
        } else {
          await tx.productVariant.create({
            data: {
              productId: existing.id,
              sku: createSkuFromSlug(nextSlug),
              title,
              listPricePaise: Math.round(variantPricePaise),
              currency: 'USD',
              active: true,
            },
          })
        }
        await upsertB2CPriceBookItem(tx, existing.id, variantPricePaise)
      }
    })
    // Keep the image-search vectors in sync with the edited product/images.
    await updateProductEmbeddingSafe(existing.id)
    await updateProductImageEmbeddingsSafe(existing.id)
    await syncStoneSizesInUse(customizationOptions?.centerStoneSizes)
  } catch (error) {
    console.error('[internal-product] patch failed:', error)
    const message =
      error?.code === 'P2002'
        ? 'That slug or image URL already exists on another product.'
        : String(error?.message || '').includes('index row size')
          ? 'Uploaded image is too large for the current database image index. Please run the latest migration and try again.'
        : 'Unable to save product.'
    return res.status(400).json({ message })
  }

  invalidateCatalogProductsCache()
  const updated = await getProductPayload(nextSlug)
  return res.status(200).json({ product: updated })
}

async function handleProductPost(res, body, userId) {
  const nextSlug = String(body?.slug || '').trim()
  const title = String(body?.title || '').trim()
  const category = String(body?.category || '').trim()
  const material = String(body?.material || '').trim()
  const color = String(body?.color || '').trim()

  if (!nextSlug) return res.status(400).json({ message: 'Slug is required.' })
  if (!title) return res.status(400).json({ message: 'Title is required.' })
  if (!category) return res.status(400).json({ message: 'Category is required.' })
  if (!material) return res.status(400).json({ message: 'Material is required.' })
  if (!color) return res.status(400).json({ message: 'Color is required.' })

  const images = normalizeImages(body?.images)
  const imageError = validateImages(images)
  if (imageError) return res.status(400).json({ message: imageError })
  const customizationOptions = normalizeCustomizationOptions(body?.customizationOptions)
  const productAttributes = normalizeProductAttributes(body?.productAttributes)
  const certification = normalizeCertificationInput(body)
  const manualDescription = String(body?.description || '').trim()
  const variantPricePaise =
    body?.variantPricePaise === null || body?.variantPricePaise === ''
      ? null
      : Number(body?.variantPricePaise)
  const listPricePaise =
    Number.isFinite(variantPricePaise) && variantPricePaise != null && variantPricePaise > 0
      ? Math.round(variantPricePaise)
      : 0

  const slugTaken = await prisma.product.findUnique({ where: { slug: nextSlug }, select: { id: true } })
  if (slugTaken) return res.status(400).json({ message: 'That slug is already in use.' })

  let aiDescription = null
  if (images.length) {
    try {
      aiDescription = await generateProductAiDescription({
        images: images.map((image) => image.url),
        category,
        title,
      })
    } catch (error) {
      console.error('[internal-product] ai description generation failed:', error)
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: nextSlug,
          title,
          category,
          subtype: String(body?.subtype || '').trim() || null,
          material,
          color,
          description: manualDescription || null,
          aiDescription,
          productAttributes,
          ...certification,
          styleTags: Array.isArray(body?.styleTags) ? normalizeTags(body.styleTags) : undefined,
          stoneTags: Array.isArray(body?.stoneTags) ? normalizeTags(body.stoneTags) : undefined,
          customizationOptions,
          isNewArrival: Boolean(body?.isNewArrival),
          isBestSeller: Boolean(body?.isBestSeller),
          active: body?.active !== false,
          rating:
            body?.rating === null || body?.rating === '' ? null : Number(body?.rating || 0),
          reviewCount:
            body?.reviewCount === null || body?.reviewCount === ''
              ? null
              : Number(body?.reviewCount || 0),
          createdById: userId || null,
          updatedById: userId || null,
        },
      })
      await tx.productVariant.create({
        data: {
          productId: product.id,
          sku: createSkuFromSlug(nextSlug),
          title,
          listPricePaise: listPricePaise,
          currency: 'USD',
          active: true,
        },
      })
      if (listPricePaise > 0) {
        await upsertB2CPriceBookItem(tx, product.id, listPricePaise)
      }
      if (images.length) {
        await tx.productImage.createMany({
          data: images.map((image) => ({
            productId: product.id,
            url: image.url,
            alt: image.alt,
            sortOrder: image.sortOrder,
            active: image.active,
          })),
        })
      }
    })
  } catch (error) {
    console.error('[internal-product] create failed:', error)
    const message =
      error?.code === 'P2002'
        ? 'That slug or image URL already exists on another product.'
        : String(error?.message || '').includes('index row size')
          ? 'Uploaded image is too large for the current database image index. Please run the latest migration and try again.'
        : 'Unable to create product.'
    return res.status(400).json({ message })
  }

  // Generate the image-search vectors for the newly created product.
  const createdRow = await prisma.product.findUnique({ where: { slug: nextSlug }, select: { id: true } })
  if (createdRow) {
    await updateProductEmbeddingSafe(createdRow.id)
    await updateProductImageEmbeddingsSafe(createdRow.id)
  }
  await syncStoneSizesInUse(customizationOptions?.centerStoneSizes)

  invalidateCatalogProductsCache()
  const created = await getProductPayload(nextSlug)
  return res.status(201).json({ product: created })
}

async function handleProductResource(req, res, body) {
  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const slug = String(req?.query?.slug || body?.slug || '').trim()
  const currentSlug = String(req?.query?.currentSlug || body?.currentSlug || slug).trim()
  const action = String(req?.query?.action || body?.action || '').trim()
  const internalUser = await assertInternalStrict(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  if (req.method === 'GET') {
    if (action === 'export') {
      return handleProductExport(res)
    }
    return handleProductGet(res, slug)
  }

  if (req.method === 'PATCH') {
    if (action === 'generate-ai-description') {
      return handleGenerateAiDescription(res, currentSlug)
    }
    return handleProductPatch(res, currentSlug, body, userId)
  }

  if (req.method === 'POST') {
    if (action === 'bulk') {
      return handleBulk(res, body)
    }
    if (action === 'bulk-ai') {
      return handleBulkAi(res, body)
    }
    if (action === 'resync-image-embeddings') {
      return handleResyncImageEmbeddings(res, body, slug)
    }
    return handleProductPost(res, body, userId)
  }

  res.setHeader('Allow', 'GET,PATCH,POST,OPTIONS')
  return res.status(405).json({ message: 'Method not allowed' })
}

// ---------------------------------------------------------------------------
// Homepage slides (resource=homepage-slides)
// ---------------------------------------------------------------------------

// Attach resolved created-by / modified-by display names to raw slide rows.
async function withSlideActors(slides) {
  const actorMap = await resolveActorMap(
    slides.flatMap((slide) => [slide.createdById, slide.updatedById]),
  )
  return slides.map((slide) => ({
    ...slide,
    createdBy: actorName(actorMap, slide.createdById),
    modifiedBy: actorName(actorMap, slide.updatedById),
    modifiedAt: slide.updatedAt,
  }))
}

function normalizeSlides(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((slide, index) => ({
      id: String(slide?.id || '').trim() || null,
      imageUrl: String(slide?.imageUrl || '').trim(),
      mobileImageUrl: String(slide?.mobileImageUrl || '').trim() || null,
      headline: String(slide?.headline || '').trim() || null,
      subheadline: String(slide?.subheadline || '').trim() || null,
      ctaLabel: String(slide?.ctaLabel || '').trim() || null,
      ctaHref: String(slide?.ctaHref || '').trim() || null,
      device:
        slide?.device === 'desktop' || slide?.device === 'mobile' ? slide.device : 'all',
      sortOrder:
        Number.isFinite(Number(slide?.sortOrder)) && Number(slide.sortOrder) >= 0
          ? Number(slide.sortOrder)
          : index,
      active: slide?.active !== false,
    }))
    // Keep any slide that has a usable image for at least one device. A
    // mobile-only banner has an empty desktop `imageUrl` but a `mobileImageUrl`,
    // and must not be dropped on save.
    .filter((slide) => slide.imageUrl || slide.mobileImageUrl)
}

async function handleSlidesResource(req, res, body) {
  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const internalUser = await assertInternalStrict(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  if (req.method === 'GET') {
    try {
      return res.status(200).json({ slides: await withSlideActors(await getAllHomepageSlides()) })
    } catch (error) {
      console.error('[internal-homepage-slides] get failed:', error)
      return res.status(500).json({ message: 'Unable to load homepage slides.' })
    }
  }

  if (req.method === 'PUT') {
    const slides = normalizeSlides(body?.slides)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.homepageSlide.deleteMany()
        if (slides.length) {
          await tx.homepageSlide.createMany({
            // Slides are wiped and recreated on every save, so both audit ids
            // reflect whoever performed this full save.
            data: slides.map((slide) => ({
              imageUrl: slide.imageUrl,
              mobileImageUrl: slide.mobileImageUrl,
              headline: slide.headline,
              subheadline: slide.subheadline,
              ctaLabel: slide.ctaLabel,
              ctaHref: slide.ctaHref,
              device: slide.device,
              sortOrder: slide.sortOrder,
              active: slide.active,
              createdById: internalUser.id,
              updatedById: internalUser.id,
            })),
          })
        }
      })
      return res.status(200).json({ slides: await withSlideActors(await getAllHomepageSlides()) })
    } catch (error) {
      console.error('[internal-homepage-slides] save failed:', error)
      return res.status(500).json({ message: 'Unable to save homepage slides.' })
    }
  }

  res.setHeader('Allow', 'GET,PUT')
  return res.status(405).json({ message: 'Method not allowed' })
}

// ---------------------------------------------------------------------------
// Site config (resource=site-config)
// ---------------------------------------------------------------------------

async function handleSiteConfigResource(req, res, body) {
  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const internalUser = await assertInternalUser(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  if (req.method === 'GET') {
    try {
      return res.status(200).json({ siteConfig: await getSiteConfig() })
    } catch (error) {
      console.error('[internal-site-config] get failed:', error)
      return res.status(500).json({ message: 'Unable to load site configuration.' })
    }
  }

  if (req.method === 'PUT') {
    // Only forward the fields present in the request body so a save from one
    // tab (branding vs. discounts) never overwrites the other's settings.
    const patch = {}
    if ('logoUrl' in (body || {})) {
      patch.logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl : ''
    }
    if ('volumeDiscountEnabled' in (body || {})) {
      patch.volumeDiscountEnabled = body.volumeDiscountEnabled
    }
    if ('volumeDiscountTiers' in (body || {})) {
      patch.volumeDiscountTiers = body.volumeDiscountTiers
    }
    if ('collectionImages' in (body || {})) {
      patch.collectionImages = body.collectionImages
    }
    if ('aboutContent' in (body || {})) {
      patch.aboutContent = body.aboutContent
    }
    try {
      return res.status(200).json({ siteConfig: await saveSiteConfig(patch) })
    } catch (error) {
      console.error('[internal-site-config] save failed:', error)
      return res.status(500).json({ message: 'Unable to save site configuration.' })
    }
  }

  res.setHeader('Allow', 'GET,PUT')
  return res.status(405).json({ message: 'Method not allowed' })
}

// ---------------------------------------------------------------------------
// Stone sizes registry (resource=stone-sizes)
// ---------------------------------------------------------------------------

function normalizeStoneSizesInput(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  return input
    .map((entry, index) => ({
      value: String(entry?.value || '').trim(),
      label: String(entry?.label || '').trim() || null,
      sortOrder:
        Number.isFinite(Number(entry?.sortOrder)) && Number(entry.sortOrder) >= 0
          ? Number(entry.sortOrder)
          : index,
      active: entry?.active !== false,
    }))
    .filter((entry) => {
      if (!entry.value || seen.has(entry.value)) return false
      seen.add(entry.value)
      return true
    })
}

async function handleStoneSizesResource(req, res, body) {
  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const internalUser = await assertInternalStrict(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  if (req.method === 'GET') {
    try {
      return res.status(200).json({ stoneSizes: await getAllStoneSizes() })
    } catch (error) {
      console.error('[internal-stone-sizes] get failed:', error)
      return res.status(500).json({ message: 'Unable to load stone sizes.' })
    }
  }

  if (req.method === 'PUT') {
    // Curate the registry: upsert each provided size (label/order/active) and
    // drop any the workspace removed. The `value` is the stable key, so
    // re-syncs from product saves keep landing on the same row.
    const sizes = normalizeStoneSizesInput(body?.stoneSizes)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.stoneSize.deleteMany({ where: { value: { notIn: sizes.map((s) => s.value) } } })
        for (const size of sizes) {
          // eslint-disable-next-line no-await-in-loop
          await tx.stoneSize.upsert({
            where: { value: size.value },
            update: { label: size.label, sortOrder: size.sortOrder, active: size.active },
            create: { value: size.value, label: size.label, sortOrder: size.sortOrder, active: size.active },
          })
        }
      })
      invalidateStoneSizesCache()
      return res.status(200).json({ stoneSizes: await getAllStoneSizes() })
    } catch (error) {
      console.error('[internal-stone-sizes] save failed:', error)
      return res.status(500).json({ message: 'Unable to save stone sizes.' })
    }
  }

  res.setHeader('Allow', 'GET,PUT')
  return res.status(405).json({ message: 'Method not allowed' })
}

// ---------------------------------------------------------------------------
// Image upload presign (resource=upload-image)
// ---------------------------------------------------------------------------

// Hands the browser a short-lived presigned PUT URL so it can upload a homepage
// banner straight to S3, plus the public URL to persist on the slide. The file
// itself never passes through this serverless function.
async function handleUploadImageResource(req, res, body) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const internalUser = await assertInternalStrict(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  if (!isUploadConfigured()) {
    // Signals the client to fall back to inline (base64) storage.
    return res.status(501).json({ message: 'Image uploads are not configured.' })
  }

  const contentType = String(body?.contentType || '').trim()
  const target =
    body?.target === 'mobile'
      ? 'mobile'
      : body?.target === 'collection'
        ? 'collection'
        : body?.target === 'about'
          ? 'about'
          : 'desktop'

  try {
    const result = await createPresignedHomepageUpload({ contentType, target })
    return res.status(200).json(result)
  } catch (error) {
    if (error?.code === 'UNSUPPORTED_TYPE') {
      return res.status(400).json({ message: error.message })
    }
    console.error('[internal-upload-image] presign failed:', error)
    return res.status(500).json({ message: 'Unable to start the upload.' })
  }
}

// ---------------------------------------------------------------------------
// Product images in S3 (resource=product-image)
// ---------------------------------------------------------------------------

// S3 is the single source of truth for product photos, so the workspace edits
// the bucket directly rather than storing image rows:
//   action=presign  -> presigned PUT URLs for a batch; the browser uploads the
//                      bytes itself, and the first object under a new product's
//                      prefix is what brings its folder into existence.
//   action=uploaded -> called once the PUTs land; refreshes caches/vectors.
//   action=delete   -> removes one object from the product's folder.
// The two mutating actions return the refreshed product so the gallery re-renders
// from S3 rather than from optimistic client state.
async function handleProductImageResource(req, res, body) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const internalUser = await assertInternalStrict(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  if (!isProductImageWriteConfigured()) {
    return res.status(501).json({ message: 'Product image storage is not configured.' })
  }

  const action = String(body?.action || '').trim()
  const slug = String(body?.slug || '').trim()
  if (!slug) return res.status(400).json({ message: 'slug is required.' })

  // Guard against typo'd or stale slugs writing stray folders into the bucket.
  const product = await prisma.product.findUnique({ where: { slug }, select: { id: true } })
  if (!product) return res.status(404).json({ message: 'Product not found.' })

  try {
    if (action === 'presign') {
      const files = Array.isArray(body?.files)
        ? body.files.map((file) => ({ contentType: String(file?.contentType || '') }))
        : []
      const uploads = await createPresignedProductImageUploads({ slug, files })
      return res.status(200).json({ uploads })
    }

    if (action === 'delete') {
      await deleteProductImage({ slug, key: String(body?.key || '') })
    } else if (action !== 'uploaded') {
      return res.status(400).json({ message: 'Unknown action.' })
    }

    // Gallery changed: drop the cached catalog + S3 sweep, then re-derive the
    // photo vectors from the new set of images.
    invalidateCatalogProductsCache()
    await updateProductImageEmbeddingsSafe(product.id)
    const updated = await getProductPayload(slug)
    return res.status(200).json({ product: updated })
  } catch (error) {
    if (
      error?.code === 'UNSUPPORTED_TYPE' ||
      error?.code === 'MISSING_SLUG' ||
      error?.code === 'MISSING_KEY' ||
      error?.code === 'NO_FILES' ||
      error?.code === 'KEY_MISMATCH'
    ) {
      return res.status(400).json({ message: error.message })
    }
    console.error('[internal-product-image]', action, 'failed:', error)
    return res.status(500).json({ message: 'Unable to update product images.' })
  }
}

// ---------------------------------------------------------------------------
// Service requests (resource=services)
// ---------------------------------------------------------------------------

// Workspace view of craft-service bookings. GET lists (or returns one by
// ?reference=), PUT moves the status along new → reviewing → quoted, POST logs
// a request keyed in by the team (phone / showroom).
async function handleServicesResource(req, res, body) {
  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const internalUser = await assertInternalUser(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  try {
    if (req.method === 'GET') {
      const reference = String(req?.query?.reference || '').trim()
      if (reference) {
        const request = await prisma.serviceRequest.findUnique({ where: { reference } })
        if (!request) return res.status(404).json({ message: 'Service request not found.' })
        return res.status(200).json({ request: toServiceRequestPayload(request) })
      }
      const requests = await prisma.serviceRequest.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
      })
      return res.status(200).json({ requests: requests.map(toServiceRequestPayload) })
    }

    if (req.method === 'POST') {
      const result = await createServiceRequestRecord({ body, createdById: internalUser.id })
      if (result.error) return res.status(400).json({ message: result.error })
      return res.status(200).json({ request: toServiceRequestPayload(result.request) })
    }

    if (req.method === 'PUT') {
      const reference = String(body?.reference || '').trim()
      const status = String(body?.status || '').trim().toUpperCase()
      if (!reference) return res.status(400).json({ message: 'reference is required.' })
      if (!SERVICE_REQUEST_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Invalid status.' })
      }
      const existing = await prisma.serviceRequest.findUnique({ where: { reference } })
      if (!existing) return res.status(404).json({ message: 'Service request not found.' })
      const request = await prisma.serviceRequest.update({
        where: { reference },
        data: { status, updatedById: internalUser.id },
      })
      return res.status(200).json({ request: toServiceRequestPayload(request) })
    }

    res.setHeader('Allow', 'GET,POST,PUT,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  } catch (err) {
    console.error('Internal services resource failed:', err)
    return res.status(500).json({ message: 'Service request operation failed.' })
  }
}

// ---------------------------------------------------------------------------
// Product certificates in S3 (resource=product-certificate)
// ---------------------------------------------------------------------------

// A lab report is one file per piece, so — unlike the photo gallery — the
// product row holds the pointer to it (certFileUrl/certFileKey):
//   action=presign -> presigned PUT URL; the browser sends the bytes itself.
//   action=attach  -> called once the PUT lands; saves url+key on the product
//                     and deletes the file it replaced.
//   action=delete  -> removes the object and clears the pointer.
// The mutating actions return the refreshed product so the workspace re-renders
// from the saved row rather than from optimistic client state.
async function handleProductCertificateResource(req, res, body) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const userId = String(req?.query?.userId || body?.userId || '').trim()
  const internalUser = await assertInternalStrict(userId)
  if (!internalUser) return res.status(403).json({ message: 'Internal access required.' })

  if (!isUploadConfigured()) {
    return res.status(501).json({ message: 'Certificate storage is not configured.' })
  }

  const action = String(body?.action || '').trim()
  const slug = String(body?.slug || '').trim()
  if (!slug) return res.status(400).json({ message: 'slug is required.' })

  const product = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, certFileKey: true },
  })
  if (!product) return res.status(404).json({ message: 'Product not found.' })

  try {
    if (action === 'presign') {
      const upload = await createPresignedCertificateUpload({
        slug,
        contentType: String(body?.contentType || ''),
      })
      return res.status(200).json({ upload })
    }

    if (action === 'attach') {
      const url = String(body?.url || '').trim()
      const key = String(body?.key || '').trim()
      if (!url || !key) return res.status(400).json({ message: 'Certificate url and key are required.' })

      await prisma.product.update({
        where: { id: product.id },
        data: { certFileUrl: url, certFileKey: key, updatedById: userId || null },
      })

      // Replacing a certificate: the superseded object is now unreachable, so
      // drop it rather than leaving it to age in the bucket. A failure here is
      // only wasted storage — the row already points at the new file.
      if (product.certFileKey && product.certFileKey !== key) {
        try {
          await deleteCertificateFile({ key: product.certFileKey })
        } catch (error) {
          console.error('[internal-product-certificate] stale file cleanup failed:', error?.message || error)
        }
      }
    } else if (action === 'delete') {
      if (product.certFileKey) {
        await deleteCertificateFile({ key: product.certFileKey })
      }
      await prisma.product.update({
        where: { id: product.id },
        data: { certFileUrl: null, certFileKey: null, updatedById: userId || null },
      })
    } else {
      return res.status(400).json({ message: 'Unknown action.' })
    }

    // The certificate link is part of the cached catalog payload.
    invalidateCatalogProductsCache()
    const updated = await getProductPayload(slug)
    return res.status(200).json({ product: updated })
  } catch (error) {
    if (
      error?.code === 'UNSUPPORTED_TYPE' ||
      error?.code === 'MISSING_SLUG' ||
      error?.code === 'MISSING_KEY' ||
      error?.code === 'KEY_MISMATCH'
    ) {
      return res.status(400).json({ message: error.message })
    }
    console.error('[internal-product-certificate]', action, 'failed:', error)
    return res.status(500).json({ message: 'Unable to update the certificate.' })
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  const body = parseBody(req)
  const resource = String(req?.query?.resource || body?.resource || '').trim()

  if (resource === 'products-list') return handleProductsListResource(req, res, body)
  if (resource === 'orders-list') return handleOrdersListResource(req, res, body)
  if (resource === 'users-list') return handleUsersListResource(req, res, body)
  if (resource === 'user-create') return handleUserCreateResource(req, res, body)
  if (resource === 'order-create') return handleOrderCreateResource(req, res, body)
  if (resource === 'product') return handleProductResource(req, res, body)
  if (resource === 'homepage-slides') return handleSlidesResource(req, res, body)
  if (resource === 'site-config') return handleSiteConfigResource(req, res, body)
  if (resource === 'stone-sizes') return handleStoneSizesResource(req, res, body)
  if (resource === 'upload-image') return handleUploadImageResource(req, res, body)
  if (resource === 'product-image') return handleProductImageResource(req, res, body)
  if (resource === 'product-certificate') return handleProductCertificateResource(req, res, body)
  if (resource === 'services') return handleServicesResource(req, res, body)
  return handleDashboardResource(req, res, body)
}
