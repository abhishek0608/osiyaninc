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

export interface Order {
  id: string
  createdAt: string
  items: OrderItem[]
  total: number
  formattedTotal: string
  status: 'placed' | 'confirmed'
  itemCount: number
}

type StoredOrder = Omit<Order, 'itemCount'> & { itemCount?: number }

function loadStoredOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredOrder[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((o) => ({
      ...o,
      itemCount: o.itemCount ?? o.items.reduce((s, i) => s + i.qty, 0),
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

  function addOrder(cartItems: CartItem[], total: number) {
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
    }
    orders.unshift(order)
    saveOrders()
    return order
  }

  return { orders: list, addOrder }
}
