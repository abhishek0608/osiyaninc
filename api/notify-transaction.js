/**
 * POST /api/notify-transaction — sends transactional emails via Resend.
 *
 * Env (Vercel / server):
 *   RESEND_API_KEY   — required to send (https://resend.com)
 *   NOTIFY_TO_EMAIL  — inbox that receives order / booking alerts
 *   RESEND_FROM      — optional, default "Kiana Orders <onboarding@resend.dev>"
 *
 * Sends: (1) internal alert to NOTIFY_TO_EMAIL, (2) confirmation to customer when email present.
 * If RESEND_API_KEY is unset, returns 200 { sent: false } so checkout is never blocked.
 */
import { applyCors, handlePreflight } from '../server/api/cors.js'

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {}
  try {
    return JSON.parse(req.body || '{}')
  } catch {
    return {}
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

function parseRecipientList(input) {
  return String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(isValidEmail)
}

function renderEmailShell({ eyebrow = '', title, intro, bodyHtml, footer = '' }) {
  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 10px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:0.18em;text-transform:uppercase;color:#c6536b;">${eyebrow}</p>`
    : ''
  const footerHtml = footer
    ? `<p style="margin:24px 0 0;font:400 13px/1.6 Arial,sans-serif;color:#7b6b66;">${footer}</p>`
    : ''
  return `
    <div style="background:#f7efeb;padding:32px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #f0ddda;border-radius:24px;overflow:hidden;">
        <div style="padding:32px 32px 20px;">
          ${eyebrowHtml}
          <h1 style="margin:0 0 10px;font:400 30px/1.15 Georgia, 'Times New Roman', serif;color:#2f2725;">${title}</h1>
          <p style="margin:0 0 22px;font:400 15px/1.7 Arial,sans-serif;color:#655854;">${intro}</p>
          ${bodyHtml}
          ${footerHtml}
        </div>
      </div>
    </div>
  `
}

function renderDataTable(headers, rows) {
  const head = headers.map((header) => `<th style="padding:10px 12px;text-align:left;border-bottom:1px solid #ecd8d4;font:600 12px/1.4 Arial,sans-serif;color:#7b6b66;text-transform:uppercase;letter-spacing:0.08em;">${esc(header)}</th>`).join('')
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td style="padding:12px;border-bottom:1px solid #f4e6e2;font:400 14px/1.6 Arial,sans-serif;color:#2f2725;vertical-align:top;">${cell}</td>`
          )
          .join('')}</tr>`
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #f0ddda;border-radius:16px;overflow:hidden;background:#fffaf8;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

async function sendResend({ from, to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, skipped: true }

  const recipients = Array.isArray(to) ? to : [to]
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Resend ${res.status}: ${t}`)
  }
  return { ok: true }
}

export default async function handler(req, res) {
  const preflight = handlePreflight(req, res)
  if (preflight) return preflight
  applyCors(req, res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const body = parseBody(req)
  const kind = String(body.kind || '').trim()

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[notify-transaction] RESEND_API_KEY not set; skipping email.')
    return res.status(200).json({ sent: false, reason: 'no_api_key' })
  }

  const notifyTo = String(process.env.NOTIFY_TO_EMAIL || '').trim()
  const notifyRecipients = parseRecipientList(notifyTo)
  const from = String(process.env.RESEND_FROM || 'Kiana <onboarding@resend.dev>').trim()

  try {
    if (kind === 'order') {
      const orderId = esc(body.orderId)
      const customerName = esc(body.customerName)
      const customerEmail = String(body.customerEmail || '').trim()
      const customerEmailEsc = esc(customerEmail)
      const customerPhone = esc(body.customerPhone)
      const address = esc(body.address)
      const city = esc(body.city)
      const state = esc(body.state)
      const country = esc(body.country)
      const pincode = esc(body.pincode)
      const formattedTotal = esc(body.formattedTotal)
      const items = Array.isArray(body.items) ? body.items : []

      // Payment terms: the sale is done but the money is due later, so both the
      // team and the customer get the due date spelled out on the order email.
      const onTerms = body.paymentTerm === 'terms'
      const paymentDueDate = esc(body.paymentDueDate)
      const paymentTermDays = esc(String(body.paymentTermDays ?? ''))
      const paymentLabel = onTerms
        ? `Payment terms${paymentTermDays ? ` · Net ${paymentTermDays}` : ''}${paymentDueDate ? ` · due ${paymentDueDate}` : ''}`
        : 'Paid immediately'
      const paymentLine = `<br><strong>Payment:</strong> ${paymentLabel}`
      const paymentTextLine = onTerms
        ? `Payment: terms${body.paymentTermDays ? ` (Net ${body.paymentTermDays})` : ''}${body.paymentDueDate ? `, due ${body.paymentDueDate}` : ''}`
        : 'Payment: immediate'

      const itemTable = renderDataTable(
        ['Item', 'Qty', 'Price'],
        items.map((item) => [
          esc(item.title),
          esc(String(item.qty ?? '')),
          esc(item.price),
        ])
      )
      const internalHtml = renderEmailShell({
        eyebrow: 'New Order',
        title: `Order ${orderId}`,
        intro: `A new order has been placed for ${formattedTotal}.`,
        bodyHtml: `
          <div style="margin:0 0 18px;padding:16px 18px;border-radius:18px;background:#fbf5f3;">
            <p style="margin:0 0 8px;font:600 13px/1.5 Arial,sans-serif;color:#7b6b66;text-transform:uppercase;letter-spacing:0.08em;">Customer</p>
            <p style="margin:0;font:400 14px/1.7 Arial,sans-serif;color:#2f2725;">${customerName}<br>${customerEmailEsc}<br>${customerPhone}</p>
          </div>
          <div style="margin:0 0 18px;padding:16px 18px;border-radius:18px;background:#fbf5f3;">
            <p style="margin:0 0 8px;font:600 13px/1.5 Arial,sans-serif;color:#7b6b66;text-transform:uppercase;letter-spacing:0.08em;">Shipping</p>
            <p style="margin:0;font:400 14px/1.7 Arial,sans-serif;color:#2f2725;">${address}<br>${city}, ${state} ${pincode}<br>${country}</p>
          </div>
          <div style="margin:0 0 18px;padding:16px 18px;border-radius:18px;background:#fbf5f3;">
            <p style="margin:0;font:400 14px/1.7 Arial,sans-serif;color:#2f2725;"><strong>Total:</strong> ${formattedTotal}${paymentLine}</p>
          </div>
          ${itemTable}
        `,
      })
      const internalText = `New order ${orderId}\nTotal: ${formattedTotal}\n${paymentTextLine}\nCustomer: ${customerName} | ${customerEmail} | ${customerPhone}\nShipping: ${body.address}, ${body.city}, ${body.state} ${body.pincode}, ${body.country}`

      const customerHtml = renderEmailShell({
        eyebrow: 'Order Confirmed',
        title: `We received your order ${orderId}`,
        intro: `Thank you for shopping with Kiana. We've received your order for ${formattedTotal} and our team will begin processing it shortly.`,
        bodyHtml: `
          <div style="margin:0 0 18px;padding:16px 18px;border-radius:18px;background:#fbf5f3;">
            <p style="margin:0;font:400 14px/1.7 Arial,sans-serif;color:#2f2725;"><strong>Order Number:</strong> ${orderId}<br><strong>Total:</strong> ${formattedTotal}${paymentLine}</p>
          </div>
          ${itemTable}
        `,
        footer: 'If you did not place this order, you can safely ignore this message.',
      })
      const customerText = `Hi ${body.customerName || ''},\n\nWe received your order ${body.orderId || ''} for ${body.formattedTotal || ''}. We'll process it shortly.\n${paymentTextLine}\n`

      const tasks = []
      if (notifyRecipients.length) {
        tasks.push(
          sendResend({
            from,
            to: notifyRecipients,
            subject: `New order ${orderId}`,
            html: internalHtml,
            text: internalText,
            replyTo: isValidEmail(customerEmail) ? customerEmail : undefined,
          })
        )
      }

      if (isValidEmail(customerEmail)) {
        tasks.push(
          sendResend({
            from,
            to: customerEmail,
            subject: `We received your order ${orderId}`,
            html: customerHtml,
            text: customerText,
          })
        )
      }

      await Promise.all(tasks)
      return res.status(200).json({ sent: tasks.length > 0 })
    }

    if (kind === 'service') {
      const reference = esc(body.reference)
      const serviceTitle = esc(body.serviceTitle)
      const serviceNo = esc(body.serviceNo)
      const customerEmail = String(body.customerEmail || '').trim()
      const customerName = esc(body.customerName)
      const customerPhone = esc(body.customerPhone)
      const rowItems = Array.isArray(body.rows) ? body.rows : []
      const detailsTable = renderDataTable(
        ['Field', 'Value'],
        rowItems.map((row) => [esc(row.label), esc(row.value)])
      )

      const internalHtml = renderEmailShell({
        eyebrow: 'Service Booking',
        title: `Request ${reference}`,
        intro: `A new ${serviceTitle} request has been submitted.`,
        bodyHtml: `
          <div style="margin:0 0 18px;padding:16px 18px;border-radius:18px;background:#fbf5f3;">
            <p style="margin:0;font:400 14px/1.7 Arial,sans-serif;color:#2f2725;"><strong>Reference:</strong> ${reference}<br><strong>Service:</strong> ${serviceNo} ${serviceTitle}<br><strong>Customer:</strong> ${customerName}<br><strong>Email:</strong> ${esc(customerEmail)}${customerPhone ? `<br><strong>Phone:</strong> ${customerPhone}` : ''}</p>
          </div>
          ${detailsTable}
        `,
      })
      const internalText = `Service booking ${reference}\nService: ${body.serviceNo || ''} ${body.serviceTitle || ''}\nCustomer: ${body.customerName || ''} | ${customerEmail}${body.customerPhone ? ` | ${body.customerPhone}` : ''}`

      const customerHtml = renderEmailShell({
        eyebrow: 'Booking Confirmed',
        title: `We received your request ${reference}`,
        intro: `Thank you for booking ${serviceTitle}. Our team will review your request and contact you shortly to confirm the next steps.`,
        bodyHtml: `
          <div style="margin:0 0 18px;padding:16px 18px;border-radius:18px;background:#fbf5f3;">
            <p style="margin:0;font:400 14px/1.7 Arial,sans-serif;color:#2f2725;"><strong>Reference:</strong> ${reference}<br><strong>Service:</strong> ${serviceNo} ${serviceTitle}</p>
          </div>
          ${detailsTable}
        `,
        footer: 'Keep this reference handy if you need to speak with our team about your booking.',
      })
      const customerText = `Hi ${body.customerName || ''},\n\nWe received your service request ${body.reference || ''} for ${body.serviceTitle || ''}. Our team will contact you shortly.\n`

      const tasks = []
      if (notifyRecipients.length) {
        tasks.push(
          sendResend({
            from,
            to: notifyRecipients,
            subject: `Service booking ${reference}`,
            html: internalHtml,
            text: internalText,
            replyTo: isValidEmail(customerEmail) ? customerEmail : undefined,
          })
        )
      }

      if (isValidEmail(customerEmail)) {
        tasks.push(
          sendResend({
            from,
            to: customerEmail,
            subject: `We received your request ${reference}`,
            html: customerHtml,
            text: customerText,
          })
        )
      }

      await Promise.all(tasks)
      return res.status(200).json({ sent: tasks.length > 0 })
    }

    return res.status(400).json({ message: 'Invalid kind. Use "order" or "service".' })
  } catch (err) {
    console.error('[notify-transaction]', err)
    return res.status(500).json({ message: err.message || 'Failed to send email' })
  }
}
