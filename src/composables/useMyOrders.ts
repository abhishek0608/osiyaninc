import { computed, ref, watch } from 'vue'
import { API_BASE } from '../config-api'
import { useAuth } from './useAuth'

// Orders are written to the database by checkout itself (server/api/checkout.js
// opens one before the card is ever charged), so the account pages read them
// back from there. Nothing about an order is cached across sessions — the
// browser is not the record, the database is.

export interface MyOrderItem {
  id: string
  title: string
  slug: string
  image: string
  qty: number
  priceUsd: number
  formattedPrice: string
}

export interface MyOrder {
  id: string
  orderNo: string
  /** Prisma OrderStatus: PENDING, CONFIRMED, FULFILLED, CANCELLED. */
  status: string
  createdAt: string
  itemCount: number
  subtotalUsd: number
  discountUsd: number
  totalUsd: number
  currency: string
  formattedTotal: string
  paymentTerm: 'immediate' | 'terms'
  /** Only meaningful for immediate orders; a terms order was never charged. */
  paymentSettlement: 'settled' | 'pending'
  termsDays: number | null
  termsDueDate: string | null
  notes: string
  shipTo: Record<string, string> | null
  /** Set when the order came out of a memo — the pieces were already with them. */
  memo: { id: string; memoNo: string } | null
  items: MyOrderItem[]
}

const orders = ref<MyOrder[]>([])
const loading = ref(false)
// Whether we know what this account has ordered yet — see useMemos for why
// `loading` alone cannot answer that. Signed out counts as settled.
const settled = ref(false)
const error = ref('')
// Which account these orders belong to, so a sign-out never leaves one
// customer looking at another's purchases.
let loadedForUserId = ''
let authWatchBound = false

function reset() {
  orders.value = []
  settled.value = false
  error.value = ''
  loadedForUserId = ''
}

export function useMyOrders() {
  const { user } = useAuth()

  async function load(force = false) {
    const userId = user.value?.id || ''
    if (!userId) {
      reset()
      settled.value = true
      return
    }
    if (loading.value) return
    if (!force && loadedForUserId === userId) return

    loading.value = true
    error.value = ''
    try {
      const res = await fetch(
        `${API_BASE}/api/account?mode=orders&userId=${encodeURIComponent(userId)}`,
        { method: 'GET' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Unable to load your orders.')
      orders.value = Array.isArray(data.orders) ? data.orders : []
      loadedForUserId = userId
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unable to load your orders.'
    } finally {
      loading.value = false
      settled.value = true
    }
  }

  if (!authWatchBound) {
    authWatchBound = true
    watch(
      () => user.value?.id || '',
      (id) => {
        if (id !== loadedForUserId) reset()
      }
    )
  }

  function findByOrderNo(orderNo: string) {
    const wanted = String(orderNo || '').trim()
    if (!wanted) return null
    return orders.value.find((order) => order.orderNo === wanted || order.id === wanted) || null
  }

  return {
    orders: computed(() => orders.value),
    loading: computed(() => loading.value),
    settled: computed(() => settled.value),
    error: computed(() => error.value),
    load,
    refresh: () => load(true),
    findByOrderNo,
  }
}

/** Human label for a Prisma OrderStatus. */
export function orderStatusLabel(order: MyOrder) {
  if (order.status === 'CANCELLED') return 'Cancelled'
  if (order.status === 'FULFILLED') return 'Delivered'
  if (order.status === 'CONFIRMED') return 'Confirmed'
  return 'Placed'
}

/** Payment note beside the status: what is owed, and by when. */
export function orderPaymentLabel(order: MyOrder) {
  if (order.paymentTerm === 'terms') {
    const net = order.termsDays ? `Net ${order.termsDays}` : 'Payment terms'
    if (!order.termsDueDate) return net
    const due = new Date(order.termsDueDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return `${net} · due ${due}`
  }
  return order.paymentSettlement === 'settled' ? 'Paid' : 'Payment confirming'
}
