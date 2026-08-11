import { prisma } from './db.js'

// Shared helpers for craft-service bookings (CAD / wax / casting / finishing).
// Used by api/account.js (public storefront create + upload presign) and
// api/internal.js (workspace list/detail/status/manual create).

const SERVICE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const SERVICE_REQUEST_STATUSES = ['NEW', 'REVIEWING', 'QUOTED']

export function toServiceRequestPayload(row) {
  return {
    reference: row.reference,
    serviceId: row.serviceId,
    serviceTitle: row.serviceTitle,
    serviceNo: row.serviceNo || '',
    status: String(row.status || 'NEW').toLowerCase(),
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone || '',
    rows: Array.isArray(row.rows) ? row.rows : [],
    inspirationImageUrl: row.inspirationImageUrl || '',
    cadFileUrl: row.cadFileUrl || '',
    createdAt: row.createdAt,
  }
}

function normalizeServiceRows(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((row) => ({
      label: String(row?.label || '').trim().slice(0, 80),
      value: String(row?.value || '').trim().slice(0, 2000),
    }))
    .filter((row) => row.label && row.value)
    .slice(0, 60)
}

// Persist a booking. The storefront path is public — the booking modal doesn't
// require sign-in — so everything is validated and length-capped here. The
// SER-XXXXXX reference is allocated server-side (sequential, unique-retry like
// order numbers) so it can't collide across browsers.
export async function createServiceRequestRecord({ body, createdById = null }) {
  const serviceId = String(body?.serviceId || '').trim().slice(0, 40)
  const serviceTitle = String(body?.serviceTitle || '').trim().slice(0, 120)
  const serviceNo = String(body?.serviceNo || '').trim().slice(0, 10)
  const customerName = String(body?.customerName || '').trim().slice(0, 120)
  const customerEmail = String(body?.customerEmail || '').trim().toLowerCase().slice(0, 254)
  const customerPhone = String(body?.customerPhone || '').trim().slice(0, 32)
  const inspirationImageUrl = String(body?.inspirationImageUrl || '').trim().slice(0, 500)
  const cadFileUrl = String(body?.cadFileUrl || '').trim().slice(0, 500)
  const rows = normalizeServiceRows(body?.rows)

  if (!serviceId || !serviceTitle) return { error: 'Service is required.' }
  if (!customerName) return { error: 'Customer name is required.' }
  if (!SERVICE_EMAIL_PATTERN.test(customerEmail)) return { error: 'A valid customer email is required.' }

  let request = null
  let seq = (await prisma.serviceRequest.count()) + 1
  for (let attempt = 0; attempt < 5 && !request; attempt += 1, seq += 1) {
    try {
      request = await prisma.serviceRequest.create({
        data: {
          reference: `SER-${String(seq).padStart(6, '0')}`,
          serviceId,
          serviceTitle,
          serviceNo: serviceNo || undefined,
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          rows,
          inspirationImageUrl: inspirationImageUrl || undefined,
          cadFileUrl: cadFileUrl || undefined,
          createdById: createdById || undefined,
          updatedById: createdById || undefined,
        },
      })
    } catch (err) {
      if (err?.code !== 'P2002') throw err
    }
  }
  if (!request) return { error: 'Could not allocate a service reference. Please try again.' }
  return { request }
}
