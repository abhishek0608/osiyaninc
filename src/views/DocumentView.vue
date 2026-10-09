<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { productImageUrl } from '../composables/productImageUrl'
import { useAuth } from '../composables/useAuth'
import { useMemos, memoStatusLabel, type Memo } from '../composables/useMemos'
import { useMyOrders, orderPaymentLabel, type MyOrder } from '../composables/useMyOrders'

// Printable memo / invoice. This is the page behind every "Download PDF"
// button: a plain A4-shaped document with no site chrome (App.vue hides the
// header and footer on routes flagged `bare`), so the browser's own print
// dialog produces a clean PDF. Data comes from the same account endpoints the
// memo and order pages already use, so nothing new is exposed to the customer.

const COMPANY = {
  name: 'Osiyan Inc.',
  addressLines: ['580 5th Avenue, Suite 802', 'New York, NY 10036'],
  phone: '+91 87793 95590',
  email: 'info@osiyaninc.com',
  site: 'osiyaninc.com',
}

const route = useRoute()
const { isLoggedIn, user } = useAuth()
const memosApi = useMemos()
const ordersApi = useMyOrders()

const kind = computed<'memo' | 'invoice' | null>(() => {
  const value = String(route.params.kind || '').toLowerCase()
  return value === 'memo' || value === 'invoice' ? value : null
})
const id = computed(() => String(route.params.id || '').trim())

// Loads follow the route rather than the mount: moving between a memo and an
// invoice document reuses this component, so a mount-only load would leave the
// second kind on its skeleton forever.
watch(
  kind,
  (value) => {
    if (value === 'memo') void memosApi.load()
    else if (value === 'invoice') void ordersApi.load()
  },
  { immediate: true }
)

const settled = computed(() =>
  kind.value === 'memo' ? memosApi.settled.value : kind.value === 'invoice' ? ordersApi.settled.value : true
)
const loadError = computed(() =>
  kind.value === 'memo' ? memosApi.error.value : kind.value === 'invoice' ? ordersApi.error.value : ''
)

const memo = computed<Memo | null>(() =>
  kind.value === 'memo' ? memosApi.memos.value.find((m) => m.id === id.value || m.memoNo === id.value) || null : null
)
const order = computed<MyOrder | null>(() => (kind.value === 'invoice' ? ordersApi.findByOrderNo(id.value) : null))
const found = computed(() => Boolean(memo.value || order.value))

const currency = computed(() => memo.value?.currency || order.value?.currency || 'USD')

