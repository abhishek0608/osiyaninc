<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'
import { invalidateProductsCache } from '../composables/useProductsApi'
import { BANGLE_SIZE_OPTIONS, CATEGORIES, CENTER_SHAPE_OPTIONS, CERT_LAB_OPTIONS, COLORS, DIAMOND_QUALITY_OPTIONS, METAL_PURITY_OPTIONS, NECKLACE_SIZE_OPTIONS, RING_SIZE_OPTIONS } from '../data/products'

// One photo in the product's S3 folder. `key` is the object key, which the
// delete endpoint needs; display order comes from the "_<n>" filename suffix.
interface ProductImage {
  url: string
  key: string
  sku: string | null
  sortOrder: number
}

// The uploaded lab report. Like the gallery, it is written to S3 the moment it
// is picked rather than on Save, so it lives outside ProductForm.
interface ProductCertificate {
  url: string
  key: string
}

interface ProductForm {
  slug: string
  title: string
  category: string
  subtype: string
  material: string
  color: string
  description: string
  aiDescription: string
  grossWeight: string
  diamondCarats: string
  diamondQuantity: string
  diamondQuality: string
  metalPurity: string
  centerShape: string
  centerStoneSizes: string
  allowCustomCenterStoneSize: boolean
  stoneTypes: string
  allowCustomStoneType: boolean
  ringSize: string
  bangleSize: string
  necklaceSize: string
  certLab: string
  certNumber: string
  certifiedAt: string
  variantPricePaise: string
  rating: string
  reviewCount: string
  isNewArrival: boolean
  isBestSeller: boolean
  active: boolean
}

const route = useRoute()
const router = useRouter()
const { user, isInternalUser } = useAuth()

const loading = ref(false)
const saving = ref(false)
const generatingAiDescription = ref(false)
const error = ref('')
const saved = ref(false)
const lastSavedSlug = ref(String(route.params.slug || ''))
const isEditing = ref(false)
const slugManuallyEdited = ref(false)
const formSnapshot = ref<ProductForm | null>(null)
const imageUploadInput = ref<HTMLInputElement | null>(null)
const imageUploadProcessing = ref(false)
const imageDeletingKey = ref('')
// The product's gallery, read from its S3 folder (folder name === slug). S3 is
// the only source of product photos: uploads go straight into the folder and
// removals delete the object, so this list is always what the storefront shows.
const productImages = ref<ProductImage[]>([])
// The piece's lab report, read back from the saved product row.
const productCertificate = ref<ProductCertificate>({ url: '', key: '' })
const certificateUploadInput = ref<HTMLInputElement | null>(null)
const certificateUploading = ref(false)
const certificateDeleting = ref(false)
const fieldSkeletonRows = Array.from({ length: 9 }, (_, index) => index)
const materialOptions = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
]
const subtypeOptions = [
  { value: 'solitaire', label: 'Solitaire' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'multi-stone', label: 'Multi-stone' },
  { value: 'open-ring', label: 'Open ring' },
  { value: 'pendant', label: 'Pendant' },
  { value: 'statement-necklace', label: 'Statement necklace' },
  { value: 'cuff', label: 'Cuff / kada' },
  { value: 'chain-bracelet', label: 'Chain bracelet' },
  { value: 'drop', label: 'Drop earrings' },
  { value: 'stud', label: 'Stud earrings' },
  { value: 'mangal-sutra', label: 'Mangal sutra' },
  { value: 'jhumka', label: 'Jhumka' },
]

const isNewProduct = computed(() => String(route.params.slug || '') === 'new')
const fieldsEditable = computed(() => isNewProduct.value || isEditing.value)
const isRingCategory = computed(() => form.value.category === 'Rings')
const isBraceletCategory = computed(() => form.value.category === 'Bracelets')
const isNecklaceCategory = computed(
  () => form.value.category === 'Necklaces' || form.value.category === 'Mangal Sutra',
)
const isBangleCategory = computed(() => form.value.category === 'Bangles')
const isBangleLikeProduct = computed(() => {
  if (isBangleCategory.value) return true
  // Bangle-ish pieces still filed under Bracelets need the bangle size too.
  if (!isBraceletCategory.value) return false
  const fingerprint = [form.value.title, form.value.subtype, form.value.description]
    .join(' ')
    .toLowerCase()
  return /\b(bangle|kada|cuff)\b/.test(fingerprint)
})
const supportsCenterStoneFields = computed(() => !isBangleLikeProduct.value)

function cloneForm(f: ProductForm): ProductForm {
  return JSON.parse(JSON.stringify(f)) as ProductForm
}

function startEdit() {
  isEditing.value = true
}

function cancelEdit() {
  if (formSnapshot.value) form.value = cloneForm(formSnapshot.value)
  isEditing.value = false
  slugManuallyEdited.value = false
  error.value = ''
}

function emptyProductForm(): ProductForm {
  return {
    slug: '',
    title: '',
    category: '',
    subtype: '',
    material: '',
    color: '',
    description: '',
    aiDescription: '',
    grossWeight: '',
    diamondCarats: '',
    diamondQuantity: '',
    diamondQuality: '',
    metalPurity: '',
    centerShape: '',
    centerStoneSizes: '',
    allowCustomCenterStoneSize: true,
    stoneTypes: '',
    allowCustomStoneType: true,
    ringSize: '',
    bangleSize: '',
    necklaceSize: '',
    certLab: '',
    certNumber: '',
    certifiedAt: '',
    variantPricePaise: '',
    rating: '',
    reviewCount: '',
    isNewArrival: false,
    isBestSeller: false,
    active: true,
  }
}

function applyNewProductRoute() {
  form.value = emptyProductForm()
  lastSavedSlug.value = ''
  slugManuallyEdited.value = false
  error.value = ''
  saved.value = false
}

const form = ref<ProductForm>({
  slug: '',
  title: '',
  category: '',
  subtype: '',
  material: '',
  color: '',
  description: '',
  aiDescription: '',
  grossWeight: '',
  diamondCarats: '',
  diamondQuantity: '',
  diamondQuality: '',
  metalPurity: '',
  centerShape: '',
  centerStoneSizes: '',
  allowCustomCenterStoneSize: true,
  stoneTypes: '',
  allowCustomStoneType: true,
  ringSize: '',
  bangleSize: '',
  necklaceSize: '',
  certLab: '',
  certNumber: '',
  certifiedAt: '',
  variantPricePaise: '',
  rating: '',
  reviewCount: '',
  isNewArrival: false,
  isBestSeller: false,
  active: true,
})

const previewImages = computed(() =>
  productImages.value
    .filter((image) => image.url?.trim())
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder),
)
// Active image in the Preview gallery; mirrors the storefront's gallery so the
// internal preview shows every image as a separate, clickable thumbnail.
const activePreviewImage = ref(0)
function setPreviewImage(index: number) {
  const lastIndex = previewImages.value.length - 1
  activePreviewImage.value = lastIndex < 0 ? 0 : Math.min(Math.max(index, 0), lastIndex)
}
watch(previewImages, (images) => {
  if (activePreviewImage.value > images.length - 1) activePreviewImage.value = 0
})

function findOptionLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label || value
}

function displayValue(value: unknown, fallback = '—') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function displayBoolean(value: boolean) {
  return value ? 'Yes' : 'No'
}

