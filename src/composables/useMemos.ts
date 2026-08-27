import { computed, ref, watch } from 'vue'
import { API_BASE } from '../config-api'
import { useAuth } from './useAuth'
import { invalidateMyOrders } from './useMyOrders'

// A memo is jewellery the customer is holding on consignment — the pieces are
// with them, but nothing has been charged and the goods stay ours until they
// buy or return them. Unlike orders (which this storefront keeps in local
// storage), memos are raised and closed server-side, so they are always read
// fresh from the account API rather than cached across sessions.

export type MemoStatus = 'ISSUED' | 'PARTIAL' | 'CONVERTED' | 'RETURNED' | 'CANCELLED'
export type MemoItemStatus = 'OUT' | 'RETURNED' | 'CONVERTED'

export interface MemoItem {
  id: string
  variantId: string
  title: string
  qty: number
  returnedQty: number
  convertedQty: number
  outQty: number
  status: MemoItemStatus
  pricePaise: number
  formattedPrice: string
}

export interface Memo {
  id: string
  memoNo: string
  status: MemoStatus
  isOverdue: boolean
  issuedAt: string
  dueDate: string
  closedAt: string | null
  daysUntilDue: number
  extensionCount: number
  lastExtendedAt: string | null
  /** Server's verdict on the self-service extension; the UI mirrors it, never decides it. */
  canExtend: boolean
  extendWindowDays: number
  currency: string
  formattedSubtotal: string
  outstandingPaise: number
  formattedOutstanding: string
  notes: string
  shipTo: Record<string, string> | null
  /** Every order billed off this memo, oldest first; empty until one is. */
  orders: { id: string; orderNo: string; status: string }[]
  items: MemoItem[]
}

export interface MemoAllowance {
  canMemo: boolean
  memoDays: number
  formattedLimit: string | null
  formattedOutstanding: string
  formattedAvailable: string | null
}

const memos = ref<Memo[]>([])
const allowance = ref<MemoAllowance | null>(null)
const loading = ref(false)
// Whether we know what this account holds yet. `loading` alone cannot answer
// that: views mount before their onMounted fetch starts, so an unsettled page
// would flash "nothing on memo" for a frame before the request is even sent.
// Signed out counts as settled — there is nothing to wait for.
const settled = ref(false)
const error = ref('')
// Which memo is mid-extension, so only that card shows a spinner.
const extendingId = ref('')
const extendError = ref('')
const extendMessage = ref('')
// Same again for a purchase in flight.
const convertingId = ref('')
const convertError = ref('')
const convertMessage = ref('')
// Which account the loaded memos belong to, so a sign-out (or a different
// sign-in) never leaves one customer looking at another's consignment.
let loadedForUserId = ''
let authWatchBound = false

function reset() {
  memos.value = []
  allowance.value = null
  settled.value = false
  error.value = ''
  extendError.value = ''
  extendMessage.value = ''
  extendingId.value = ''
  convertError.value = ''
  convertMessage.value = ''
  convertingId.value = ''
  loadedForUserId = ''
}