function money(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.value,
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

// --- What the document says -------------------------------------------------

const title = computed(() => (kind.value === 'memo' ? 'Memo' : 'Invoice'))

// The number the document is headed by. A converted memo's order carries a
// real invoice number; a checkout order has none, so its order number stands in.
const documentNo = computed(() => {
  if (memo.value) return memo.value.memoNo
  if (order.value) return order.value.invoice?.invoiceNo || order.value.orderNo
  return ''
})

interface MetaRow {
  label: string
  value: string
}

const metaRows = computed<MetaRow[]>(() => {
  if (memo.value) {
    const m = memo.value
    const rows: MetaRow[] = [
      { label: 'Memo no.', value: m.memoNo },
      { label: 'Issued', value: formatDate(m.issuedAt) },
      { label: 'Due back', value: formatDate(m.dueDate) },
      { label: 'Status', value: memoStatusLabel(m) },
    ]
    if (m.closedAt) rows.push({ label: 'Closed', value: formatDate(m.closedAt) })
    return rows
  }
  if (order.value) {
    const o = order.value
    const rows: MetaRow[] = []
    if (o.invoice) rows.push({ label: 'Invoice no.', value: o.invoice.invoiceNo })
    rows.push({ label: 'Order no.', value: o.orderNo })
    rows.push({ label: 'Date', value: formatDate(o.createdAt) })
    rows.push({ label: 'Payment', value: orderPaymentLabel(o) })
    if (o.memo) rows.push({ label: 'From memo', value: o.memo.memoNo })
    return rows
  }
  return []
})

interface DocLine {
  id: string
  image: string
  title: string
  qty: number
  unit: number
  amount: number
  /** Memo only: what has happened to the pieces since they went out. */
  note: string
}

const lines = computed<DocLine[]>(() => {
  if (memo.value) {
    return memo.value.items.map((item) => {
      const parts: string[] = []
      if (item.returnedQty) parts.push(`${item.returnedQty} returned`)
      if (item.convertedQty) parts.push(`${item.convertedQty} purchased`)
      if (item.returnRequestedQty) parts.push(`${item.returnRequestedQty} on the way back`)
      return {
        id: item.id,
        image: item.image || '',
        title: item.title,
        qty: item.qty,
        unit: item.pricePaise,
        amount: item.pricePaise * item.qty,
        note: parts.join(' · '),
      }
    })
  }
  if (order.value) {
    return order.value.items.map((item) => ({
      id: item.id,
      image: item.image || '',
      title: item.title,
      qty: item.qty,
      unit: item.priceUsd,
      amount: item.priceUsd * item.qty,
      note: '',
    }))
  }
  return []
})

const hasLineNotes = computed(() => lines.value.some((line) => line.note))

interface TotalRow {
  label: string
  value: string
  strong?: boolean
}

const totals = computed<TotalRow[]>(() => {
  if (memo.value) {
    const m = memo.value
    const rows: TotalRow[] = [{ label: 'Issued value', value: m.formattedSubtotal, strong: true }]
    if (m.outstandingPaise !== m.subtotalPaise) rows.push({ label: 'Still with you', value: m.formattedOutstanding })
    return rows
  }
  if (order.value) {
    const o = order.value
    const rows: TotalRow[] = [{ label: 'Subtotal', value: o.formattedSubtotal }]
    if (o.discountUsd > 0) rows.push({ label: 'Discount', value: `− ${o.formattedDiscount}` })
    if (o.taxUsd > 0) rows.push({ label: 'Tax', value: o.formattedTax })
    if (o.shippingUsd > 0) rows.push({ label: 'Shipping', value: o.formattedShipping })
    rows.push({ label: 'Total', value: o.formattedTotal, strong: true })
    return rows
  }
  return []
})

const billTo = computed(() => [user.value?.name, user.value?.email].filter((v): v is string => Boolean(v)))

// The ship-to snapshot has no fixed shape beyond these keys, so it renders as
// address lines rather than labeled fields — same as the memo page.
const shipToLines = computed(() => {
  const shipTo = memo.value?.shipTo || order.value?.shipTo
  if (!shipTo) return []
  const cityLine = [shipTo.city, shipTo.state, shipTo.pincode].filter(Boolean).join(', ')
  return [shipTo.name, shipTo.address, cityLine, shipTo.country, shipTo.phone, shipTo.email].filter(
    (line): line is string => Boolean(line)
  )
})

const notes = computed(() => memo.value?.notes || order.value?.notes || '')

const footerNote = computed(() => {
  if (memo.value) {
    const m = memo.value
    return (
      `The pieces listed remain the property of ${COMPANY.name} until purchased. ` +
      `Prices are locked at the values shown; anything you keep is invoiced at these prices. ` +
      `Please return any unpurchased pieces by ${formatDate(m.dueDate)}.`
    )
  }
  if (order.value) {
    const o = order.value
    if (o.paymentTerm === 'terms') {
      return `Payment of ${o.formattedTotal} is due by ${formatDate(o.termsDueDate)}. Thank you for your business.`
    }
    return o.paymentSettlement === 'settled'
      ? 'Paid in full. Thank you for your business.'
      : 'Payment is being confirmed by your payment provider. Thank you for your business.'
  }
  return ''
})

// --- Print ------------------------------------------------------------------

const ready = computed(() => settled.value && found.value)
const root = ref<HTMLElement | null>(null)

// The browser tab's title is what the print dialog suggests as the PDF's file
// name, so it is set to the document rather than the generic route title.
watch(
  ready,
  async (isReady) => {
    if (!isReady) return
    document.title = `${title.value} ${documentNo.value} · Osiyan`
    if (String(route.query.print || '') !== '1') return
    await nextTick()
    await waitForImages()
    window.print()
  },
  { immediate: true }
)

// Thumbnails come from S3; printing before they land leaves blank boxes. Wait
// for them, but never for long — a missing photo must not block the PDF.
async function waitForImages() {
  const images = Array.from(root.value?.querySelectorAll('img') || [])
  const pending = images
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
    )
  if (!pending.length) return
  await Promise.race([Promise.all(pending), new Promise<void>((resolve) => setTimeout(resolve, 2500))])
}

function print() {
  window.print()
}

const backLink = computed(() =>
  kind.value === 'memo' && memo.value ? { name: 'memo-detail', params: { id: memo.value.id } } : kind.value === 'memo' ? '/memos' : '/orders'
)
</script>