const coreDisplayRows = computed(() => [
  { label: 'Title', value: displayValue(form.value.title) },
  { label: 'Slug', value: displayValue(form.value.slug) },
  { label: 'Category', value: displayValue(form.value.category) },
  { label: 'Subtype', value: displayValue(findOptionLabel(subtypeOptions, form.value.subtype)) },
  { label: 'Material', value: displayValue(findOptionLabel(materialOptions, form.value.material)) },
  { label: 'Color', value: displayValue(COLORS.find((color) => color.id === form.value.color)?.label || form.value.color) },
  { label: 'Price (USD)', value: displayValue(form.value.variantPricePaise) },
])

const attributeDisplayRows = computed(() => [
  { label: 'Gross weight', value: displayValue(form.value.grossWeight) },
  { label: 'Diamond carats', value: displayValue(form.value.diamondCarats) },
  { label: 'Diamond quantity', value: displayValue(form.value.diamondQuantity) },
])

const customizationDisplayRows = computed(() => {
  const rows = [
    { label: 'Diamond quality', value: displayValue(form.value.diamondQuality) },
    { label: 'Metal purity', value: displayValue(form.value.metalPurity) },
    ...(supportsCenterStoneFields.value
      ? [
          { label: 'Stone types', value: displayValue(form.value.stoneTypes) },
          { label: 'Allow custom stone type', value: displayBoolean(form.value.allowCustomStoneType) },
          { label: 'Center shape', value: displayValue(form.value.centerShape) },
          { label: 'Center stone sizes', value: displayValue(form.value.centerStoneSizes) },
          { label: 'Allow custom center stone size', value: displayBoolean(form.value.allowCustomCenterStoneSize) },
        ]
      : []),
    ...(isRingCategory.value ? [{ label: 'Ring size', value: displayValue(form.value.ringSize) }] : []),
    ...(isBangleLikeProduct.value ? [{ label: 'Bangle size', value: displayValue(form.value.bangleSize) }] : []),
    ...(isNecklaceCategory.value ? [{ label: 'Necklace size', value: displayValue(form.value.necklaceSize) }] : []),
  ]
  return rows
})

const certificateFileName = computed(() => {
  const key = productCertificate.value.key
  return key ? key.split('/').pop() || key : ''
})

const certificationDisplayRows = computed(() => [
  { label: 'Certifying lab', value: displayValue(form.value.certLab, 'Not certified') },
  { label: 'Certificate no.', value: displayValue(form.value.certNumber) },
  { label: 'Certified on', value: displayValue(form.value.certifiedAt) },
  { label: 'Certificate file', value: displayValue(certificateFileName.value, 'Not uploaded') },
])

const statusDisplayRows = computed(() => [
  { label: 'Active', value: displayBoolean(form.value.active) },
  { label: 'New arrival', value: displayBoolean(form.value.isNewArrival) },
  { label: 'Best seller', value: displayBoolean(form.value.isBestSeller) },
])

function toSlug(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function handleSlugInput(event: Event) {
  slugManuallyEdited.value = true
  form.value.slug = toSlug((event.target as HTMLInputElement).value)
}

function mapIncomingProduct(product: any): ProductForm {
  return {
    slug: String(product?.slug || ''),
    title: String(product?.title || ''),
    category: String(product?.category || ''),
    subtype: String(product?.subtype || ''),
    material: String(product?.material || ''),
    color: String(product?.color || ''),
    description: String(product?.description || ''),
    aiDescription: String(product?.aiDescription || ''),
    grossWeight: String(product?.productAttributes?.grossWeight || ''),
    diamondCarats: String(product?.productAttributes?.diamondCarats || ''),
    diamondQuantity: String(product?.productAttributes?.diamondQuantity || ''),
    diamondQuality: Array.isArray(product?.customizationOptions?.diamondQualities) ? (product.customizationOptions.diamondQualities[0] || '') : '',
    metalPurity: Array.isArray(product?.customizationOptions?.metalPurities) ? (product.customizationOptions.metalPurities[0] || '') : '',
    centerShape: Array.isArray(product?.customizationOptions?.centerShapes) ? (product.customizationOptions.centerShapes[0] || '') : '',
    centerStoneSizes: Array.isArray(product?.customizationOptions?.centerStoneSizes) ? product.customizationOptions.centerStoneSizes.join(', ') : '',
    allowCustomCenterStoneSize: product?.customizationOptions?.allowCustomCenterStoneSize !== false,
    stoneTypes: Array.isArray(product?.customizationOptions?.stoneTypes) ? product.customizationOptions.stoneTypes.join(', ') : '',
    allowCustomStoneType: product?.customizationOptions?.allowCustomStoneType !== false,
    ringSize: Array.isArray(product?.customizationOptions?.ringSizes) ? (product.customizationOptions.ringSizes[0] || '') : '',
    bangleSize: Array.isArray(product?.customizationOptions?.bangleSizes) ? (product.customizationOptions.bangleSizes[0] || '') : '',
    necklaceSize: Array.isArray(product?.customizationOptions?.necklaceSizes) ? (product.customizationOptions.necklaceSizes[0] || '') : '',
    certLab: String(product?.certLab || ''),
    certNumber: String(product?.certNumber || ''),
    certifiedAt: toDateInputValue(product?.certifiedAt),
    variantPricePaise:
      typeof product?.variantPricePaise === 'number' ? String(product.variantPricePaise) : '',
    rating: typeof product?.rating === 'number' ? String(product.rating) : '',
    reviewCount: typeof product?.reviewCount === 'number' ? String(product.reviewCount) : '',
    isNewArrival: Boolean(product?.isNewArrival),
    isBestSeller: Boolean(product?.isBestSeller),
    active: product?.active !== false,
  }
}

// `<input type="date">` only accepts YYYY-MM-DD, and the API returns an ISO
// timestamp (or nothing at all, for an undated certificate).
function toDateInputValue(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function mapIncomingCertificate(product: any): ProductCertificate {
  return {
    url: String(product?.certFileUrl || ''),
    key: String(product?.certFileKey || ''),
  }
}

// The gallery comes from the product's S3 folder, never from the form payload.
function mapIncomingImages(product: any): ProductImage[] {
  if (!Array.isArray(product?.s3Images)) return []
  return product.s3Images.map((image: any, index: number) => ({
    url: String(image?.url || ''),
    key: String(image?.key || ''),
    sku: image?.sku ? String(image.sku) : null,
    sortOrder:
      Number.isFinite(Number(image?.sortOrder)) && Number(image?.sortOrder) >= 0
        ? Number(image.sortOrder)
        : index,
  }))
}

function splitCommaSeparated(input: string) {
  return String(input || '').split(',').map((v) => v.trim()).filter(Boolean)
}

function wrapSingle(value: string) {
  return value ? [value] : []
}

function buildCustomizationOptionsPayload() {
  return {
    diamondQualities: wrapSingle(form.value.diamondQuality),
    metalPurities: wrapSingle(form.value.metalPurity),
    centerShapes: supportsCenterStoneFields.value ? wrapSingle(form.value.centerShape) : [],
    centerStoneSizes: supportsCenterStoneFields.value ? splitCommaSeparated(form.value.centerStoneSizes) : [],
    allowCustomCenterStoneSize: form.value.allowCustomCenterStoneSize,
    stoneTypes: supportsCenterStoneFields.value ? splitCommaSeparated(form.value.stoneTypes) : [],
    allowCustomStoneType: form.value.allowCustomStoneType,
    ringSizes: isRingCategory.value ? wrapSingle(form.value.ringSize) : [],
    bangleSizes: isBangleLikeProduct.value ? wrapSingle(form.value.bangleSize) : [],
    necklaceSizes: isNecklaceCategory.value ? wrapSingle(form.value.necklaceSize) : [],
  }
}

function buildProductAttributesPayload() {
  return {
    grossWeight: normalizeInputValue(form.value.grossWeight),
    diamondCarats: normalizeInputValue(form.value.diamondCarats),
    diamondQuantity: normalizeInputValue(form.value.diamondQuantity),
  }
}

function normalizeInputValue(input: unknown) {
  return String(input ?? '').trim()
}

// A product's photos live under its own S3 folder, so the product row has to
// exist (and own a settled slug) before anything can be uploaded for it.
const canManageImages = computed(() => !isNewProduct.value && Boolean(lastSavedSlug.value))

function openImageUpload() {
  if (!canManageImages.value || imageUploadProcessing.value) return
  imageUploadInput.value?.click()
}

// Call the S3 product-image endpoint. Every action returns the refreshed
// product, except `presign`, which returns the URLs to upload to.
async function postImageAction(payload: Record<string, unknown>) {
  const userId = user.value?.id
  if (!userId) throw new Error('Sign in again to manage images.')
  const res = await fetch(
    `${API_BASE}/api/internal?resource=product-image&userId=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, slug: lastSavedSlug.value, ...payload }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      data?.message ||
        (res.status === 501
          ? 'Image storage is not configured for this environment.'
          : 'Unable to update product images.'),
    )
  }
  return data
}

// Bulk upload: ask for one presigned PUT per file, send the bytes straight to
// S3 from the browser, then let the server refresh caches and photo vectors.
// The first object to land creates the product's folder in the bucket.
async function onImageUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).filter((file) => file.type.startsWith('image/'))
  input.value = ''
  if (!files.length || !canManageImages.value) return

  imageUploadProcessing.value = true
  error.value = ''
  try {
    const { uploads } = await postImageAction({
      action: 'presign',
      files: files.map((file) => ({ contentType: file.type })),
    })
    if (!Array.isArray(uploads) || uploads.length !== files.length) {
      throw new Error('Unable to start the upload.')
    }

    await Promise.all(
      files.map(async (file, index) => {
        const target = uploads[index]
        const putRes = await fetch(target.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': target.contentType || file.type },
          body: file,
        })
        if (!putRes.ok) throw new Error(`Upload failed for ${file.name}.`)
      }),
    )

    const data = await postImageAction({ action: 'uploaded' })
    productImages.value = mapIncomingImages(data.product)
    productCertificate.value = mapIncomingCertificate(data.product)
    invalidateProductsCache()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to upload images.'
  } finally {
    imageUploadProcessing.value = false
  }
}

// ---------------------------------------------------------------------------
// Certificate file (S3, one per product)
// ---------------------------------------------------------------------------

// Certificates are filed under the product slug, so — as with photos — the row
// has to exist and own a settled slug first.
const canManageCertificate = computed(() => !isNewProduct.value && Boolean(lastSavedSlug.value))

const certificateBusy = computed(() => certificateUploading.value || certificateDeleting.value)

function openCertificateUpload() {
  if (!canManageCertificate.value || certificateBusy.value) return
  certificateUploadInput.value?.click()
}

async function postCertificateAction(payload: Record<string, unknown>) {
  const userId = user.value?.id
  if (!userId) throw new Error('Sign in again to manage the certificate.')
  const res = await fetch(
    `${API_BASE}/api/internal?resource=product-certificate&userId=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, slug: lastSavedSlug.value, ...payload }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      data?.message ||
        (res.status === 501
          ? 'Certificate storage is not configured for this environment.'
          : 'Unable to update the certificate.'),
    )
  }
  return data
}

