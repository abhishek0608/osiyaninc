import { randomBytes, scryptSync } from 'node:crypto'
import { prisma } from './db.js'

// Shared helpers for approval-gated storefront sign-ups.
//
// A visitor who signs up does not get an account: api/account.js (mode=signup)
// writes a SignupRequest row here, and only a Full Admin can approve it from
// the internal workspace (api/internal.js, resource=signup-requests). Approval
// is what creates the User — plus the address they entered and a CompanyAccount
// carrying the company name and tax ID — so nothing about the applicant is
// re-keyed by the team.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const SIGNUP_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED']

// Same salt:hash scrypt scheme as api/account.js, so the hash captured at
// signup works unchanged as the approved user's passwordHash.
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function toSignupRequestPayload(row) {
  return {
    reference: row.reference,
    status: String(row.status || 'PENDING').toLowerCase(),
    firstName: row.firstName,
    lastName: row.lastName,
    name: [row.firstName, row.lastName].filter(Boolean).join(' ').trim(),
    email: row.email,
    phone: row.phone,
    companyName: row.companyName,
    taxId: row.taxId,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2 || '',
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    reviewNote: row.reviewNote || '',
    reviewedAt: row.reviewedAt || null,
    approvedUserId: row.approvedUserId || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function trimmed(value, max) {
  return String(value ?? '').trim().slice(0, max)
}

// Every field on this list is required for approval, so the storefront form
// and any internal caller are held to the same validation.
function validateSignupInput(body) {
  const fields = {
    firstName: trimmed(body?.firstName, 60),
    lastName: trimmed(body?.lastName, 60),
    email: trimmed(body?.email, 254).toLowerCase(),
    phone: trimmed(body?.phone, 32),
    companyName: trimmed(body?.companyName, 160),
    taxId: trimmed(body?.taxId, 40),
    addressLine1: trimmed(body?.addressLine1, 160),
    addressLine2: trimmed(body?.addressLine2, 160),
    city: trimmed(body?.city, 80),
    state: trimmed(body?.state, 80),
    postalCode: trimmed(body?.postalCode, 20),
    country: trimmed(body?.country, 60) || 'IN',
  }

  if (!fields.firstName) return { error: 'First name is required.' }
  if (!fields.lastName) return { error: 'Last name is required.' }
  if (!EMAIL_PATTERN.test(fields.email)) return { error: 'A valid email address is required.' }
  if (fields.phone.replace(/\D/g, '').length < 7) return { error: 'A valid phone number is required.' }
  if (!fields.companyName) return { error: 'Company name is required.' }
  if (!fields.taxId) return { error: 'Tax ID is required.' }
  if (!fields.addressLine1) return { error: 'Address is required.' }
  if (!fields.city) return { error: 'City is required.' }
  if (!fields.state) return { error: 'State is required.' }
  if (!fields.postalCode) return { error: 'Postal code is required.' }

  return { fields }
}

// Persist a sign-up request. Public path, so everything is validated and
// length-capped here. The REQ-XXXXXX reference is allocated server-side with
// the same sequential unique-retry as service references.
export async function createSignupRequestRecord({ body }) {
  const { error, fields } = validateSignupInput(body)
  if (error) return { error }

  const password = String(body?.password || '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const existingUser = await prisma.user.findUnique({
    where: { email: fields.email },
    select: { id: true },
  })
  if (existingUser) {
    return { error: 'An account already exists for this email. Please sign in instead.' }
  }

  const pending = await prisma.signupRequest.findFirst({
    where: { email: fields.email, status: 'PENDING' },
    select: { reference: true },
  })
  if (pending) {
    return {
      error: `A sign-up request for this email (${pending.reference}) is already awaiting approval.`,
    }
  }

  let request = null
  let seq = (await prisma.signupRequest.count()) + 1
  for (let attempt = 0; attempt < 5 && !request; attempt += 1, seq += 1) {
    try {
      request = await prisma.signupRequest.create({
        data: {
          ...fields,
          reference: `REQ-${String(seq).padStart(6, '0')}`,
          addressLine2: fields.addressLine2 || undefined,
          passwordHash: hashPassword(password),
        },
      })
    } catch (err) {
      if (err?.code !== 'P2002') throw err
    }
  }
  if (!request) {
    return { error: 'Could not allocate a request reference. Please try again.' }
  }
  return { request }
}

// Approve a pending request: create the account the applicant asked for, in one
// transaction so a half-built customer can never be left behind.
//
//   User           — name/email/phone plus the password hash captured at signup
//   Address        — the address they entered, as their default shipping address
//   CompanyAccount — company name + tax ID (matched on tax ID so several people
//                    from one business land on the same account)
//   CompanyUser    — links the two
//
// `channel` and `role` default to a plain B2C customer; the approving admin can
// raise them, exactly like the manual "New user" form.
export async function approveSignupRequest({ reference, adminId, channel, role, note }) {
  const request = await prisma.signupRequest.findUnique({ where: { reference } })
  if (!request) return { error: 'Sign-up request not found.', status: 404 }
  if (request.status !== 'PENDING') {
    return { error: `This request was already ${request.status.toLowerCase()}.`, status: 409 }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: request.email },
    select: { id: true },
  })
  if (existingUser) {
    return { error: 'An account already exists for this email.', status: 409 }
  }

  const nextChannel = channel === 'B2B' ? 'B2B' : 'B2C'
  const nextRole = String(role || 'customer').toLowerCase()

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: request.email,
          firstName: request.firstName,
          lastName: request.lastName,
          phone: request.phone || undefined,
          passwordHash: request.passwordHash,
          channel: nextChannel,
          isInternal: nextRole === 'internal' || nextRole === 'admin',
          isAdmin: nextRole === 'admin',
          createdById: adminId,
          updatedById: adminId,
        },
        select: { id: true },
      })

      await tx.address.create({
        data: {
          customerId: created.id,
          type: 'shipping',
          line1: request.addressLine1,
          line2: request.addressLine2 || undefined,
          city: request.city,
          state: request.state,
          postalCode: request.postalCode,
          country: request.country,
        },
      })

      // gstin is the tax-ID column on CompanyAccount and is unique, so an
      // approved colleague from the same business reuses the existing account.
      const company =
        (await tx.companyAccount.findUnique({ where: { gstin: request.taxId } })) ||
        (await tx.companyAccount.create({
          data: {
            legalName: request.companyName,
            gstin: request.taxId,
            channel: nextChannel,
          },
        }))

      await tx.companyUser.create({
        data: { companyId: company.id, customerId: created.id, role: 'buyer' },
      })

      return tx.signupRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          reviewNote: trimmed(note, 500) || null,
          reviewedById: adminId,
          reviewedAt: new Date(),
          approvedUserId: created.id,
        },
      })
    })
    return { request: updated }
  } catch (err) {
    if (err?.code === 'P2002') {
      return { error: 'An account already exists for this email or phone.', status: 409 }
    }
    throw err
  }
}