export function useMemos() {
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
        `${API_BASE}/api/account?mode=memos&userId=${encodeURIComponent(userId)}`,
        { method: 'GET' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Unable to load your memos.')
      memos.value = Array.isArray(data.memos) ? data.memos : []
      allowance.value = {
        canMemo: Boolean(data.canMemo),
        memoDays: Number(data.memoDays) || 30,
        formattedLimit: data.formattedLimit ?? null,
        formattedOutstanding: data.formattedOutstanding || '',
        formattedAvailable: data.formattedAvailable ?? null,
      }
      loadedForUserId = userId
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unable to load your memos.'
    } finally {
      loading.value = false
      // Settled either way: a failed load has an error to show, not a spinner
      // to keep spinning.
      settled.value = true
    }
  }

  // Push a memo's due date out. The window and the one-extension cap are the
  // server's call — this just reports what it says.
  async function extend(memoId: string) {
    const userId = user.value?.id || ''
    if (!userId || !memoId || extendingId.value) return false
    extendingId.value = memoId
    extendError.value = ''
    extendMessage.value = ''
    try {
      const res = await fetch(`${API_BASE}/api/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'memo-extend', userId, memoId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Unable to extend this memo.')
      const updated = data.memo as Memo
      const index = memos.value.findIndex((memo) => memo.id === updated.id)
      if (index >= 0) memos.value[index] = { ...memos.value[index], ...updated }
      extendMessage.value = `Memo ${updated.memoNo} is now due ${new Date(updated.dueDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}.`
      return true
    } catch (e) {
      extendError.value = e instanceof Error ? e.message : 'Unable to extend this memo.'
      return false
    } finally {
      extendingId.value = ''
    }
  }

  // Buy some (or all) of what is still out. The server converts those lines to
  // a confirmed order at the memo's locked prices and reports the order number.
  async function convert(memoId: string, lines: { memoItemId: string; qty: number }[] | null = null) {
    const userId = user.value?.id || ''
    if (!userId || !memoId || convertingId.value) return false
    convertingId.value = memoId
    convertError.value = ''
    convertMessage.value = ''
    try {
      const res = await fetch(`${API_BASE}/api/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'memo-convert', userId, memoId, lines: lines || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Unable to complete this purchase.')
      const updated = data.memo as Memo
      const index = memos.value.findIndex((memo) => memo.id === updated.id)
      if (index >= 0) memos.value[index] = { ...memos.value[index], ...updated }
      convertMessage.value = data.order?.orderNo
        ? `Purchase confirmed — order ${data.order.orderNo} covers the pieces you kept.`
        : 'Purchase confirmed.'
      // The conversion just wrote an order the cached list has never seen.
      invalidateMyOrders()
      return true
    } catch (e) {
      convertError.value = e instanceof Error ? e.message : 'Unable to complete this purchase.'
      return false
    } finally {
      convertingId.value = ''
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

  // Open memos first (those are the ones still needing a decision), newest
  // issue date first within each group.
  const list = computed(() =>
    [...memos.value].sort((a, b) => {
      const aOpen = isOpenMemo(a) ? 0 : 1
      const bOpen = isOpenMemo(b) ? 0 : 1
      if (aOpen !== bOpen) return aOpen - bOpen
      return new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
    })
  )

  const openCount = computed(() => memos.value.filter(isOpenMemo).length)

  return {
    memos: list,
    allowance: computed(() => allowance.value),
    openCount,
    loading: computed(() => loading.value),
    settled: computed(() => settled.value),
    error: computed(() => error.value),
    extendingId: computed(() => extendingId.value),
    extendError: computed(() => extendError.value),
    extendMessage: computed(() => extendMessage.value),
    convertingId: computed(() => convertingId.value),
    convertError: computed(() => convertError.value),
    convertMessage: computed(() => convertMessage.value),
    load,
    refresh: () => load(true),
    extend,
    convert,
  }
}

export function isOpenMemo(memo: Memo) {
  return memo.status === 'ISSUED' || memo.status === 'PARTIAL'
}

/** Days left before the memo is due; negative once it is overdue. */
export function memoDaysUntilDue(memo: Memo) {
  return Math.ceil((new Date(memo.dueDate).getTime() - Date.now()) / 86400000)
}

/**
 * Why the extend button is unavailable, for the hint under it. Empty when the
 * memo can be extended (or when extending was never on the table — a closed
 * memo shows no button at all).
 */
export function memoExtendHint(memo: Memo) {
  if (!isOpenMemo(memo) || memo.canExtend) return ''
  if (memo.extensionCount > 0) return 'Already extended once — contact us to keep these longer.'
  if (memo.isOverdue) return 'Past due — contact us and we will sort out more time.'
  const days = memoDaysUntilDue(memo)
  const window = memo.extendWindowDays || 3
  return `You can extend in the last ${window} days — ${days} ${days === 1 ? 'day' : 'days'} to go.`
}

/** Human label for how long a memo has left, or how far past due it is. */
export function memoDueLabel(memo: Memo) {
  if (!isOpenMemo(memo)) return ''
  const days = memoDaysUntilDue(memo)
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

export function memoStatusLabel(memo: Memo) {
  if (memo.isOverdue) return 'Overdue'
  if (memo.status === 'ISSUED') return 'With you'
  if (memo.status === 'PARTIAL') return 'Partly closed'
  if (memo.status === 'CONVERTED') return 'Purchased'
  if (memo.status === 'RETURNED') return 'Returned'
  return 'Cancelled'
}
