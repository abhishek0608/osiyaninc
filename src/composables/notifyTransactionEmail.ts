import { API_BASE } from '../config-api'

export type OrderEmailItem = { title: string; qty: number; price: string }

export type OrderEmailPayload = {
  kind: 'order'
  orderId: string
  // 'terms' means the customer is approved to pay later; the due date and the
  // granted period ride along so the team sees them without a lookup.
  paymentTerm?: 'immediate' | 'terms'
  paymentDueDate?: string
  paymentTermDays?: number
  // For an 'immediate' order, whether the charge is confirmed settled. Absent
  // or 'pending' means the team must not treat the money as received yet.
  paymentSettlement?: 'settled' | 'pending'
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  state: string
  country: string
  pincode: string
  formattedTotal: string
  items: OrderEmailItem[]
}

export type ServiceEmailPayload = {
  kind: 'service'
  reference: string
  serviceTitle: string
  serviceNo: string
  customerName: string
  customerEmail: string
  customerPhone?: string
  rows: { label: string; value: string }[]
}

export type QuoteEmailPayload = {
  kind: 'quote'
  quoteId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  state: string
  country: string
  pincode: string
  formattedTotal: string
  items: (OrderEmailItem & { customization?: Record<string, string> | null })[]
}

export async function notifyTransaction(payload: OrderEmailPayload | ServiceEmailPayload | QuoteEmailPayload): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/notify-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.warn('[notify-transaction]', res.status, t)
    }
  } catch (e) {
    console.warn('[notify-transaction] request failed', e)
  }
}
