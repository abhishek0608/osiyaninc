import { reactive, computed } from 'vue'
import type { CartItem, ProductCustomization } from './useCart'
import { getNextReferenceNumber } from './useReferenceNumbers'

const ORDERS_STORAGE_KEY = 'osiyan-orders-v1'

export interface OrderItem {
  slug: string
  title: string
  price: string
  priceValue: number
  qty: number
  image?: string
  customization?: ProductCustomization | null
}

// How the customer chose to settle the order at checkout. 'terms' is only
// offered to accounts an admin has approved for it (User.canPayTerms).
export type PaymentTerm = 'immediate' | 'terms'

export interface OrderPayment {
  term: PaymentTerm
  // Days granted at the time of the order, snapshotted so a later change to the
  // customer's allowance does not move an existing due date.
  termDays?: number
  dueDate?: string
}

export interface Order {
  id: string
  createdAt: string
  items: OrderItem[]
  total: number
  formattedTotal: string
  status: 'placed' | 'confirmed'
  itemCount: number
  payment: OrderPayment
}

type StoredOrder = Omit<Order, 'itemCount' | 'payment'> & {
  itemCount?: number
  payment?: OrderPayment
}

function loadStoredOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredOrder[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((o) => ({
      ...o,
      itemCount: o.itemCount ?? o.items.reduce((s, i) => s + i.qty, 0),
      // Orders placed before payment terms existed were all paid up front.
      payment: o.payment ?? { term: 'immediate' },
    }))
  } catch {
    return []
  }
}

function saveOrders() {
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders))
  } catch {
    // storage full or disabled
  }
}

function generateId(): string {
  return getNextReferenceNumber('ORD', 'orders')
}

const orders = reactive<Order[]>(loadStoredOrders())

export function useOrders() {
  const list = computed(() => [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))

  function addOrder(cartItems: CartItem[], total: number, payment: OrderPayment = { term: 'immediate' }) {
    const items: OrderItem[] = cartItems.map(({ product, qty, customization }) => ({
      slug: product.slug,
      title: product.title,
      price: product.price,
      priceValue: product.priceValue ?? (Number(String(product.price).replace(/[^\d]/g, '')) || 0),
      qty,
      image: product.images?.[0],
      customization: customization || null,
    }))
    const itemCount = items.reduce((s, i) => s + i.qty, 0)
    const order: Order = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      items,
      total,
      formattedTotal: '$' + total.toLocaleString('en-US'),
      status: 'placed',
      itemCount,
      payment,
    }
    orders.unshift(order)
    saveOrders()
    return order
  }

  return { orders: list, addOrder }
}
