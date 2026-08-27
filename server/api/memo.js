import { prisma } from './db.js'
import { creditLimitToUsd, formatUsd } from './money.js'

// Memo = goods on consignment. The pieces leave with the customer but stay ours
// until they either buy them (convert) or send them back (return). No payment is
// taken when a memo is issued, which is why issuing one is gated on an explicit
// per-customer permission and capped by a value limit.

// Statuses where goods are still out with the customer.
export const OPEN_MEMO_STATUSES = ['ISSUED', 'PARTIAL']
export const MEMO_STATUSES = ['ISSUED', 'PARTIAL', 'CONVERTED', 'RETURNED', 'CANCELLED']

// Self-service extension: the customer may push the due date out themselves,
// but only once and only as the period runs out. Asking on day one would just
// be a longer memo, and asking after it lapses is a conversation with us, not a
// button — so staff extend those from the internal memo screen instead.
export const MEMO_EXTEND_WINDOW_DAYS = 3
export const MEMO_MAX_SELF_EXTENSIONS = 1

// Everything toMemoPayload reads off a memo row. Callers needing more (the
// customer, say) spread this and add to it, so no payload ever reports an empty
// `orders` merely because the relation was left out of the query.
export const MEMO_PAYLOAD_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
  orders: { select: { id: true, orderNo: true, status: true }, orderBy: { createdAt: 'asc' } },
}

export class MemoError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'MemoError'
    this.code = code
    this.status = status
  }
}

/** Pieces on this line still physically with the customer. */
export function memoLineOutQty(item) {
  return Math.max(Number(item?.qty || 0) - Number(item?.returnedQty || 0) - Number(item?.convertedQty || 0), 0)
}

export function memoOutstandingPaise(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.pricePaise || 0) * memoLineOutQty(item), 0)
}

/**
 * A memo's status is always derived from its lines, never set by hand — that way
 * a partially returned memo can never disagree with the pieces it lists.
 */
export function deriveMemoStatus(items) {
  const openQty = (items || []).reduce((sum, item) => sum + memoLineOutQty(item), 0)
  const convertedQty = (items || []).reduce((sum, item) => sum + Number(item.convertedQty || 0), 0)
  const returnedQty = (items || []).reduce((sum, item) => sum + Number(item.returnedQty || 0), 0)
  if (openQty > 0) return convertedQty > 0 || returnedQty > 0 ? 'PARTIAL' : 'ISSUED'
  return convertedQty > 0 ? 'CONVERTED' : 'RETURNED'
}

export function deriveMemoItemStatus(item) {
  if (memoLineOutQty(item) > 0) return 'OUT'
  return Number(item.convertedQty || 0) > 0 ? 'CONVERTED' : 'RETURNED'
}

/** Overdue is derived from the due date, not stored — no job needed to age memos. */
export function isMemoOverdue(memo) {
  if (!OPEN_MEMO_STATUSES.includes(memo?.status)) return false
  return new Date(memo.dueDate).getTime() < Date.now()
}

/** Whole days left before the memo is due; negative once it is overdue. */
export function memoDaysUntilDue(memo, now = new Date()) {
  if (!memo?.dueDate) return 0
  return Math.ceil((new Date(memo.dueDate).getTime() - now.getTime()) / 86400000)
}

/**
 * Whether the customer may extend this memo themselves. Deliberately narrow:
 * the memo has to still be open, inside the final window, not already overdue,
 * and not already extended.
 */
export function canCustomerExtendMemo(memo, now = new Date()) {
  if (!memo || !OPEN_MEMO_STATUSES.includes(memo.status)) return false
  if (Number(memo.extensionCount || 0) >= MEMO_MAX_SELF_EXTENSIONS) return false
  // Compared against the exact due timestamp, not the rounded day count, so a
  // memo that already reads "Overdue" never still offers the button.
  if (new Date(memo.dueDate).getTime() < now.getTime()) return false
  return memoDaysUntilDue(memo, now) <= MEMO_EXTEND_WINDOW_DAYS
}

