import { computed, ref, type Ref } from 'vue'

export type DiscountMode = 'amount' | 'percent'

/** What the internal API expects under `discount` on order-create / memo convert. */
export interface DiscountPayload {
  mode: DiscountMode
  value: number
}

/**
 * A staff discount being keyed in against a running subtotal. Mirrors the
 * server's resolveDiscountUsd: the form accepts a flat dollar amount or a
 * percent, but what gets sent (and stored) is only the resolved dollar figure
 * the server recomputes itself. All amounts are whole US dollars.
 */
export function useDiscountDraft(subtotal: Ref<number>) {
  const mode = ref<DiscountMode>('amount')
  const raw = ref('')

  const value = computed(() => {
    const n = Number(raw.value)
    return Number.isFinite(n) && n > 0 ? n : 0
  })

  const discount = computed(() => {
    if (!value.value) return 0
    if (mode.value === 'percent') return Math.round((subtotal.value * Math.min(value.value, 100)) / 100)
    return Math.round(value.value)
  })

  const total = computed(() => Math.max(subtotal.value - discount.value, 0))

  /** Human-readable problem with the current entry, or empty when it is fine. */
  const error = computed(() => {
    if (!value.value) return ''
    if (mode.value === 'percent' && value.value > 100) return 'A percentage discount cannot exceed 100%.'
    if (mode.value === 'amount' && value.value > subtotal.value) return 'The discount cannot exceed the subtotal.'
    return ''
  })

  /** Discount as a share of the subtotal, for the "(10.6%)" hint next to a flat amount. */
  const percentOfSubtotal = computed(() =>
    subtotal.value > 0 && discount.value > 0 ? (discount.value / subtotal.value) * 100 : 0,
  )

  const payload = computed<DiscountPayload | undefined>(() =>
    value.value > 0 ? { mode: mode.value, value: value.value } : undefined,
  )

  function reset() {
    mode.value = 'amount'
    raw.value = ''
  }

  return { mode, raw, value, discount, total, error, percentOfSubtotal, payload, reset }
}
