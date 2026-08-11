<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'

const { user, isInternalUser } = useAuth()

// CSV schema. Multi-value columns are pipe (|) separated so commas stay safe.
const COLUMNS = [
  'slug', 'title', 'category', 'subtype', 'material', 'color', 'price', 'description',
  'grossWeight', 'diamondCarats', 'diamondQuantity',
  'styleTags', 'stoneTags',
  'isNewArrival', 'isBestSeller', 'active', 'rating', 'reviewCount',
  'diamondQualities', 'metalPurities', 'centerShapes', 'centerStoneSizes',
  'stoneTypes', 'ringSizes', 'bangleSizes', 'necklaceSizes',
  'allowCustomCenterStoneSize', 'allowCustomStoneType',
]
const REQUIRED = ['slug', 'title', 'category', 'material', 'color']
const BATCH_SIZE = 25

const fileName = ref('')
const rows = ref<Record<string, string>[]>([])
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

// Turn a parsed 2D grid (headers + data rows) into validated row objects.
// Shared by the CSV and spreadsheet (.xls/.xlsx) code paths.
function gridToRows(grid: string[][]): boolean {
  if (grid.length < 2) { parseError.value = 'File has no data rows.'; rows.value = []; return false }
  const headers = (grid[0] ?? []).map((h) => String(h).trim())
  const missingCols = REQUIRED.filter((c) => !headers.includes(c))
  if (missingCols.length) {
    parseError.value = `File is missing required column(s): ${missingCols.join(', ')}. Download the template.`
    rows.value = []
    return false
  }
  rows.value = grid.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = String(cells[i] ?? '').trim() })
    return obj
  })
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
        'Apple Numbers files can’t be read directly. In Numbers, choose File → Export To → CSV (or Excel), then upload that file.'
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

function rowErrors(row: Record<string, string>): string[] {
  return REQUIRED.filter((c) => !String(row[c] || '').trim())
}

const validCount = computed(() => rows.value.filter((r) => rowErrors(r).length === 0).length)
const invalidCount = computed(() => rows.value.length - validCount.value)

const duplicateSlugs = computed(() => {
  const seen = new Map<string, number>()
  for (const r of rows.value) {
    const s = String(r.slug || '').trim()
    if (s) seen.set(s, (seen.get(s) || 0) + 1)
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s))
})

function toProduct(row: Record<string, string>) {
  const multi = (key: string) =>
    String(row[key] || '').split('|').map((v) => v.trim()).filter(Boolean)
  return {
    slug: row.slug?.trim(),
    title: row.title?.trim(),
    category: row.category?.trim(),
    subtype: row.subtype?.trim() || '',
    material: row.material?.trim(),
    color: row.color?.trim(),
    variantPricePaise: row.price?.trim() ? Number(row.price) : null,
    description: row.description?.trim() || '',
    productAttributes: {
      grossWeight: row.grossWeight?.trim() || '',
      diamondCarats: row.diamondCarats?.trim() || '',
      diamondQuantity: row.diamondQuantity?.trim() || '',
    },
    styleTags: multi('styleTags'),
    stoneTags: multi('stoneTags'),
    isNewArrival: bool(row.isNewArrival),
    isBestSeller: bool(row.isBestSeller),
    active: bool(row.active, true),
    rating: row.rating?.trim() ? Number(row.rating) : null,
    reviewCount: row.reviewCount?.trim() ? Number(row.reviewCount) : null,
    customizationOptions: {
      diamondQualities: multi('diamondQualities'),
      metalPurities: multi('metalPurities'),
      centerShapes: multi('centerShapes'),
      centerStoneSizes: multi('centerStoneSizes'),
      stoneTypes: multi('stoneTypes'),
      ringSizes: multi('ringSizes'),
      bangleSizes: multi('bangleSizes'),
      necklaceSizes: multi('necklaceSizes'),
      allowCustomCenterStoneSize: bool(row.allowCustomCenterStoneSize, true),
      allowCustomStoneType: bool(row.allowCustomStoneType, true),
    },
  }
}

