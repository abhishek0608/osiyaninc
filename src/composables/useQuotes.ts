import { reactive, computed } from 'vue'
import type { CartItem, ProductCustomization } from './useCart'
import { getNextReferenceNumber } from './useReferenceNumbers'

const QUOTES_STORAGE_KEY = 'kiana-demo-quotes'

export interface QuoteItem {
  slug: string
  title: string
  price: string
  priceValue: number
  qty: number
  image?: string
  customization?: ProductCustomization | null
}

export interface Quote {
  id: string
  createdAt: string
  items: QuoteItem[]
  total: number
  formattedTotal: string
  status: 'pending' | 'reviewing' | 'quoted' | 'accepted'
  itemCount: number
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  state: string
  country: string
  pincode: string
}

type StoredQuote = Omit<Quote, 'itemCount'> & { itemCount?: number }

function loadStoredQuotes(): Quote[] {
  try {
    const raw = localStorage.getItem(QUOTES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredQuote[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((q) => ({
      ...q,
      itemCount: q.itemCount ?? q.items.reduce((s, i) => s + i.qty, 0),
    }))
  } catch {
    return []
  }
}

function saveQuotes() {
  try {
    localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes))
  } catch {
    // storage full or disabled
  }
}

const quotes = reactive<Quote[]>(loadStoredQuotes())

export function useQuotes() {
  const list = computed(() =>
    [...quotes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  )

  function addQuote(
    cartItems: CartItem[],
    total: number,
    customer: {
      name: string
      email: string
      phone: string
      address: string
      city: string
      state: string
      country: string
      pincode: string
    },
  ) {
    const items: QuoteItem[] = cartItems.map(({ product, qty, customization }) => ({
      slug: product.slug,
      title: product.title,
      price: product.price,
      priceValue: product.priceValue ?? (Number(String(product.price).replace(/[^\d]/g, '')) || 0),
      qty,
      image: product.images?.[0],
      customization: customization || null,
    }))
    const itemCount = items.reduce((s, i) => s + i.qty, 0)
    const quote: Quote = {
      id: getNextReferenceNumber('QTE', 'quotes'),
      createdAt: new Date().toISOString(),
      items,
      total,
      formattedTotal: '$' + total.toLocaleString('en-US'),
      status: 'pending',
      itemCount,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      country: customer.country,
      pincode: customer.pincode,
    }
    quotes.unshift(quote)
    saveQuotes()
    return quote
  }

  // Internal-workspace path: the team keys in line items by hand (title, unit
  // price, qty) instead of converting a cart, e.g. for phone/showroom enquiries.
  function addManualQuote(
    manualItems: { title: string; price: number; qty: number }[],
    customer: {
      name: string
      email: string
      phone: string
      address: string
      city: string
      state: string
      country: string
      pincode: string
    },
  ) {
    const items: QuoteItem[] = manualItems.map((item, index) => ({
      slug: `manual-${index}`,
      title: item.title,
      price: '$' + item.price.toLocaleString('en-US'),
      priceValue: item.price,
      qty: item.qty,
    }))
    const total = items.reduce((sum, item) => sum + item.priceValue * item.qty, 0)
    const itemCount = items.reduce((sum, item) => sum + item.qty, 0)
    const quote: Quote = {
      id: getNextReferenceNumber('QTE', 'quotes'),
      createdAt: new Date().toISOString(),
      items,
      total,
      formattedTotal: '$' + total.toLocaleString('en-US'),
      status: 'pending',
      itemCount,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      country: customer.country,
      pincode: customer.pincode,
    }
    quotes.unshift(quote)
    saveQuotes()
    return quote
  }

  return { quotes: list, addQuote, addManualQuote }
}
