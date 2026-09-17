<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'
import {
  PACKING_LIST_COLUMNS,
  colorLabel,
  formatKtCol,
  gridToImportRows,
  piecesToGrid,
  type ImportRow,
} from '../data/packingList'

const { user, isInternalUser } = useAuth()

// The upload is the supplier's packing list as-is: one row per BAG NO, extra
// stone lines on continuation rows, D/F/C stone columns, Kt/Col for the metal.
// Column matching, the Kt/Col split and the Type → category mapping live in
// data/packingList.ts, shared with the export so the two stay symmetrical.
const BATCH_SIZE = 25

const fileName = ref('')
const rows = ref<ImportRow[]>([])
const parseError = ref('')
const mode = ref<'skip' | 'overwrite'>('skip')

const importing = ref(false)
const progress = ref({ done: 0, total: 0 })
const summary = ref<Record<string, number> | null>(null)
const results = ref<{ slug: string; status: string; message: string }[]>([])

// --- CSV parsing (RFC-4180-ish: quotes, escaped "", CRLF/LF) ---
function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v.trim() !== '')) out.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((v) => v.trim() !== '')) out.push(row)
  }
  return out
}

function bool(value: string | undefined, fallback = false): boolean {
  const v = String(value || '').trim().toLowerCase()
  if (v === '') return fallback
  return ['true', '1', 'yes', 'y'].includes(v)
}

// Turn a parsed 2D grid into validated piece rows. Shared by the CSV and
// spreadsheet (.xls/.xlsx) code paths.
function gridToRows(grid: string[][]): boolean {
  const parsed = gridToImportRows(grid)
  if (!parsed) {
    parseError.value =
      'Could not find the header row. The sheet needs a BAG NO column (plus Style No, Type and Kt/Col). Download the template to see the layout.'
    rows.value = []
    return false
  }
  if (!parsed.rows.length) {
    parseError.value = 'File has no piece rows under the header.'
    rows.value = []
    return false
  }
  rows.value = parsed.rows
  return true
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the file.'))
    reader.readAsText(file)
  })
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Unable to read the file.'))
    reader.readAsArrayBuffer(file)
  })
}

// Parse an Excel workbook (.xls/.xlsx/.ods) into a 2D grid using SheetJS,
// loaded on demand so the heavy parser only ships when actually needed.
async function parseSpreadsheet(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx')
  const buf = await readFileAsArrayBuffer(file)
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined
  if (!sheet) throw new Error('The workbook has no sheets.')
  // raw:false → formatted strings; defval:'' → keep empty cells aligned.
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
}

async function onFile(event: Event) {
  parseError.value = ''
  summary.value = null
  results.value = []
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  const ext = (file.name.split('.').pop() || '').toLowerCase()

  try {
    if (ext === 'numbers') {
      parseError.value =
        'Apple Numbers files can’t be read directly. In Numbers, choose File → Export To → Excel, then upload that .xlsx file.'
      rows.value = []
      return
    }
    const grid =
      ext === 'xls' || ext === 'xlsx' || ext === 'ods'
        ? await parseSpreadsheet(file)
        : parseCsv(await readFileAsText(file))
    gridToRows(grid)
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : 'Unable to parse the file.'
    rows.value = []
  } finally {
    // Allow re-selecting the same file after an error.
    input.value = ''
  }
}

const validCount = computed(() => rows.value.filter((r) => r.missing.length === 0).length)
const invalidCount = computed(() => rows.value.length - validCount.value)

const duplicateBagNos = computed(() => {
  const seen = new Map<string, number>()
  for (const r of rows.value) {
    if (r.slug) seen.set(r.slug, (seen.get(r.slug) || 0) + 1)
  }
  return new Set(
    rows.value.filter((r) => r.slug && (seen.get(r.slug) || 0) > 1).map((r) => r.bagNo || r.slug),
  )
})

function metalLabel(row: ImportRow) {
  return [row.metalPurity, colorLabel(row.color)].filter(Boolean).join(' · ') || formatKtCol(row.metalPurity, row.color)
}

// Only the columns present in the file are sent, so re-importing an exported
// packing list with "Overwrite" refreshes the specs without blanking the
// description, tags or flags the sheet never carried.
function toProduct(row: ImportRow) {
  const numberOrNull = (value: string | undefined) => (value?.trim() ? Number(value) : null)
  const product: Record<string, unknown> = {
    slug: row.slug,
    title: row.title,
    category: row.category,
    material: row.material,
    color: row.color,
    productAttributes: {
      bagNo: row.bagNo,
      styleNo: row.styleNo,
      grossWeight: row.grossWeight,
      netWeight: row.netWeight,
      goldRate: row.goldRate,
      goldValue: row.goldValue,
      metalPurity: row.metalPurity,
      centerStoneSize: row.centerStoneSize ?? '',
      stoneLines: row.stoneLines,
    },
  }
  if (row.subtype !== undefined) product.subtype = row.subtype
  if (row.collection !== undefined) product.collection = row.collection
  if (row.price !== undefined) product.variantPricePaise = numberOrNull(row.price)
  if (row.description !== undefined) product.description = row.description
  if (row.qty !== undefined) product.quantity = numberOrNull(row.qty)
  if (row.styleTags !== undefined) product.styleTags = row.styleTags
  if (row.stoneTags !== undefined) product.stoneTags = row.stoneTags
  if (row.isNewArrival !== undefined) product.isNewArrival = bool(row.isNewArrival)
  if (row.isBestSeller !== undefined) product.isBestSeller = bool(row.isBestSeller)
  if (row.active !== undefined) product.active = bool(row.active, true)
  if (row.rating !== undefined) product.rating = numberOrNull(row.rating)
  if (row.reviewCount !== undefined) product.reviewCount = numberOrNull(row.reviewCount)
  return product
}