function downloadTemplate() {
  const example: Record<string, string> = {
    slug: 'ruby-ring', title: 'Ruby Solitaire Ring', category: 'Rings', subtype: 'solitaire',
    material: 'gold', color: 'rose-gold', price: '1499', description: 'A timeless ruby solitaire.',
    grossWeight: '4.55 gms', diamondCarats: '0.72 cts', diamondQuantity: '86',
    styleTags: 'modern|vintage', stoneTags: 'ruby|diamond',
    isNewArrival: 'true', isBestSeller: 'false', active: 'true', rating: '4.8', reviewCount: '24',
    diamondQualities: 'VVS1|VVS2', metalPurities: '18K|22K', centerShapes: 'Round|Oval',
    centerStoneSizes: '6 mm|7 mm', stoneTypes: 'Natural Diamond|Moissanite|Ruby',
    ringSizes: '6|7|8', bangleSizes: '', necklaceSizes: '',
    allowCustomCenterStoneSize: 'true', allowCustomStoneType: 'true',
  }
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csv = COLUMNS.join(',') + '\n' + COLUMNS.map((c) => esc(example[c] ?? '')).join(',') + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'product-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

async function startImport() {
  if (!user.value?.id || importing.value) return
  const valid = rows.value.filter((r) => rowErrors(r).length === 0).map(toProduct)
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
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-32 ect-pb-16">
   <div class="ect-mx-auto ect-max-w-5xl ect-px-4">
    <RouterLink :to="{ path: '/internal', query: { tab: 'products' } }"
      class="ect-font-body ect-text-sm ect-text-charcoal/60 hover:ect-text-rose-700 hover:ect-underline">
      ← Back to products
    </RouterLink>

    <h1 class="ect-mt-3 ect-font-display ect-text-2xl ect-text-charcoal">Mass upload products</h1>
    <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55 ect-max-w-2xl">
      Upload a CSV or Excel file (.csv, .xls, .xlsx) to create many products at once. Images are not
      part of the file — each product's images are pulled automatically from its S3 folder (folder
      name must equal the product <strong>slug</strong>). Download the template to see every column.
      Apple Numbers files aren't read directly — in Numbers, use File → Export To → CSV first.
    </p>

    <div v-if="!isInternalUser" class="ect-mt-6 ect-rounded-lg ect-bg-red-50 ect-p-4 ect-font-body ect-text-sm ect-text-red-700">
      Internal access required.
    </div>

    <template v-else>
      <!-- Controls -->
      <div class="ect-mt-6 ect-flex ect-flex-wrap ect-items-center ect-gap-3">
        <button type="button" @click="downloadTemplate"
          class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-rose-300 hover:ect-text-rose-700">
          Download CSV template
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
            {{ rows.length }} rows · <strong class="ect-text-green-700">{{ validCount }} valid</strong>
            <template v-if="invalidCount"> · <strong class="ect-text-red-600">{{ invalidCount }} with errors</strong></template>
          </span>
          <span v-if="duplicateSlugs.size" class="ect-font-body ect-text-sm ect-text-amber-700">
            ⚠ Duplicate slugs in file: {{ [...duplicateSlugs].join(', ') }}
          </span>
          <label class="ect-flex ect-items-center ect-gap-2 ect-font-body ect-text-sm ect-text-charcoal/70 ect-ml-auto">
            Existing products:
            <select v-model="mode" class="ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-2 ect-py-1.5 ect-text-sm">
              <option value="skip">Skip</option>
              <option value="overwrite">Overwrite</option>
            </select>
          </label>
        </div>

        <div class="ect-overflow-x-auto ect-rounded-lg ect-border ect-border-rose-100">
          <table class="ect-w-full ect-min-w-[700px] ect-border-collapse">
            <thead class="ect-bg-rose-50">
              <tr>
                <th class="ect-px-3 ect-py-2 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-wide ect-text-charcoal/45">Slug</th>
                <th class="ect-px-3 ect-py-2 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-wide ect-text-charcoal/45">Title</th>
                <th class="ect-px-3 ect-py-2 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-wide ect-text-charcoal/45">Category</th>
                <th class="ect-px-3 ect-py-2 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-wide ect-text-charcoal/45">Price</th>
                <th class="ect-px-3 ect-py-2 ect-text-left ect-font-body ect-text-xs ect-uppercase ect-tracking-wide ect-text-charcoal/45">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="i" class="ect-border-t ect-border-rose-100">
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/80">{{ row.slug }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/80">{{ row.title }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/60">{{ row.category }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal/60">{{ row.price }}</td>
                <td class="ect-px-3 ect-py-2 ect-font-body ect-text-xs">
                  <span v-if="rowErrors(row).length" class="ect-text-red-600">Missing: {{ rowErrors(row).join(', ') }}</span>
                  <span v-else class="ect-text-green-700">Ready</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="ect-mt-4 ect-flex ect-items-center ect-gap-3">
          <button type="button" :disabled="importing || !validCount" @click="startImport"
            class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-rose-700 disabled:ect-opacity-50 disabled:ect-cursor-not-allowed">
            {{ importing ? `Importing ${progress.done}/${progress.total}…` : `Import ${validCount} product${validCount === 1 ? '' : 's'}` }}
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
