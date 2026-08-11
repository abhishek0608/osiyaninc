import { API_BASE } from '../config-api'
import type { ServiceOffering } from '../data/services-catalog'

// Service requests are persisted server-side (ServiceRequest table) so
// customer bookings reach the internal workspace from any browser. References
// (SER-XXXXXX) are allocated by the server and globally unique.

export interface ServiceRequestRow {
  label: string
  value: string
}

export type ServiceRequestStatus = 'new' | 'reviewing' | 'quoted'

export const SERVICE_REQUEST_STATUSES: ServiceRequestStatus[] = ['new', 'reviewing', 'quoted']

export interface ServiceRequest {
  reference: string
  serviceId: string
  serviceTitle: string
  serviceNo: string
  customerName: string
  customerEmail: string
  customerPhone: string
  createdAt: string
  status: ServiceRequestStatus
  rows: ServiceRequestRow[]
  inspirationImageUrl: string
  cadFileUrl: string
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string }
    return data?.message || fallback
  } catch {
    return fallback
  }
}

export interface CreateServiceRequestInput {
  service: ServiceOffering | null
  customerName: string
  customerEmail: string
  customerPhone?: string
  rows: ServiceRequestRow[]
  inspirationImageUrl?: string
  cadFileUrl?: string
}

function toCreateBody(input: CreateServiceRequestInput) {
  return {
    serviceId: input.service?.id || '',
    serviceTitle: input.service?.title || '',
    serviceNo: input.service?.no || '',
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone || '',
    rows: input.rows,
    inspirationImageUrl: input.inspirationImageUrl || '',
    cadFileUrl: input.cadFileUrl || '',
  }
}

// Storefront booking create (public). Throws with a user-readable message on
// failure — callers must not show a success state unless this resolves.
export async function createServiceRequest(input: CreateServiceRequestInput): Promise<ServiceRequest> {
  const res = await fetch(`${API_BASE}/api/account?mode=service-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toCreateBody(input)),
  })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Could not submit your request. Please try again.'))
  }
  const data = (await res.json()) as { request: ServiceRequest }
  return data.request
}

// Upload a booking attachment via a presigned S3 PUT and return its public
// URL. Returns null when uploads aren't configured on the server (HTTP 501) —
// the booking then proceeds with the filename only. Any other failure throws.
export async function uploadServiceFile(file: File, kind: 'image' | 'cad'): Promise<string | null> {
  const presignRes = await fetch(`${API_BASE}/api/account?mode=service-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, contentType: file.type || 'application/octet-stream', fileName: file.name }),
  })
  if (presignRes.status === 501) return null
  if (!presignRes.ok) {
    throw new Error(await readErrorMessage(presignRes, 'Could not upload your file. Please try again.'))
  }
  const { uploadUrl, publicUrl } = (await presignRes.json()) as { uploadUrl: string; publicUrl: string }
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': kind === 'cad' ? 'application/octet-stream' : file.type },
    body: file,
  })
  if (!putRes.ok) throw new Error('Could not upload your file. Please try again.')
  return publicUrl
}

// --- Internal workspace (require an internal userId) ------------------------

export async function fetchServiceRequests(userId: string): Promise<ServiceRequest[]> {
  const params = new URLSearchParams({ resource: 'services', userId })
  const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Could not load service requests.'))
  }
  const data = (await res.json()) as { requests: ServiceRequest[] }
  return Array.isArray(data.requests) ? data.requests : []
}

export async function fetchServiceRequest(
  userId: string,
  reference: string,
): Promise<ServiceRequest | null> {
  const params = new URLSearchParams({ resource: 'services', userId, reference })
  const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Could not load the service request.'))
  }
  const data = (await res.json()) as { request: ServiceRequest }
  return data.request
}

export async function updateServiceRequestStatus(
  userId: string,
  reference: string,
  status: ServiceRequestStatus,
): Promise<ServiceRequest> {
  const params = new URLSearchParams({ resource: 'services', userId })
  const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, status }),
  })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Could not update the status.'))
  }
  const data = (await res.json()) as { request: ServiceRequest }
  return data.request
}

// Manual entry from the workspace (phone / showroom bookings).
export async function createInternalServiceRequest(
  userId: string,
  input: CreateServiceRequestInput,
): Promise<ServiceRequest> {
  const params = new URLSearchParams({ resource: 'services', userId })
  const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toCreateBody(input)),
  })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Could not create the service request.'))
  }
  const data = (await res.json()) as { request: ServiceRequest }
  return data.request
}