// The template is a two-piece packing list in the exact layout the export
// produces, so the same file works in both directions.
async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const grid = piecesToGrid([
    {
      bagNo: '25/P/1406', slug: '25-p-1406', styleNo: 'RG6228', title: 'RG6228', category: 'Rings',
      qty: 1, grossWeight: '2.89', metalPurity: '14k Gold', color: 'yellow', netWeight: '2.794',
      goldRate: '74.185', goldValue: '228.00', price: 1162,
      stoneLines: [
        { group: 'D', shape: 'Round', quality: 'G-H/I2', pcs: '8', cts: '0.08' },
        { group: 'D', shape: 'Round', quality: 'G-H/I2', pcs: '54', cts: '0.21' },
        { group: 'C', shape: 'ROUND', quality: 'EMERALD', pcs: '9', cts: '0.19' },
      ],
    },
    {
      bagNo: '25/P/557', slug: '25-p-557', styleNo: 'RG7973_9.5X7', title: 'RG7973_9.5X7', category: 'Rings',
      qty: 1, grossWeight: '3.53', metalPurity: '18k Gold', color: 'rose', netWeight: '3.032',
      goldRate: '93.318', goldValue: '311.23', price: 1352,
      stoneLines: [{ group: 'C', shape: 'EMERALD', quality: 'TOURMALINE', pcs: '1', cts: '2.49' }],
    },
  ])
  const sheet = XLSX.utils.aoa_to_sheet(grid)
  sheet['!cols'] = PACKING_LIST_COLUMNS.map((name) => ({ wch: Math.max(8, name.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Worksheet')
  XLSX.writeFile(wb, 'packing-list-template.xlsx')
}

async function startImport() {
  if (!user.value?.id || importing.value) return
  const valid = rows.value.filter((r) => r.missing.length === 0).map(toProduct)
  if (!valid.length) return

  importing.value = true
  summary.value = null
  results.value = []
  progress.value = { done: 0, total: valid.length }
  const totals: Record<string, number> = { created: 0, updated: 0, skipped: 0, error: 0 }

  try {
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE)
      const res = await fetch(
        `${API_BASE}/api/internal?resource=product&action=bulk&userId=${encodeURIComponent(user.value.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.value.id, action: 'bulk', mode: mode.value, products: batch }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Import request failed.')
      for (const r of data.results || []) {
        results.value.push(r)
        totals[r.status] = (totals[r.status] || 0) + 1
      }
      progress.value = { done: Math.min(i + BATCH_SIZE, valid.length), total: valid.length }
    }
    summary.value = totals
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : 'Import failed.'
  } finally {
    importing.value = false
  }
}

function statusClass(status: string) {
  if (status === 'created') return 'ect-bg-green-100 ect-text-green-700'
  if (status === 'updated') return 'ect-bg-blue-100 ect-text-blue-700'
  if (status === 'skipped') return 'ect-bg-amber-100 ect-text-amber-700'
  return 'ect-bg-red-100 ect-text-red-700'
}
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-6 sm:ect-pt-14 ect-pb-16">
   <div class="ect-mx-auto ect-max-w-5xl ect-px-4">
    <RouterLink :to="{ path: '/internal', query: { tab: 'products' } }"
      class="ect-font-body ect-text-sm ect-text-charcoal/60 hover:ect-text-rose-700 hover:ect-underline">
      ← Back to products
    </RouterLink>

    <h1 class="ect-mt-3 ect-font-display ect-text-2xl ect-text-charcoal">Upload packing list</h1>
    <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55 ect-max-w-2xl">
      Upload the packing list as an Excel or CSV file (.xlsx, .xls, .csv) to create or update many pieces
      at once. Each <strong>BAG NO</strong> becomes one product: the bag number is its web address
      (<code>25/P/1406</code> → <code>25-p-1406</code>), <strong>Style No</strong> is its name and
      its S3 image folder (<code>RG6228</code> → <code>RG6228/</code>), <strong>Type</strong> its
      category, and <strong>Kt/Col</strong> its metal
      (<code>14KTYG</code> = 14 karat yellow gold; <code>W</code> white, <code>P</code>/<code>R</code> rose).
      Rows with only stone columns filled continue the piece above them, and Total rows are ignored.
      Images are not part of the file — they are pulled from the S3 folder named after each piece's Style No.
      Apple Numbers files aren't read directly — in Numbers, use File → Export To → Excel first.
    </p>

    <div v-if="!isInternalUser" class="ect-mt-6 ect-rounded-lg ect-bg-red-50 ect-p-4 ect-font-body ect-text-sm ect-text-red-700">
      Internal access required.
    </div>

    <template v-else>
      <!-- Controls -->
      <div class="ect-mt-6 ect-flex ect-flex-wrap ect-items-center ect-gap-3">
        <button type="button" @click="downloadTemplate"
          class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-rose-300 hover:ect-text-rose-700">
          Download Excel template
        </button>
        <label class="ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-rose-700 ect-cursor-pointer">
          Choose file
          <input type="file"
            accept=".csv,.xls,.xlsx,.ods,.numbers,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            class="ect-hidden" @change="onFile" />
        </label>
        <span v-if="fileName" class="ect-font-body ect-text-sm ect-text-charcoal/60">{{ fileName }}</span>
      </div>

      <div v-if="parseError" class="ect-mt-4 ect-rounded-lg ect-bg-red-50 ect-p-3 ect-font-body ect-text-sm ect-text-red-700">
        {{ parseError }}
      </div>

      <!-- Preview -->
      <div v-if="rows.length" class="ect-mt-6">
        <div class="ect-flex ect-flex-wrap ect-items-center ect-gap-4 ect-mb-3">
          <span class="ect-font-body ect-text-sm ect-text-charcoal/70">
            {{ rows.length }} pieces · <strong class="ect-text-green-700">{{ validCount }} ready</strong>
            <template v-if="invalidCount"> · <strong class="ect-text-red-600">{{ invalidCount }} with errors</strong></template>
          </span>
          <span v-if="duplicateBagNos.size" class="ect-font-body ect-text-sm ect-text-amber-700">
            ⚠ Duplicate bag numbers in file: {{ [...duplicateBagNos].join(', ') }}
          </span>
          <label class="ect-flex ect-items-center ect-gap-2 ect-font-body ect-text-sm ect-text-charcoal/70 ect-ml-auto">
            Existing pieces:
            <select v-model="mode" class="ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-2 ect-py-1.5 ect-text-sm">
              <option value="skip">Skip</option>
              <option value="overwrite">Overwrite</option>
            </select>
          </label>
        </div>

        <div class="ect-overflow-x-auto ect-rounded-lg ect-border ect-border-rose-100">
          <table class="ect-w-full ect-min-w-[760px] ect-border-collapse">
            <thead class="ect-bg-rose-50">
              <tr>
                <th v-for="h in ['Bag No', 'Style No', 'Type', 'Collection', 'Kt/Col', 'Stones', 'Price', 'Status']" :key="h"
                  class="ect-px-3 ect-py-2 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-wide ect-text-charcoal/45">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.sheetRow" class="ect-border-t ect-border-rose-100">
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/80">
                  {{ row.bagNo }}
                  <span v-if="row.slug && row.slug !== row.bagNo" class="ect-block ect-text-[11px] ect-text-charcoal/40">{{ row.slug }}</span>
                </td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/80">{{ row.title }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/60">{{ row.category }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/60">{{ row.collection || '—' }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/60">{{ metalLabel(row) }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/60">{{ row.stoneLines.length }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/60">{{ row.price }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-xs">
                  <span v-if="row.missing.length" class="ect-text-red-600">Row {{ row.sheetRow }} — missing: {{ row.missing.join(', ') }}</span>
                  <span v-else class="ect-text-green-700">Ready</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="ect-mt-4 ect-flex ect-items-center ect-gap-3">
          <button type="button" :disabled="importing || !validCount" @click="startImport"
            class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-rose-700 disabled:ect-opacity-50 disabled:ect-cursor-not-allowed">
            {{ importing ? `Importing ${progress.done}/${progress.total}…` : `Import ${validCount} piece${validCount === 1 ? '' : 's'}` }}
          </button>
        </div>
      </div>

      <!-- Results -->
      <div v-if="summary" class="ect-mt-6 ect-rounded-lg ect-border ect-border-rose-100 ect-p-4">
        <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Import complete</h2>
        <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/70">
          Created {{ summary.created }} · Updated {{ summary.updated }} · Skipped {{ summary.skipped }} · Errors {{ summary.error }}
        </p>
        <div v-if="results.length" class="ect-mt-3 ect-max-h-72 ect-overflow-y-auto">
          <div v-for="(r, i) in results" :key="i" class="ect-flex ect-items-center ect-gap-2 ect-py-1 ect-font-body ect-text-sm">
            <span class="ect-rounded-full ect-px-2 ect-py-0.5 ect-text-xs ect-font-semibold" :class="statusClass(r.status)">{{ r.status }}</span>
            <span class="ect-text-charcoal/80">{{ r.slug }}</span>
            <span class="ect-text-charcoal/50">{{ r.message }}</span>
          </div>
        </div>
      </div>
    </template>
   </div>
  </section>
</template>