export async function rejectSignupRequest({ reference, adminId, note }) {
  const request = await prisma.signupRequest.findUnique({ where: { reference } })
  if (!request) return { error: 'Sign-up request not found.', status: 404 }
  if (request.status !== 'PENDING') {
    return { error: `This request was already ${request.status.toLowerCase()}.`, status: 409 }
  }

  const updated = await prisma.signupRequest.update({
    where: { id: request.id },
    data: {
      status: 'REJECTED',
      reviewNote: trimmed(note, 500) || null,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  })
  return { request: updated }
}

// ---------------------------------------------------------------------------
// Notifications (Resend) — best effort. Nothing here may block a submission or
// an approval, so callers fire these without awaiting a successful send.
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderShell({ eyebrow, title, intro, bodyHtml = '', footer = '' }) {
  return `
    <div style="background:#f7efeb;padding:32px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #f0ddda;border-radius:24px;overflow:hidden;">
        <div style="padding:32px;">
          <p style="margin:0 0 10px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:0.18em;text-transform:uppercase;color:#c6536b;">${esc(eyebrow)}</p>
          <h1 style="margin:0 0 10px;font:400 28px/1.2 Georgia,'Times New Roman',serif;color:#2f2725;">${esc(title)}</h1>
          <p style="margin:0 0 22px;font:400 15px/1.7 Arial,sans-serif;color:#655854;">${esc(intro)}</p>
          ${bodyHtml}
          ${footer ? `<p style="margin:24px 0 0;font:400 13px/1.6 Arial,sans-serif;color:#7b6b66;">${esc(footer)}</p>` : ''}
        </div>
      </div>
    </div>`
}

function renderDetails(rows) {
  const body = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #f4e6e2;font:600 12px/1.4 Arial,sans-serif;color:#7b6b66;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">${esc(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #f4e6e2;font:400 14px/1.6 Arial,sans-serif;color:#2f2725;">${esc(value)}</td></tr>`,
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #f0ddda;border-radius:16px;overflow:hidden;background:#fffaf8;"><tbody>${body}</tbody></table>`
}

async function sendResend({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, skipped: true }
  const recipients = (Array.isArray(to) ? to : [to]).filter((value) => EMAIL_PATTERN.test(String(value || '').trim()))
  if (!recipients.length) return { ok: false, skipped: true }
  const from = String(process.env.RESEND_FROM || 'Kiana <onboarding@resend.dev>').trim()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: recipients, subject, html, text }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  return { ok: true }
}