/**
 * Format a memo amount. Despite the `*Paise` column names, MemoItem.pricePaise
 * and Memo.subtotalPaise hold WHOLE US DOLLARS — see money.js. This used to
 * divide by 100, which rendered every memo value at a hundredth of its worth;
 * a credit limit (which really is stored in cents) must be converted with
 * creditLimitToUsd before it reaches this function.
 */
export function formatMemoMoney(usd, currency = 'USD') {
  return formatUsd(usd, currency)
}

/** Total value a customer currently holds on memo, across every open memo. */
export async function getMemoOutstandingPaise(customerId, client = prisma) {
  const items = await client.memoItem.findMany({
    where: { memo: { customerId, status: { in: OPEN_MEMO_STATUSES } } },
    select: { pricePaise: true, qty: true, returnedQty: true, convertedQty: true },
  })
  return memoOutstandingPaise(items)
}

export async function getMemoCustomer(customerId, client = prisma) {
  if (!customerId) return null
  return client.user.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      channel: true,
      canMemo: true,
      memoLimitPaise: true,
      memoDays: true,
    },
  })
}

export function memoDueDate(memoDays, from = new Date()) {
  const days = Number(memoDays) > 0 ? Number(memoDays) : 30
  const due = new Date(from)
  due.setDate(due.getDate() + days)
  return due
}

/**
 * Pieces here are one-offs, so a variant already out on an open memo must not go
 * out again on a second one. (Inventory/Inventory.reserved is not wired into any
 * flow in this codebase yet, so the check lives at the memo level.)
 */
async function assertVariantsAvailable(variantIds, client = prisma) {
  if (!variantIds.length) return
  const clashes = await client.memoItem.findMany({
    where: {
      variantId: { in: variantIds },
      memo: { status: { in: OPEN_MEMO_STATUSES } },
    },
    select: {
      qty: true,
      returnedQty: true,
      convertedQty: true,
      titleSnapshot: true,
      memo: { select: { memoNo: true } },
    },
  })
  const blocking = clashes.filter((item) => memoLineOutQty(item) > 0)
  if (blocking.length) {
    const first = blocking[0]
    throw new MemoError(
      'MEMO_PIECE_OUT',
      `"${first.titleSnapshot}" is already out on memo ${first.memo.memoNo}. It has to come back before it can go out again.`,
      409,
    )
  }
}

/** Sequential MEMO-000123; memoNo is unique, so retry when a concurrent create takes it. */
async function createWithMemoNo(data, client = prisma) {
  let seq = (await client.memo.count()) + 1
  for (let attempt = 0; attempt < 5; attempt += 1, seq += 1) {
    try {
      return await client.memo.create({
        data: { ...data, memoNo: `MEMO-${String(seq).padStart(6, '0')}` },
        include: { items: true },
      })
    } catch (err) {
      if (err?.code !== 'P2002') throw err
    }
  }
  throw new MemoError('MEMO_NO_CONFLICT', 'Could not allocate a memo number. Try again.', 500)
}

/**
 * Issue a memo. `lines` are already priced by the caller (storefront cart price
 * or internal list price) because a memo locks its prices when the goods leave —
 * a later gold-rate move does not change what the customer owes on conversion.
 */