<template>
  <section class="doc-page ect-min-h-screen ect-bg-charcoal/5 ect-px-4 ect-py-6 sm:ect-py-10 print:ect-bg-white print:ect-p-0">
    <!-- Toolbar: screen only -->
    <nav class="ect-max-w-[800px] ect-mx-auto ect-mb-4 ect-flex ect-flex-wrap ect-items-center ect-justify-between ect-gap-3 print:ect-hidden">
      <RouterLink
        :to="backLink"
        class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-text-charcoal/70 hover:ect-text-gold-700 ect-transition-colors"
      >
        <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </RouterLink>
      <button
        v-if="ready"
        type="button"
        class="ect-inline-flex ect-items-center ect-gap-2 ect-px-4 ect-py-2.5 ect-rounded-xl ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-semibold hover:ect-bg-noir ect-transition-colors"
        @click="print"
      >
        <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Save as PDF
      </button>
    </nav>

    <!-- Signed out -->
    <article v-if="!isLoggedIn" class="doc-sheet ect-max-w-[800px] ect-mx-auto ect-bg-white ect-rounded-2xl ect-border ect-border-sand ect-p-8 sm:ect-p-10 ect-text-center">
      <h1 class="ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Sign in to see this {{ title.toLowerCase() }}</h1>
      <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-mb-8 ect-max-w-sm ect-mx-auto">Documents are tied to your account, so we need you signed in before showing one.</p>
      <RouterLink to="/login" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors">
        Sign In
      </RouterLink>
    </article>

    <!-- Loading -->
    <article v-else-if="!settled" class="doc-sheet ect-max-w-[800px] ect-mx-auto ect-bg-white ect-rounded-2xl ect-border ect-border-sand ect-p-8 sm:ect-p-10">
      <span class="ect-block ect-h-6 ect-w-40 ect-rounded ect-bg-charcoal/10 ect-animate-pulse ect-mb-6"></span>
      <span v-for="n in 4" :key="n" class="ect-block ect-h-4 ect-rounded ect-bg-charcoal/5 ect-animate-pulse ect-mb-3"></span>
    </article>

    <!-- Missing -->
    <article v-else-if="!found" class="doc-sheet ect-max-w-[800px] ect-mx-auto ect-bg-white ect-rounded-2xl ect-border ect-border-sand ect-p-8 sm:ect-p-10 ect-text-center">
      <h1 class="ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">{{ title }} not found</h1>
      <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-max-w-sm ect-mx-auto">
        {{ loadError || `We could not find a ${title.toLowerCase()} with that reference on your account.` }}
      </p>
    </article>

    <!-- The document -->
    <article
      v-else
      ref="root"
      class="doc-sheet ect-max-w-[800px] ect-mx-auto ect-bg-white ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-p-6 sm:ect-p-10 ect-text-charcoal print:ect-max-w-none print:ect-rounded-none print:ect-border-0 print:ect-shadow-none print:ect-p-0"
    >
      <!-- Letterhead -->
      <header class="ect-flex ect-flex-wrap ect-items-start ect-justify-between ect-gap-6 ect-pb-6 ect-border-b ect-border-charcoal/15">
        <div class="ect-min-w-0">
          <img src="/osiyan-logo.png" alt="Osiyan" class="ect-h-10 ect-w-auto ect-mb-3" />
          <p class="ect-font-body ect-text-sm ect-font-semibold">{{ COMPANY.name }}</p>
          <p v-for="line in COMPANY.addressLines" :key="line" class="ect-font-body ect-text-xs ect-text-charcoal/70">{{ line }}</p>
          <p class="ect-font-body ect-text-xs ect-text-charcoal/70">{{ COMPANY.phone }} · {{ COMPANY.email }}</p>
        </div>
        <div class="ect-text-right">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-1">{{ title }}</p>
          <h1 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-leading-none ect-mb-3">{{ documentNo }}</h1>
          <dl class="ect-m-0 ect-grid ect-grid-cols-[auto_auto] ect-gap-x-4 ect-gap-y-0.5 ect-justify-end">
            <template v-for="row in metaRows" :key="row.label">
              <dt class="ect-font-body ect-text-xs ect-text-charcoal/55 ect-text-left">{{ row.label }}</dt>
              <dd class="ect-m-0 ect-font-body ect-text-xs ect-font-medium">{{ row.value }}</dd>
            </template>
          </dl>
        </div>
      </header>

      <!-- Parties -->
      <section class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-6 ect-py-6">
        <div>
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1">{{ memo ? 'Issued to' : 'Bill to' }}</p>
          <p v-for="line in billTo" :key="line" class="ect-font-body ect-text-sm">{{ line }}</p>
          <p v-if="!billTo.length" class="ect-font-body ect-text-sm ect-text-charcoal/50">—</p>
        </div>
        <div v-if="shipToLines.length">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1">Ship to</p>
          <p v-for="line in shipToLines" :key="line" class="ect-font-body ect-text-sm">{{ line }}</p>
        </div>
      </section>

      <!-- Lines -->
      <table class="doc-table ect-w-full ect-border-collapse ect-font-body ect-text-sm">
        <thead>
          <tr class="ect-border-y ect-border-charcoal/15">
            <th class="ect-text-left ect-font-medium ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/55 ect-py-2.5 ect-pr-3" colspan="2">Piece</th>
            <th class="ect-text-right ect-font-medium ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/55 ect-py-2.5 ect-px-3">Qty</th>
            <th class="ect-text-right ect-font-medium ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/55 ect-py-2.5 ect-px-3">Unit price</th>
            <th class="ect-text-right ect-font-medium ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/55 ect-py-2.5 ect-pl-3">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in lines" :key="line.id" class="ect-border-b ect-border-charcoal/10 ect-align-top">
            <td class="ect-py-3 ect-pr-3 ect-w-12">
              <img
                v-if="line.image"
                :src="productImageUrl(line.image, 96)"
                :alt="line.title"
                class="ect-w-10 ect-h-10 ect-rounded-md ect-object-cover ect-border ect-border-sand"
              />
              <span v-else class="ect-block ect-w-10 ect-h-10 ect-rounded-md ect-bg-champagne/40 ect-border ect-border-sand"></span>
            </td>
            <td class="ect-py-3 ect-pr-3">
              <p class="ect-m-0">{{ line.title }}</p>
              <p v-if="line.note" class="ect-m-0 ect-text-xs ect-text-charcoal/55 ect-mt-0.5">{{ line.note }}</p>
            </td>
            <td class="ect-py-3 ect-px-3 ect-text-right ect-tabular-nums">{{ line.qty }}</td>
            <td class="ect-py-3 ect-px-3 ect-text-right ect-tabular-nums ect-whitespace-nowrap">{{ money(line.unit) }}</td>
            <td class="ect-py-3 ect-pl-3 ect-text-right ect-tabular-nums ect-whitespace-nowrap">{{ money(line.amount) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Totals -->
      <section class="ect-flex ect-justify-end ect-pt-4">
        <dl class="ect-m-0 ect-flex ect-flex-col ect-gap-1 ect-min-w-[260px]">
          <div
            v-for="row in totals"
            :key="row.label"
            class="ect-flex ect-justify-between ect-gap-8 ect-font-body ect-text-sm"
            :class="row.strong ? 'ect-font-semibold ect-pt-2 ect-mt-1 ect-border-t ect-border-charcoal/15' : ''"
          >
            <dt :class="row.strong ? '' : 'ect-text-charcoal/65'">{{ row.label }}</dt>
            <dd class="ect-m-0 ect-text-right ect-tabular-nums ect-whitespace-nowrap">{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <p v-if="hasLineNotes" class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-4 ect-mb-0">
        Issued value covers every piece on the memo as it went out; line notes show what has since been returned or purchased.
      </p>

      <!-- Notes & footer -->
      <section v-if="notes" class="ect-mt-6">
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1">Notes</p>
        <p class="ect-font-body ect-text-sm ect-whitespace-pre-line ect-m-0">{{ notes }}</p>
      </section>

      <footer class="ect-mt-8 ect-pt-4 ect-border-t ect-border-charcoal/15">
        <p class="ect-font-body ect-text-xs ect-text-charcoal/65 ect-m-0">{{ footerNote }}</p>
        <p class="ect-font-body ect-text-[11px] ect-text-charcoal/45 ect-mt-2 ect-mb-0">
          Questions about this {{ title.toLowerCase() }}? Write to {{ COMPANY.email }} quoting {{ documentNo }}. · {{ COMPANY.site }}
        </p>
      </footer>
    </article>
  </section>
</template>

<style>
/* Print rules live unscoped on purpose: @page cannot be scoped, and the page
   background belongs to the document, not to this component's root. */
@page {
  size: A4;
  margin: 14mm 14mm 16mm;
}

@media print {
  html,
  body {
    background: #fff !important;
  }

  .doc-page {
    min-height: 0;
  }

  .doc-sheet,
  .doc-sheet * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .doc-table tr {
    break-inside: avoid;
  }
}
</style>