// Presign, PUT the bytes to S3 from the browser, then let the server point the
// product at the new file and clean up the one it replaced. Uploading applies
// immediately, like gallery photos — it does not wait for Save.
async function onCertificateUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  input.value = ''
  if (!file || !canManageCertificate.value) return

  certificateUploading.value = true
  error.value = ''
  try {
    const { upload } = await postCertificateAction({
      action: 'presign',
      contentType: file.type,
    })
    if (!upload?.uploadUrl || !upload?.publicUrl || !upload?.key) {
      throw new Error('Unable to start the upload.')
    }

    const putRes = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': upload.contentType || file.type },
      body: file,
    })
    if (!putRes.ok) throw new Error(`Upload failed for ${file.name}.`)

    const data = await postCertificateAction({
      action: 'attach',
      url: upload.publicUrl,
      key: upload.key,
    })
    productCertificate.value = mapIncomingCertificate(data.product)
    invalidateProductsCache()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to upload the certificate.'
  } finally {
    certificateUploading.value = false
  }
}

// Same bargain as photos: the object goes from S3 straight away, with no Save
// to undo it, so confirm first.
async function removeCertificate() {
  if (!canManageCertificate.value || !productCertificate.value.key || certificateBusy.value) return
  if (!window.confirm('Delete this certificate from S3? This permanently removes the file.')) return

  certificateDeleting.value = true
  error.value = ''
  try {
    const data = await postCertificateAction({ action: 'delete' })
    productCertificate.value = mapIncomingCertificate(data.product)
    invalidateProductsCache()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to delete the certificate.'
  } finally {
    certificateDeleting.value = false
  }
}

// Removal deletes the object from S3 immediately — there is no Save step to
// undo it and no copy left in the database, so confirm first.
async function removeImage(image: ProductImage) {
  if (!canManageImages.value || !image.key || imageDeletingKey.value) return
  const label = image.sku || image.key.split('/').pop() || 'this image'
  if (!window.confirm(`Delete ${label} from S3? This permanently removes the file.`)) return

  imageDeletingKey.value = image.key
  error.value = ''
  try {
    const data = await postImageAction({ action: 'delete', key: image.key })
    productImages.value = mapIncomingImages(data.product)
    productCertificate.value = mapIncomingCertificate(data.product)
    invalidateProductsCache()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to delete image.'
  } finally {
    imageDeletingKey.value = ''
  }
}