export async function createMemo({ customerId, lines, shipTo = null, notes = '', actorId = null, currency = 'USD' }) {
  const customer = await getMemoCustomer(customerId)
  if (!customer) throw new MemoError('MEMO_NO_CUSTOMER', 'User not found.', 404)
  if (!customer.canMemo) {
    throw new MemoError('MEMO_NOT_ALLOWED', 'This account is not approved for memo.', 403)
  }

  const clean = (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      variantId: String(line?.variantId || '').trim(),
      titleSnapshot: String(line?.titleSnapshot || '').trim() || 'Item',
      pricePaise: Math.max(Math.round(Number(line?.pricePaise) || 0), 0),
      qty: Math.min(Math.floor(Number(line?.qty) || 0), 999),
    }))
    .filter((line) => line.variantId && line.qty > 0)
  if (!clean.length) throw new MemoError('MEMO_EMPTY', 'Add at least one piece to the memo.')

  const subtotalPaise = clean.reduce((sum, line) => sum + line.pricePaise * line.qty, 0)

  // The limit is checked against everything already out, server-side — the UI
  // check is a courtesy, this one is the rule.
  // memoLimitPaise is stored in CENTS by the internal admin screen, while the
  // value out is in whole dollars, so the limit is converted before comparing.
  // Comparing them raw made every limit behave as if it were 100x larger.
  const limitUsd = creditLimitToUsd(customer.memoLimitPaise)
  if (limitUsd != null) {
    const outstanding = await getMemoOutstandingPaise(customer.id)
    if (outstanding + subtotalPaise > limitUsd) {
      const available = Math.max(limitUsd - outstanding, 0)
      throw new MemoError(
        'MEMO_LIMIT_EXCEEDED',
        `Memo limit reached. ${formatMemoMoney(outstanding, currency)} is already out against a ${formatMemoMoney(
          limitUsd,
          currency,
        )} limit, leaving ${formatMemoMoney(available, currency)} available.`,
      )
    }
  }

  await assertVariantsAvailable(clean.map((line) => line.variantId))

  return createWithMemoNo({
    customerId: customer.id,
    status: 'ISSUED',
    dueDate: memoDueDate(customer.memoDays),
    subtotalPaise,
    currency,
    shipTo: shipTo || undefined,
    notes: notes || undefined,
    createdById: actorId || undefined,
    updatedById: actorId || undefined,
    items: {
      create: clean.map(({ variantId, titleSnapshot, pricePaise, qty }) => ({
        variantId,
        titleSnapshot,
        pricePaise,
        qty,
      })),
    },
  })
}

async function loadOpenMemo(memoId, client = prisma) {
  const memo = await client.memo.findUnique({
    where: { id: memoId },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  })
  if (!memo) throw new MemoError('MEMO_NOT_FOUND', 'Memo not found.', 404)
  if (!OPEN_MEMO_STATUSES.includes(memo.status)) {
    throw new MemoError('MEMO_CLOSED', `Memo ${memo.memoNo} is already closed.`, 409)
  }
  return memo
}

/**
 * Requested line quantities, defaulting to "everything still out" when the
 * caller passes no lines (the whole-memo return / whole-memo buy case).
 */
function resolveLineQtys(memo, requestedLines) {
  const requested = new Map(
    (Array.isArray(requestedLines) ? requestedLines : [])
      .map((line) => [String(line?.memoItemId || line?.id || '').trim(), Math.floor(Number(line?.qty) || 0)])
      .filter(([id, qty]) => id && qty > 0),
  )
  const resolved = []
  for (const item of memo.items) {
    const outQty = memoLineOutQty(item)
    if (outQty <= 0) continue
    const wanted = requested.size ? requested.get(item.id) || 0 : outQty
    if (wanted <= 0) continue
    if (wanted > outQty) {
      throw new MemoError(
        'MEMO_QTY_TOO_HIGH',
        `Only ${outQty} of "${item.titleSnapshot}" is still out on this memo.`,
      )
    }
    resolved.push({ item, qty: wanted })
  }
  if (!resolved.length) throw new MemoError('MEMO_NOTHING_OUT', 'Nothing on this memo is still out.')
  return resolved
}

async function refreshMemoStatus(memoId, actorId, client) {
  const items = await client.memoItem.findMany({ where: { memoId } })
  const status = deriveMemoStatus(items)
  const closed = !OPEN_MEMO_STATUSES.includes(status)
  return client.memo.update({
    where: { id: memoId },
    data: {
      status,
      closedAt: closed ? new Date() : null,
      updatedById: actorId || undefined,
    },
    include: MEMO_PAYLOAD_INCLUDE,
  })
}

