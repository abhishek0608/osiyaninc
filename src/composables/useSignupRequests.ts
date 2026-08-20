import { API_BASE } from '../config-api'

// Storefront sign-ups are approval-gated. The public form writes a
// SignupRequest (api/account.js, mode=signup) and no session is created; a Full
// Admin approves or rejects it from the internal workspace
// (api/internal.js, resource=signup-requests), and approval is what creates the
// account, its address and its company record.

export type SignupRequestStatus = 'pending' | 'approved' | 'rejected'

export const SIGNUP_REQUEST_STATUSES: SignupRequestStatus[] = ['pending', 'approved', 'rejected']

export interface SignupRequest {
  reference: string
  status: SignupRequestStatus
  firstName: string
  lastName: string
  name: string
  email: string
  phone: string
  companyName: string
  taxId: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  reviewNote: string
  reviewedAt: string | null
  reviewedBy?: string | null
  approvedUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface SignupRequestPage {
  requests: SignupRequest[]
  total: number
  pendingCount: number
  hasMore: boolean
}

// The fields an applicant must supply before their account can be approved.
export interface SignupRequestInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  companyName: string
  taxId: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  country?: string
  password: string
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string }
    return data?.message || fallback
  } catch {
    return fallback
  }
}

// Public storefront submission. Resolves with the recorded request — never with
// a session, since the account does not exist until an admin approves it.
export async function submitSignupRequest(
  input: SignupRequestInput,
): Promise<{ request: SignupRequest; message: string }> {
  const res = await fetch(`${API_BASE}/api/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'signup', ...input }),
  })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Unable to submit your sign-up request.'))
  }
  const data = (await res.json()) as { request: SignupRequest; message?: string }
  return {
    request: data.request,
    message: data.message || 'Your sign-up request is with our team for approval.',
  }
}

export async function fetchSignupRequests(
  userId: string,
  options: { status?: SignupRequestStatus | 'all'; search?: string; skip?: number } = {},
): Promise<SignupRequestPage> {
  const params = new URLSearchParams({ resource: 'signup-requests', userId })
  if (options.status && options.status !== 'all') params.set('status', options.status)
  if (options.search?.trim()) params.set('search', options.search.trim())
  if (options.skip) params.set('skip', String(options.skip))
  const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Unable to load sign-up requests.'))
  const data = (await res.json()) as SignupRequestPage
  return {
    requests: data.requests || [],
    total: data.total ?? 0,
    pendingCount: data.pendingCount ?? 0,
    hasMore: Boolean(data.hasMore),
  }
}

export async function fetchSignupRequest(userId: string, reference: string): Promise<SignupRequest> {
  const params = new URLSearchParams({ resource: 'signup-requests', userId, reference })
  const res = await fetch(`${API_BASE}/api/internal?${params.toString()}`)
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Unable to load the sign-up request.'))
  const data = (await res.json()) as { request: SignupRequest }
  return data.request
}

// Full Admin only — the API rejects everyone else with 403.
export async function reviewSignupRequest(
  userId: string,
  reference: string,
  action: 'approve' | 'reject',
  options: { note?: string; channel?: 'B2C' | 'B2B'; role?: 'customer' | 'internal' | 'admin' } = {},
): Promise<SignupRequest> {
  const res = await fetch(`${API_BASE}/api/internal?resource=signup-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, reference, action, ...options }),
  })
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(
        res,
        action === 'approve' ? 'Unable to approve this request.' : 'Unable to reject this request.',
      ),
    )
  }
  const data = (await res.json()) as { request: SignupRequest }
  return data.request
}