function fullAddress(request) {
  return [
    request.addressLine1,
    request.addressLine2,
    `${request.city}, ${request.state} ${request.postalCode}`,
    request.country,
  ]
    .filter(Boolean)
    .join('\n')
}

function requestDetailRows(request) {
  return [
    ['Reference', request.reference],
    ['Name', [request.firstName, request.lastName].filter(Boolean).join(' ')],
    ['Email', request.email],
    ['Phone', request.phone],
    ['Company', request.companyName],
    ['Tax ID', request.taxId],
    ['Address', fullAddress(request).replace(/\n/g, ', ')],
  ]
}

// Applicant acknowledgement + internal alert, sent when a request is filed.
export async function notifySignupRequested(request) {
  const detail = renderDetails(requestDetailRows(request))
  const internalRecipients = String(process.env.NOTIFY_TO_EMAIL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const tasks = [
    sendResend({
      to: request.email,
      subject: `We received your sign-up request ${request.reference}`,
      html: renderShell({
        eyebrow: 'Sign-up received',
        title: 'Your request is with our team',
        intro:
          'Thank you for registering. An account manager reviews every new account, and you will hear from us as soon as yours is approved.',
        bodyHtml: detail,
        footer: 'You will not be able to sign in until the request is approved.',
      }),
      text: `We received your sign-up request ${request.reference}. Our team will review it and email you once your account is approved.`,
    }),
  ]
  if (internalRecipients.length) {
    tasks.push(
      sendResend({
        to: internalRecipients,
        subject: `New sign-up request ${request.reference} — ${request.companyName}`,
        html: renderShell({
          eyebrow: 'Approval needed',
          title: `${request.companyName} requested an account`,
          intro: 'A new sign-up request is waiting for a Full Admin to approve or reject it.',
          bodyHtml: detail,
        }),
        text: `New sign-up request ${request.reference} from ${request.companyName} (${request.email}) is awaiting approval.`,
      }),
    )
  }
  await Promise.allSettled(tasks)
}

// Applicant is told the outcome either way; a rejection carries the note the
// admin left, when there is one.
export async function notifySignupReviewed(request) {
  const approved = request.status === 'APPROVED'
  await sendResend({
    to: request.email,
    subject: approved
      ? 'Your account is approved'
      : `Your sign-up request ${request.reference} was not approved`,
    html: renderShell({
      eyebrow: approved ? 'Account approved' : 'Sign-up update',
      title: approved ? 'Welcome — you can sign in now' : 'We could not approve this request',
      intro: approved
        ? 'Your account has been approved. Sign in with the email and password you chose when you registered.'
        : 'Our team reviewed your sign-up request and was not able to approve it.',
      bodyHtml: request.reviewNote
        ? renderDetails([
            ['Reference', request.reference],
            ['Note from our team', request.reviewNote],
          ])
        : renderDetails([['Reference', request.reference]]),
      footer: approved ? '' : 'Reply to this email if you think this was a mistake.',
    }),
    text: approved
      ? `Your account (${request.reference}) is approved. Sign in with the email and password you chose at sign-up.`
      : `Your sign-up request ${request.reference} was not approved.${request.reviewNote ? ` Note: ${request.reviewNote}` : ''}`,
  })
}