async function loadProduct() {
  if (!isInternalUser.value || !user.value?.id) return
  if (isNewProduct.value) {
    applyNewProductRoute()
    productImages.value = []
    productCertificate.value = { url: '', key: '' }
    formSnapshot.value = null
    isEditing.value = false
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  saved.value = false
  try {
    const slug = String(route.params.slug || '')
    const res = await fetch(
      `${API_BASE}/api/internal?resource=product&userId=${encodeURIComponent(user.value.id)}&slug=${encodeURIComponent(slug)}`,
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load internal product.')
    form.value = mapIncomingProduct(data.product)
    productImages.value = mapIncomingImages(data.product)
    productCertificate.value = mapIncomingCertificate(data.product)
    lastSavedSlug.value = String(data.product?.slug || slug)
    slugManuallyEdited.value = false
    formSnapshot.value = cloneForm(form.value)
    isEditing.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load internal product.'
  } finally {
    loading.value = false
  }
}

async function saveProduct() {
  if (!user.value?.id || saving.value) return
  if (!isNewProduct.value && !isEditing.value) return
  saving.value = true
  error.value = ''
  saved.value = false

  const basePayload = {
    userId: user.value.id,
    title: form.value.title,
    category: form.value.category,
    subtype: form.value.subtype,
    material: form.value.material,
    color: form.value.color,
    description: form.value.description,
    productAttributes: buildProductAttributesPayload(),
    customizationOptions: buildCustomizationOptionsPayload(),
    // Clearing the lab un-certifies the piece: the API drops the number and
    // date with it and the storefront tag disappears.
    certLab: normalizeInputValue(form.value.certLab),
    certNumber: normalizeInputValue(form.value.certNumber),
    certifiedAt: normalizeInputValue(form.value.certifiedAt),
    variantPricePaise: normalizeInputValue(form.value.variantPricePaise),
    rating: normalizeInputValue(form.value.rating),
    reviewCount: normalizeInputValue(form.value.reviewCount),
    isNewArrival: form.value.isNewArrival,
    isBestSeller: form.value.isBestSeller,
    active: form.value.active,
    // No `images` key: photos are managed directly in S3, and omitting it tells
    // the API to leave any legacy image rows on the product untouched.
    slug: form.value.slug,
  }

  const payload = isNewProduct.value
    ? basePayload
    : { ...basePayload, currentSlug: lastSavedSlug.value }

  try {
    const res = await fetch(`${API_BASE}/api/internal?resource=product`, {
      method: isNewProduct.value ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to save product.')
    invalidateProductsCache()
    form.value = mapIncomingProduct(data.product)
    productImages.value = mapIncomingImages(data.product)
    productCertificate.value = mapIncomingCertificate(data.product)
    formSnapshot.value = cloneForm(form.value)
    saved.value = true
    lastSavedSlug.value = form.value.slug
    if (!isNewProduct.value) isEditing.value = false
    if (isNewProduct.value || String(route.params.slug || '') !== form.value.slug) {
      await router.replace(`/internal/products/${form.value.slug}`)
    }
    setTimeout(() => {
      saved.value = false
    }, 2000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to save product.'
  } finally {
    saving.value = false
  }
}

async function generateAiDescription() {
  if (!user.value?.id || !form.value.slug || generatingAiDescription.value) return
  generatingAiDescription.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE}/api/internal?resource=product`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value.id,
        currentSlug: lastSavedSlug.value || form.value.slug,
        action: 'generate-ai-description',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to generate AI description.')
    invalidateProductsCache()
    form.value = mapIncomingProduct(data.product)
    productImages.value = mapIncomingImages(data.product)
    productCertificate.value = mapIncomingCertificate(data.product)
    formSnapshot.value = cloneForm(form.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to generate AI description.'
  } finally {
    generatingAiDescription.value = false
  }
}

onMounted(() => {
  if (!isInternalUser.value) {
    router.replace('/')
    return
  }
  void loadProduct()
})

watch(
  () => route.params.slug,
  (slug) => {
    if (!isInternalUser.value) return
    if (String(slug || '') === 'new') applyNewProductRoute()
    else void loadProduct()
  },
)

watch(
  () => form.value.title,
  (title) => {
    if (!isNewProduct.value || slugManuallyEdited.value) return
    form.value.slug = toSlug(title)
  },
)
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-6 sm:ect-pt-14 ect-pb-16">
    <div class="ect-max-w-7xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <input
        ref="imageUploadInput"
        type="file"
        accept="image/*"
        multiple
        class="ect-hidden"
        @change="onImageUploadChange"
      />

      <input
        ref="certificateUploadInput"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        class="ect-hidden"
        @change="onCertificateUploadChange"
      />

      <header class="ect-flex ect-flex-col sm:ect-flex-row sm:ect-items-end sm:ect-justify-between ect-gap-4 ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5 ect-mb-6">
        <div>
          <div
            v-if="loading && !isNewProduct"
            class="ect-h-5 ect-w-28 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-4"
          ></div>
          <RouterLink
            v-else
            :to="{ path: '/internal', query: { tab: 'products' } }"
            class="ect-inline-flex ect-items-center ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline ect-mb-4"
          >
            Back to products
          </RouterLink>
          <template v-if="loading && !isNewProduct">
            <div class="ect-h-3 ect-w-20 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-3"></div>
            <div class="ect-h-10 ect-w-[min(26rem,80vw)] ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
            <div class="ect-mt-2 ect-h-4 ect-w-[min(22rem,76vw)] ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
          </template>
          <template v-else>
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-rose-600 ect-mb-2">
              {{ isNewProduct ? 'New product' : fieldsEditable ? 'Editing product' : 'Product' }}
            </p>
            <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">
              {{ isNewProduct ? 'Create product' : form.title || 'Product detail' }}
            </h1>
            <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">
              {{
                isNewProduct
                  ? 'Set slug, details, and price, then create.'
                  : fieldsEditable
                    ? 'Update fields, price, or gallery, then save.'
                    : 'Review details. Use Edit to change this product.'
              }}
            </p>
          </template>
        </div>
        <div class="ect-flex ect-shrink-0 ect-flex-wrap ect-items-center ect-justify-end ect-gap-2">
          <div
            v-if="loading && !isNewProduct"
            class="ect-h-10 ect-w-20 ect-rounded-full ect-bg-rose-100 ect-animate-pulse"
          ></div>
          <template v-if="!loading && !isNewProduct">
            <template v-if="!fieldsEditable">
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/20 ect-bg-white ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/80 hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors disabled:ect-opacity-60 disabled:ect-cursor-wait"
                :disabled="generatingAiDescription || !productImages.length"
                @click="generateAiDescription"
              >
                {{ generatingAiDescription ? 'Running...' : 'Run Through AI' }}
              </button>
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/20 ect-bg-white ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors"
                @click="startEdit"
              >
                Edit
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/20 ect-bg-white ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/80 hover:ect-bg-rose-50 ect-transition-colors"
                :disabled="saving"
                @click="cancelEdit"
              >
                Cancel
              </button>
              <button
                type="button"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-rose-700 ect-transition-colors"
                :disabled="saving"
                @click="saveProduct"
              >
                {{ saving ? 'Saving...' : saved ? 'Saved' : 'Save changes' }}
              </button>
            </template>
          </template>
          <button
            v-if="!loading && isNewProduct"
            type="button"
            class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-rose-700 ect-transition-colors"
            :disabled="saving"
            @click="saveProduct"
          >
            {{
              saving ? 'Creating...' : saved ? 'Created' : 'Create product'
            }}
          </button>
        </div>
      </header>

      <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>

      <div v-if="loading" class="ect-grid xl:ect-grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] ect-gap-5">
        <section class="ect-space-y-5">
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-h-4 ect-w-24 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-5"></div>
            <div class="ect-grid md:ect-grid-cols-2 ect-gap-4">
              <div v-for="index in fieldSkeletonRows" :key="index">
                <div class="ect-h-3 ect-w-24 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-2"></div>
                <div class="ect-h-10 ect-rounded-lg ect-bg-rose-50 ect-animate-pulse"></div>
              </div>
            </div>
            <div class="ect-mt-4">
              <div class="ect-h-3 ect-w-24 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-2"></div>
              <div class="ect-h-32 ect-rounded-lg ect-bg-rose-50 ect-animate-pulse"></div>
            </div>
          </article>
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-h-4 ect-w-32 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-5"></div>
            <div class="ect-space-y-4">
              <div v-for="index in 2" :key="index" class="ect-grid lg:ect-grid-cols-[120px_minmax(0,1fr)] ect-gap-4 ect-rounded-lg ect-border ect-border-rose-100 ect-p-4">
                <div class="ect-aspect-square ect-rounded-lg ect-bg-rose-50 ect-animate-pulse"></div>
                <div class="ect-space-y-3">
                  <div class="ect-h-10 ect-rounded-lg ect-bg-rose-50 ect-animate-pulse"></div>
                  <div class="ect-h-10 ect-rounded-lg ect-bg-rose-50 ect-animate-pulse"></div>
                  <div class="ect-h-8 ect-w-44 ect-rounded-full ect-bg-rose-100 ect-animate-pulse"></div>
                </div>
              </div>
            </div>
          </article>
        </section>
        <aside class="ect-space-y-5">
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-h-4 ect-w-20 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-4"></div>
            <div class="ect-aspect-square ect-rounded-lg ect-bg-rose-50 ect-animate-pulse"></div>
            <div class="ect-mt-4 ect-space-y-3">
              <div class="ect-h-7 ect-w-48 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
              <div class="ect-h-4 ect-w-36 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
              <div class="ect-h-16 ect-rounded ect-bg-rose-50 ect-animate-pulse"></div>
            </div>
          </article>
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-h-4 ect-w-24 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-4"></div>
            <div class="ect-space-y-3">
              <div class="ect-h-10 ect-rounded-full ect-bg-rose-50 ect-animate-pulse"></div>
              <div class="ect-h-10 ect-rounded-full ect-bg-rose-50 ect-animate-pulse"></div>
            </div>
          </article>
        </aside>
      </div>

      <div v-if="!loading && fieldsEditable" class="ect-grid xl:ect-grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] ect-gap-5">
        <section class="ect-space-y-5">
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Core fields</h2>
            <div class="ect-grid md:ect-grid-cols-2 ect-gap-4">
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Title</span>
                <input
                  v-model="form.title"
                  type="text"
                  :readonly="!fieldsEditable"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                />
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Slug</span>
                <input
                  v-model="form.slug"
                  type="text"
                  :readonly="!fieldsEditable"
                  placeholder="auto-generated-from-title"
                  @input="handleSlugInput"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                />
                <span v-if="isNewProduct && !slugManuallyEdited" class="ect-mt-1 ect-block ect-font-body ect-text-[11px] ect-text-charcoal/40">Auto-generated from title.</span>
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Category</span>
                <select
                  v-model="form.category"
                  :disabled="!fieldsEditable"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                >
                  <option value="" disabled>Select category</option>
                  <option v-for="category in CATEGORIES" :key="category" :value="category">{{ category }}</option>
                </select>
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Subtype</span>
                <select
                  v-model="form.subtype"
                  :disabled="!fieldsEditable"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                >
                  <option value="">Unspecified</option>
                  <option v-for="subtype in subtypeOptions" :key="subtype.value" :value="subtype.value">{{ subtype.label }}</option>
                </select>
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Material</span>
                <select
                  v-model="form.material"
                  :disabled="!fieldsEditable"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                >
                  <option value="" disabled>Select material</option>
                  <option v-for="material in materialOptions" :key="material.value" :value="material.value">{{ material.label }}</option>
                </select>
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Color</span>
                <select
                  v-model="form.color"
                  :disabled="!fieldsEditable"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                >
                  <option value="" disabled>Select color</option>
                  <option v-for="color in COLORS" :key="color.id" :value="color.id">{{ color.label }}</option>
                </select>
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Price (USD)</span>
                <input
                  v-model="form.variantPricePaise"
                  type="number"
                  min="0"
                  :readonly="!fieldsEditable"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                />
              </label>
            </div>

            <section class="ect-mt-5 ect-rounded-lg ect-border ect-border-rose-100 ect-bg-white ect-p-4">
              <div class="ect-mb-4">
                <h3 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Product attributes</h3>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">Use these actual product values for the details section and stronger product search.</p>
              </div>

              <div class="ect-grid md:ect-grid-cols-2 ect-gap-4">
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Gross weight</span>
                  <input
                    v-model="form.grossWeight"
                    type="text"
                    placeholder="4.55 gms"
                    :readonly="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                  />
                </label>
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Diamond carats</span>
                  <input
                    v-model="form.diamondCarats"
                    type="text"
                    placeholder="0.725 cts"
                    :readonly="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                  />
                </label>
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Diamond quantity</span>
                  <input
                    v-model="form.diamondQuantity"
                    type="text"
                    placeholder="86"
                    :readonly="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                  />
                </label>
              </div>
            </section>

            <label class="ect-block ect-mt-4">
              <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Description</span>
              <textarea
                v-model="form.description"
                rows="5"
                :readonly="!fieldsEditable"
                :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
              />
            </label>

            <section class="ect-mt-5 ect-rounded-lg ect-border ect-border-rose-100 ect-bg-rose-50/30 ect-p-4">
              <div class="ect-mb-4">
                <h3 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Customization options</h3>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">These fields power the customer-facing customizable details section and the options shown in the customize card.</p>
              </div>

              <div class="ect-grid md:ect-grid-cols-2 ect-gap-4">
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Diamond quality</span>
                  <select
                    v-model="form.diamondQuality"
                    :disabled="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : 'ect-bg-white']"
                  >
                    <option value="">None</option>
                    <option v-for="quality in DIAMOND_QUALITY_OPTIONS" :key="quality" :value="quality">{{ quality }}</option>
                  </select>
                </label>
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Metal purity</span>
                  <select
                    v-model="form.metalPurity"
                    :disabled="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : 'ect-bg-white']"
                  >
                    <option value="">None</option>
                    <option v-for="purity in METAL_PURITY_OPTIONS" :key="purity" :value="purity">{{ purity }}</option>
                  </select>
                </label>
                <label v-if="supportsCenterStoneFields" class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Stone types</span>
                  <input
                    v-model="form.stoneTypes"
                    type="text"
                    placeholder="Natural Diamond, Moissanite, Ruby"
                    :readonly="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                  />
                  <span class="ect-mt-1 ect-block ect-font-body ect-text-[11px] ect-text-charcoal/40">Comma-separated stone types, e.g. Natural Diamond, Moissanite, Ruby</span>
                </label>
                <label v-if="supportsCenterStoneFields" class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Center shape</span>
                  <select
                    v-model="form.centerShape"
                    :disabled="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : 'ect-bg-white']"
                  >
                    <option value="">None</option>
                    <option v-for="shape in CENTER_SHAPE_OPTIONS" :key="shape" :value="shape">{{ shape }}</option>
                  </select>
                </label>
                <label v-if="supportsCenterStoneFields" class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Center stone sizes</span>
                  <input
                    v-model="form.centerStoneSizes"
                    type="text"
                    placeholder="6 mm, 7 mm, 8 mm"
                    :readonly="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                  />
                  <span class="ect-mt-1 ect-block ect-font-body ect-text-[11px] ect-text-charcoal/40">Comma-separated dimensions, e.g. 6 mm, 7 mm, 8 mm</span>
                </label>
                <label v-if="isRingCategory" class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Ring size</span>
                  <select
                    v-model="form.ringSize"
                    :disabled="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : 'ect-bg-white']"
                  >
                    <option value="">None</option>
                    <option v-for="size in RING_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
                  </select>
                </label>
                <label v-if="isBangleLikeProduct" class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Bangle size</span>
                  <select
                    v-model="form.bangleSize"
                    :disabled="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : 'ect-bg-white']"
                  >
                    <option value="">None</option>
                    <option v-for="size in BANGLE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
                  </select>
                </label>
                <label v-if="isNecklaceCategory" class="ect-block md:ect-col-span-2">
                  <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Necklace size</span>
                  <select
                    v-model="form.necklaceSize"
                    :disabled="!fieldsEditable"
                    :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : 'ect-bg-white']"
                  >
                    <option value="">None</option>
                    <option v-for="size in NECKLACE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
                  </select>
                </label>
              </div>

              <label v-if="supportsCenterStoneFields" class="ect-mt-4 ect-inline-flex ect-items-center ect-gap-2 ect-rounded-lg ect-border ect-border-charcoal/10 ect-bg-white ect-px-3 ect-py-2.5" :class="{ 'ect-opacity-80': !fieldsEditable }">
                <input v-model="form.allowCustomCenterStoneSize" type="checkbox" class="ect-h-4 ect-w-4" :disabled="!fieldsEditable" />
                <span class="ect-font-body ect-text-sm ect-text-charcoal">Allow manual center stone size entry</span>
              </label>

              <label v-if="supportsCenterStoneFields" class="ect-mt-4 ect-ml-0 sm:ect-ml-3 ect-inline-flex ect-items-center ect-gap-2 ect-rounded-lg ect-border ect-border-charcoal/10 ect-bg-white ect-px-3 ect-py-2.5" :class="{ 'ect-opacity-80': !fieldsEditable }">
                <input v-model="form.allowCustomStoneType" type="checkbox" class="ect-h-4 ect-w-4" :disabled="!fieldsEditable" />
                <span class="ect-font-body ect-text-sm ect-text-charcoal">Allow manual stone type entry</span>
              </label>
            </section>

            <div class="ect-grid sm:ect-grid-cols-3 ect-gap-3 ect-mt-4">
              <label class="ect-flex ect-items-center ect-gap-2 ect-rounded-lg ect-border ect-border-charcoal/10 ect-bg-rose-50/50 ect-px-3 ect-py-2.5" :class="{ 'ect-opacity-80': !fieldsEditable }">
                <input v-model="form.active" type="checkbox" class="ect-h-4 ect-w-4" :disabled="!fieldsEditable" />
                <span class="ect-font-body ect-text-sm ect-text-charcoal">Active</span>
              </label>
              <label class="ect-flex ect-items-center ect-gap-2 ect-rounded-lg ect-border ect-border-charcoal/10 ect-bg-rose-50/50 ect-px-3 ect-py-2.5" :class="{ 'ect-opacity-80': !fieldsEditable }">
                <input v-model="form.isNewArrival" type="checkbox" class="ect-h-4 ect-w-4" :disabled="!fieldsEditable" />
                <span class="ect-font-body ect-text-sm ect-text-charcoal">New arrival</span>
              </label>
              <label class="ect-flex ect-items-center ect-gap-2 ect-rounded-lg ect-border ect-border-charcoal/10 ect-bg-rose-50/50 ect-px-3 ect-py-2.5" :class="{ 'ect-opacity-80': !fieldsEditable }">
                <input v-model="form.isBestSeller" type="checkbox" class="ect-h-4 ect-w-4" :disabled="!fieldsEditable" />
                <span class="ect-font-body ect-text-sm ect-text-charcoal">Best seller</span>
              </label>
            </div>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-mb-4">
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">AI description</h2>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">Generated from product images and stored separately from the manual description.</p>
            </div>
            <textarea
              :value="form.aiDescription || 'AI description will be generated from product images.'"
              rows="5"
              readonly
              class="ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-charcoal/[0.04] ect-px-3 ect-py-2.5 ect-font-body ect-text-sm ect-text-charcoal/85 focus:ect-outline-none"
            />
            <p class="ect-mt-2 ect-font-body ect-text-[11px] ect-text-charcoal/40">Manual description stays separate. Regenerate anytime from the header action.</p>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-flex ect-items-center ect-justify-between ect-gap-3 ect-mb-4">
              <div>
                <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Gallery images</h2>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-1">
                  Stored in this product's S3 folder and shown on the storefront in this order.
                  Uploads and removals apply to S3 immediately — they don't wait for Save.
                </p>
              </div>
              <div class="ect-flex ect-shrink-0 ect-flex-wrap ect-items-center ect-justify-end ect-gap-2">
                <button
                  type="button"
                  class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-white hover:ect-bg-rose-700 ect-transition-colors disabled:ect-cursor-not-allowed disabled:ect-opacity-50"
                  :disabled="!canManageImages || imageUploadProcessing"
                  @click="openImageUpload"
                >
                  {{ imageUploadProcessing ? 'Uploading...' : 'Upload images' }}
                </button>
              </div>
            </div>

            <p
              v-if="!canManageImages"
              class="ect-rounded-lg ect-border ect-border-dashed ect-border-charcoal/15 ect-p-6 ect-text-center ect-font-body ect-text-sm ect-text-charcoal/45"
            >
              Save the product first. Its S3 folder is named after the slug, so images can only be
              uploaded once the slug is final.
            </p>

            <div v-else-if="productImages.length" class="ect-grid ect-grid-cols-2 sm:ect-grid-cols-3 lg:ect-grid-cols-4 ect-gap-3">
              <figure v-for="image in productImages" :key="image.key || image.url" class="ect-rounded-lg ect-border ect-border-rose-100 ect-overflow-hidden">
                <div class="ect-relative ect-aspect-square ect-bg-charcoal/5">
                  <img :src="image.url" :alt="image.sku || form.title" loading="lazy" class="ect-h-full ect-w-full ect-object-cover" />
                  <button
                    type="button"
                    class="ect-absolute ect-top-1.5 ect-right-1.5 ect-rounded-full ect-bg-white/90 ect-px-2.5 ect-py-1 ect-font-body ect-text-[10px] ect-font-semibold ect-text-red-700 ect-shadow-sm hover:ect-bg-red-50 ect-transition-colors disabled:ect-cursor-wait disabled:ect-opacity-60"
                    :disabled="Boolean(imageDeletingKey)"
                    :aria-label="`Delete ${image.sku || 'image'} from S3`"
                    @click="removeImage(image)"
                  >
                    {{ imageDeletingKey === image.key ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
                <figcaption v-if="image.sku" class="ect-px-2 ect-py-1.5 ect-font-body ect-text-[11px] ect-text-charcoal/55 ect-truncate">{{ image.sku }}</figcaption>
              </figure>
            </div>

            <p v-else class="ect-rounded-lg ect-border ect-border-dashed ect-border-charcoal/15 ect-p-6 ect-text-center ect-font-body ect-text-sm ect-text-charcoal/45">
              No images yet. The first upload creates this product's folder in S3.
            </p>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-mb-4">
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Certification</h2>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">
                Setting a lab tags this piece as certified on the storefront — the tag appears on its
                photos and the report is linked from the product page. Clearing the lab removes both.
              </p>
            </div>

            <div class="ect-grid md:ect-grid-cols-3 ect-gap-4">
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Certifying lab</span>
                <select
                  v-model="form.certLab"
                  :disabled="!fieldsEditable"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : 'ect-bg-white']"
                >
                  <option value="">Not certified</option>
                  <option v-for="lab in CERT_LAB_OPTIONS" :key="lab" :value="lab">{{ lab }}</option>
                </select>
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Certificate no.</span>
                <input
                  v-model="form.certNumber"
                  type="text"
                  :disabled="!fieldsEditable || !form.certLab"
                  placeholder="e.g. 2141438171"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable || !form.certLab ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                />
                <span class="ect-mt-1 ect-block ect-font-body ect-text-[11px] ect-text-charcoal/40">Shown on the product page.</span>
              </label>
              <label class="ect-block">
                <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Certified on</span>
                <input
                  v-model="form.certifiedAt"
                  type="date"
                  :disabled="!fieldsEditable || !form.certLab"
                  :class="['ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2.5 ect-font-body ect-text-sm focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-rose-300/40', !fieldsEditable || !form.certLab ? 'ect-bg-charcoal/[0.04] ect-text-charcoal/90' : '']"
                />
                <span class="ect-mt-1 ect-block ect-font-body ect-text-[11px] ect-text-charcoal/40">Internal record only.</span>
              </label>
            </div>

            <div class="ect-mt-4">
              <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-2">Certificate file</p>

              <p
                v-if="!canManageCertificate"
                class="ect-rounded-lg ect-border ect-border-dashed ect-border-charcoal/15 ect-p-6 ect-text-center ect-font-body ect-text-sm ect-text-charcoal/45"
              >
                Save the product first. Certificates are filed under the slug, so one can only be
                uploaded once the slug is final.
              </p>

              <div
                v-else-if="productCertificate.url"
                class="ect-flex ect-flex-wrap ect-items-center ect-justify-between ect-gap-3 ect-rounded-lg ect-border ect-border-rose-100 ect-bg-rose-50/40 ect-px-4 ect-py-3"
              >
                <a
                  :href="productCertificate.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="ect-min-w-0 ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-underline ect-truncate"
                >
                  {{ certificateFileName || 'View certificate' }}
                </a>
                <div class="ect-flex ect-shrink-0 ect-items-center ect-gap-2">
                  <button
                    type="button"
                    class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors disabled:ect-cursor-not-allowed disabled:ect-opacity-50"
                    :disabled="certificateBusy"
                    @click="openCertificateUpload"
                  >
                    {{ certificateUploading ? 'Uploading...' : 'Replace' }}
                  </button>
                  <button
                    type="button"
                    class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-white ect-border ect-border-red-200 ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-red-700 hover:ect-bg-red-50 ect-transition-colors disabled:ect-cursor-not-allowed disabled:ect-opacity-50"
                    :disabled="certificateBusy"
                    @click="removeCertificate"
                  >
                    {{ certificateDeleting ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
              </div>

              <div
                v-else
                class="ect-flex ect-flex-col ect-items-center ect-gap-3 ect-rounded-lg ect-border ect-border-dashed ect-border-charcoal/15 ect-p-6 ect-text-center"
              >
                <p class="ect-font-body ect-text-sm ect-text-charcoal/45">
                  No certificate on file. PDF, JPG, PNG, or WEBP.
                </p>
                <button
                  type="button"
                  class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-white hover:ect-bg-rose-700 ect-transition-colors disabled:ect-cursor-not-allowed disabled:ect-opacity-50"
                  :disabled="certificateBusy"
                  @click="openCertificateUpload"
                >
                  {{ certificateUploading ? 'Uploading...' : 'Upload certificate' }}
                </button>
              </div>

              <p class="ect-mt-2 ect-font-body ect-text-[11px] ect-text-charcoal/40">
                Uploads and removals apply to S3 immediately — they don't wait for Save.
              </p>
            </div>
          </article>
        </section>

        <aside class="ect-space-y-5">
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Preview</h2>
            <div v-if="previewImages.length" class="ect-space-y-3">
              <figure class="ect-relative ect-aspect-square ect-rounded-lg ect-overflow-hidden ect-bg-charcoal/5">
                <img :src="previewImages[activePreviewImage]?.url" :alt="previewImages[activePreviewImage]?.sku || form.title" class="ect-h-full ect-w-full ect-object-cover" />
                <span v-if="previewImages.length > 1" class="ect-absolute ect-top-2 ect-left-2 ect-inline-flex ect-items-center ect-rounded-full ect-bg-white/88 ect-px-2.5 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-text-charcoal ect-shadow-sm">
                  {{ activePreviewImage + 1 }} / {{ previewImages.length }}
                </span>
              </figure>
              <ul v-if="previewImages.length > 1" class="ect-flex ect-gap-2 ect-list-none ect-m-0 ect-p-0 ect-overflow-x-auto">
                <li v-for="(image, idx) in previewImages" :key="`${image.url}-${image.sortOrder}`" class="ect-shrink-0">
                  <button type="button" @click="setPreviewImage(idx)" :aria-current="activePreviewImage === idx ? 'true' : undefined"
                    class="ect-h-16 ect-w-16 ect-rounded-lg ect-overflow-hidden ect-border-2 ect-transition focus:ect-outline-none focus-visible:ect-ring-2 focus-visible:ect-ring-rose-300"
                    :class="activePreviewImage === idx ? 'ect-border-rose-400 ect-shadow-sm' : 'ect-border-charcoal/10 ect-opacity-75 hover:ect-opacity-100'">
                    <img :src="image.url" :alt="image.sku || form.title" loading="lazy" class="ect-h-full ect-w-full ect-object-cover" />
                  </button>
                </li>
              </ul>
            </div>
            <div v-else class="ect-flex ect-aspect-square ect-items-center ect-justify-center ect-rounded-lg ect-bg-charcoal/5 ect-font-body ect-text-sm ect-text-charcoal/35">
              Image preview
            </div>
            <div class="ect-mt-4">
              <p class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">{{ form.title || 'Untitled product' }}</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">{{ form.category || 'Category' }} · {{ form.material || 'Material' }}</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/70 ect-mt-3">{{ form.description || 'Description preview will appear here.' }}</p>
            </div>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Quick links</h2>
            <div class="ect-flex ect-flex-col ect-gap-3">
              <RouterLink
                v-if="form.slug"
                :to="`/product/${form.slug}`"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors"
              >
                Open customer page
              </RouterLink>
              <RouterLink
                :to="{ path: '/internal', query: { tab: 'products' } }"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors"
              >
                Back to products list
              </RouterLink>
            </div>
          </article>
        </aside>
      </div>

      <div v-else-if="!loading" class="ect-grid xl:ect-grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] ect-gap-5">
        <section class="ect-space-y-5">
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Core fields</h2>
            <dl class="ect-grid md:ect-grid-cols-2 ect-gap-x-6 ect-gap-y-4">
              <div v-for="row in coreDisplayRows" :key="row.label" class="ect-min-w-0">
                <dt class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1.5">{{ row.label }}</dt>
                <dd class="ect-font-body ect-text-sm ect-leading-6 ect-text-charcoal ect-break-words">{{ row.value }}</dd>
              </div>
            </dl>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-mb-4">
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Product attributes</h2>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">These values appear in the product details section and improve search quality.</p>
            </div>
            <dl class="ect-grid md:ect-grid-cols-2 ect-gap-x-6 ect-gap-y-4">
              <div v-for="row in attributeDisplayRows" :key="row.label">
                <dt class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1.5">{{ row.label }}</dt>
                <dd class="ect-font-body ect-text-sm ect-leading-6 ect-text-charcoal">{{ row.value }}</dd>
              </div>
            </dl>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Description</h2>
            <p class="ect-font-body ect-text-sm ect-leading-7 ect-text-charcoal/80 ect-whitespace-pre-wrap">
              {{ displayValue(form.description, 'No manual description added yet.') }}
            </p>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-mb-4">
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Customization options</h2>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">These values power the customer-facing customizable details section and the customize card.</p>
            </div>
            <dl class="ect-grid md:ect-grid-cols-2 ect-gap-x-6 ect-gap-y-4">
              <div v-for="row in customizationDisplayRows" :key="row.label">
                <dt class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1.5">{{ row.label }}</dt>
                <dd class="ect-font-body ect-text-sm ect-leading-6 ect-text-charcoal ect-break-words">{{ row.value }}</dd>
              </div>
            </dl>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Status</h2>
            <dl class="ect-grid sm:ect-grid-cols-3 ect-gap-x-6 ect-gap-y-4">
              <div v-for="row in statusDisplayRows" :key="row.label">
                <dt class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1.5">{{ row.label }}</dt>
                <dd class="ect-font-body ect-text-sm ect-leading-6 ect-text-charcoal">{{ row.value }}</dd>
              </div>
            </dl>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-mb-4">
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">AI description</h2>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">Generated from product images and stored separately from the manual description.</p>
            </div>
            <p class="ect-font-body ect-text-sm ect-leading-7 ect-text-charcoal/75 ect-whitespace-pre-wrap">
              {{ displayValue(form.aiDescription, 'AI description will be generated from product images.') }}
            </p>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-flex ect-items-center ect-justify-between ect-gap-3 ect-mb-4">
              <div>
                <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Gallery images</h2>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-1">
                  Read from this product's S3 folder, in storefront display order. Use Edit to upload
                  or remove photos.
                </p>
              </div>
            </div>

            <div v-if="productImages.length" class="ect-grid ect-grid-cols-2 sm:ect-grid-cols-3 lg:ect-grid-cols-4 ect-gap-3">
              <figure v-for="image in productImages" :key="image.key || image.url" class="ect-rounded-lg ect-border ect-border-rose-100 ect-overflow-hidden">
                <div class="ect-aspect-square ect-bg-charcoal/5">
                  <img :src="image.url" :alt="image.sku || form.title" loading="lazy" class="ect-h-full ect-w-full ect-object-cover" />
                </div>
                <figcaption v-if="image.sku" class="ect-px-2 ect-py-1.5 ect-font-body ect-text-[11px] ect-text-charcoal/55 ect-truncate">{{ image.sku }}</figcaption>
              </figure>
            </div>

            <p v-else class="ect-rounded-lg ect-border ect-border-dashed ect-border-charcoal/15 ect-p-6 ect-text-center ect-font-body ect-text-sm ect-text-charcoal/45">
              No images in S3 yet. Use Edit to upload the first one.
            </p>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <div class="ect-mb-4">
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Certification</h2>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1">
                A certifying lab tags this piece on the storefront and links its report. Use Edit to
                change the lab or upload the certificate.
              </p>
            </div>
            <dl class="ect-grid md:ect-grid-cols-2 ect-gap-x-6 ect-gap-y-4">
              <div v-for="row in certificationDisplayRows" :key="row.label" class="ect-min-w-0">
                <dt class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45 ect-mb-1.5">{{ row.label }}</dt>
                <dd class="ect-font-body ect-text-sm ect-leading-6 ect-text-charcoal ect-break-words">{{ row.value }}</dd>
              </div>
            </dl>
            <a
              v-if="productCertificate.url"
              :href="productCertificate.url"
              target="_blank"
              rel="noopener noreferrer"
              class="ect-mt-4 ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/75 hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors"
            >
              Open certificate
            </a>
          </article>
        </section>

        <aside class="ect-space-y-5">
          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Preview</h2>
            <div v-if="previewImages.length" class="ect-space-y-3">
              <figure class="ect-relative ect-aspect-square ect-rounded-lg ect-overflow-hidden ect-bg-charcoal/5">
                <img :src="previewImages[activePreviewImage]?.url" :alt="previewImages[activePreviewImage]?.sku || form.title" class="ect-h-full ect-w-full ect-object-cover" />
                <span v-if="previewImages.length > 1" class="ect-absolute ect-top-2 ect-left-2 ect-inline-flex ect-items-center ect-rounded-full ect-bg-white/88 ect-px-2.5 ect-py-1 ect-font-body ect-text-[11px] ect-font-semibold ect-text-charcoal ect-shadow-sm">
                  {{ activePreviewImage + 1 }} / {{ previewImages.length }}
                </span>
              </figure>
              <ul v-if="previewImages.length > 1" class="ect-flex ect-gap-2 ect-list-none ect-m-0 ect-p-0 ect-overflow-x-auto">
                <li v-for="(image, idx) in previewImages" :key="`${image.url}-${image.sortOrder}`" class="ect-shrink-0">
                  <button type="button" @click="setPreviewImage(idx)" :aria-current="activePreviewImage === idx ? 'true' : undefined"
                    class="ect-h-16 ect-w-16 ect-rounded-lg ect-overflow-hidden ect-border-2 ect-transition focus:ect-outline-none focus-visible:ect-ring-2 focus-visible:ect-ring-rose-300"
                    :class="activePreviewImage === idx ? 'ect-border-rose-400 ect-shadow-sm' : 'ect-border-charcoal/10 ect-opacity-75 hover:ect-opacity-100'">
                    <img :src="image.url" :alt="image.sku || form.title" loading="lazy" class="ect-h-full ect-w-full ect-object-cover" />
                  </button>
                </li>
              </ul>
            </div>
            <div v-else class="ect-flex ect-aspect-square ect-items-center ect-justify-center ect-rounded-lg ect-bg-charcoal/5 ect-font-body ect-text-sm ect-text-charcoal/35">
              Image preview
            </div>
            <div class="ect-mt-4">
              <p class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">{{ form.title || 'Untitled product' }}</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">{{ form.category || 'Category' }} · {{ form.material || 'Material' }}</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/70 ect-mt-3">{{ form.description || 'Description preview will appear here.' }}</p>
            </div>
          </article>

          <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-4">Quick links</h2>
            <div class="ect-flex ect-flex-col ect-gap-3">
              <RouterLink
                v-if="form.slug"
                :to="`/product/${form.slug}`"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors"
              >
                Open customer page
              </RouterLink>
              <RouterLink
                :to="{ path: '/internal', query: { tab: 'products' } }"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-rose-300 hover:ect-text-rose-700 ect-transition-colors"
              >
                Back to products list
              </RouterLink>
            </div>
          </article>
        </aside>
      </div>
    </div>
  </section>
</template>