/** Pieces came back. Pass no lines to return the whole memo. */
export async function returnMemoItems({ memoId, lines = null, actorId = null }) {
  const memo = await loadOpenMemo(memoId)
  const resolved = resolveLineQtys(memo, lines)

  return prisma.$transaction(async (tx) => {
    for (const { item, qty } of resolved) {
      const returnedQty = item.returnedQty + qty
      await tx.memoItem.update({
        where: { id: item.id },
        data: {
          returnedQty,
          status: deriveMemoItemStatus({ ...item, returnedQty }),
        },
      })
    }
    return refreshMemoStatus(memo.id, actorId, tx)
  })
}

/**
 * The customer is keeping pieces: those lines become a real sale. The memo's
 * locked prices carry over to the order, and the order gets an invoice — the
 * existing Invoice row hangs off Order, so conversion produces both rather than
 * a floating invoice. The order records the memo it came from, so a memo bought
 * in instalments ends up with one order per buyback, all of them traceable.
 *
 * `customerId` scopes the memo to its owner for self-service conversion; staff
 * callers omit it, the same contract as extendMemo.
 */
export async function convertMemoToOrder({ memoId, lines = null, actorId = null, customerId = null }) {
  const memo = await loadOpenMemo(memoId)
  if (customerId && memo.customerId !== customerId) {
    throw new MemoError('MEMO_NOT_FOUND', 'Memo not found.', 404)
  }
  const resolved = resolveLineQtys(memo, lines)
  const customer = await getMemoCustomer(memo.customerId)

  const subtotalPaise = resolved.reduce((sum, { item, qty }) => sum + item.pricePaise * qty, 0)

  return prisma.$transaction(async (tx) => {
    let order = null
    let orderSeq = (await tx.order.count()) + 1
    for (let attempt = 0; attempt < 5 && !order; attempt += 1, orderSeq += 1) {
      try {
        order = await tx.order.create({
          data: {
            orderNo: `ORD-${String(orderSeq).padStart(6, '0')}`,
            channel: customer?.channel || 'B2C',
            status: 'CONFIRMED',
            customerId: memo.customerId,
            memoId: memo.id,
            subtotalPaise,
            totalPaise: subtotalPaise,
            currency: memo.currency,
            notes: `Converted from memo ${memo.memoNo}`,
            createdById: actorId || undefined,
            updatedById: actorId || undefined,
            items: {
              create: resolved.map(({ item, qty }) => ({
                variantId: item.variantId,
                titleSnapshot: item.titleSnapshot,
                pricePaise: item.pricePaise,
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
    if (!order) throw new MemoError('MEMO_ORDER_CONFLICT', 'Could not allocate an order number. Try again.', 500)

    let invoiceSeq = (await tx.invoice.count()) + 1
    let invoice = null
    for (let attempt = 0; attempt < 5 && !invoice; attempt += 1, invoiceSeq += 1) {
      try {
        invoice = await tx.invoice.create({
          data: {
            invoiceNo: `INV-${String(invoiceSeq).padStart(6, '0')}`,
            orderId: order.id,
            amountPaise: subtotalPaise,
            status: 'issued',
          },
          select: { id: true, invoiceNo: true },
        })
      } catch (err) {
        if (err?.code !== 'P2002') throw err
      }
    }

    for (const { item, qty } of resolved) {
      const convertedQty = item.convertedQty + qty
      await tx.memoItem.update({
        where: { id: item.id },
        data: {
          convertedQty,
          status: deriveMemoItemStatus({ ...item, convertedQty }),
        },
      })
    }

    const updated = await refreshMemoStatus(memo.id, actorId, tx)
    return { memo: updated, order, invoice }
  })
}

/**
 * Push a memo's due date out. The new date is measured from the current due
 * date (not from today), so extending early never shortens the period the
 * customer already has.
 *
 * `bySelf` applies the customer rules — final-window only, one extension. Staff
 * pass `bySelf: false` and may extend any open memo, by any sane number of days.
 */
export async function extendMemo({ memoId, days = null, actorId = null, bySelf = false, customerId = null }) {
  const memo = await loadOpenMemo(memoId)
  if (customerId && memo.customerId !== customerId) {
    throw new MemoError('MEMO_NOT_FOUND', 'Memo not found.', 404)
  }

  if (bySelf) {
    if (Number(memo.extensionCount || 0) >= MEMO_MAX_SELF_EXTENSIONS) {
      throw new MemoError(
        'MEMO_ALREADY_EXTENDED',
        'This memo has already been extended once. Contact us to keep the pieces longer.',
        409,
      )
    }
    const daysLeft = memoDaysUntilDue(memo)
    if (new Date(memo.dueDate).getTime() < Date.now()) {
      throw new MemoError(
        'MEMO_OVERDUE',
        'This memo is past its due date, so it can no longer be extended here. Contact us and we will sort it out.',
        409,
      )
    }
    if (daysLeft > MEMO_EXTEND_WINDOW_DAYS) {
      throw new MemoError(
        'MEMO_EXTEND_TOO_EARLY',
        `A memo can be extended in its last ${MEMO_EXTEND_WINDOW_DAYS} days. This one still has ${daysLeft} ${
          daysLeft === 1 ? 'day' : 'days'
        } to run.`,
        409,
      )
    }
  }

  // Customers get the same period their account is set up for; staff can name
  // their own number of days.
  let extraDays = Math.floor(Number(days) || 0)
  if (bySelf || extraDays <= 0) {
    const customer = await getMemoCustomer(memo.customerId)
    extraDays = Number(customer?.memoDays) > 0 ? Number(customer.memoDays) : 30
  }
  if (extraDays <= 0 || extraDays > 365) {
    throw new MemoError('MEMO_EXTEND_DAYS', 'Extend a memo by between 1 and 365 days.')
  }

  return prisma.memo.update({
    where: { id: memo.id },
    data: {
      dueDate: memoDueDate(extraDays, memo.dueDate),
      extensionCount: { increment: 1 },
      lastExtendedAt: new Date(),
      updatedById: actorId || undefined,
    },
    include: MEMO_PAYLOAD_INCLUDE,
  })
}

export async function cancelMemo({ memoId, actorId = null }) {
  const memo = await loadOpenMemo(memoId)
  return prisma.memo.update({
    where: { id: memo.id },
    data: { status: 'CANCELLED', closedAt: new Date(), updatedById: actorId || undefined },
    include: MEMO_PAYLOAD_INCLUDE,
  })
}

export function toMemoPayload(memo, extra = {}) {
  const items = memo.items || []
  const outstandingPaise = memoOutstandingPaise(items)
  return {
    id: memo.id,
    memoNo: memo.memoNo,
    status: memo.status,
    isOverdue: isMemoOverdue(memo),
    issuedAt: memo.issuedAt,
    dueDate: memo.dueDate,
    closedAt: memo.closedAt,
    daysUntilDue: memoDaysUntilDue(memo),
    extensionCount: memo.extensionCount || 0,
    lastExtendedAt: memo.lastExtendedAt || null,
    canExtend: canCustomerExtendMemo(memo),
    extendWindowDays: MEMO_EXTEND_WINDOW_DAYS,
    currency: memo.currency,
    subtotalPaise: memo.subtotalPaise,
    formattedSubtotal: formatMemoMoney(memo.subtotalPaise, memo.currency),
    outstandingPaise,
    formattedOutstanding: formatMemoMoney(outstandingPaise, memo.currency),
    notes: memo.notes || '',
    shipTo: memo.shipTo || null,
    // Empty unless the caller included the relation; a memo that has never been
    // billed has none either way.
    orders: (memo.orders || []).map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
    })),
    items: items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      title: item.titleSnapshot,
      qty: item.qty,
      returnedQty: item.returnedQty,
      convertedQty: item.convertedQty,
      outQty: memoLineOutQty(item),
      status: item.status,
      pricePaise: item.pricePaise,
      formattedPrice: formatMemoMoney(item.pricePaise, memo.currency),
    })),
    ...extra,
  }
}
