<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import type { ServiceOffering } from '../data/services-catalog'
import { useSavedAddresses, COUNTRY_OPTIONS, countryDisplayName } from '../composables/useSavedAddresses'
import UiSelect from './UiSelect.vue'
import SavedAddressSelector from './SavedAddressSelector.vue'
import SavedAddressSavePanel from './SavedAddressSavePanel.vue'
import { notifyTransaction } from '../composables/notifyTransactionEmail'
import { createServiceRequest, uploadServiceFile } from '../composables/useServiceRequests'

const props = defineProps<{ open: boolean; service: ServiceOffering | null }>()
const emit = defineEmits<{ close: [] }>()

const { addresses: savedAddresses, defaultAddress, getById, save: saveAddress } = useSavedAddresses()
const knownCountryCodes = new Set<string>(COUNTRY_OPTIONS.map((c) => c.code))
const countrySelectOptions = COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: c.name }))
const selectedSavedId = ref('')
const shouldSaveAddress = ref(true)
const saveAsLabel = ref('')
const makeDefaultAddress = ref(false)

const bookingStep = ref(1)
const bookingRef = ref('')
const formErrors = ref<string[]>([])

const INITIAL_FORM = {
  jewelleryType: '',
  inspirationFileName: '',
  designDesc: '',
  metal: '',
  budget: '',
  occasion: '',
  dimensions: '',
  hasCadFile: '',
  waxCadFileName: '',
  waxNotes: '',
  castingSource: '',
  castingDesc: '',
  castingWeight: '',
  castingMetal: '',
  purity: '',
  quantity: '1',
  finishType: '',
  stoneRequired: '',
  stoneDetails: '',
  stoneSupply: '',
  finalNotes: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  country: 'IN',
  pincode: '',
  additionalNotes: '',
  neededBy: '',
}

const form = reactive({ ...INITIAL_FORM })
const inspirationPreview = ref<string | null>(null)
const inspirationFile = ref<File | null>(null)
const waxCadFile = ref<File | null>(null)
const submitting = ref(false)

const CAD_FILE_MAX_BYTES = 50 * 1024 * 1024
const CAD_FILE_NAME_PATTERN = /\.(stl|stp|step|obj|iges|igs|3dm|dwg|dxf|zip)$/i
const INSPIRATION_MAX_BYTES = 10 * 1024 * 1024
const INSPIRATION_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/

function requestClose() {
  if (submitting.value) return
  emit('close')
}

function handleInspirationFile(e: Event) {
  const target = e.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  formErrors.value = []
  if (!INSPIRATION_TYPES.has(String(file.type).toLowerCase())) {
    formErrors.value.push('Use a JPG, PNG, or WEBP photo.')
    if (target) target.value = ''
    return
  }
  if (file.size > INSPIRATION_MAX_BYTES) {
    formErrors.value.push('Photo must be 10 MB or smaller.')
    if (target) target.value = ''
    return
  }
  form.inspirationFileName = file.name
  inspirationFile.value = file
  const reader = new FileReader()
  reader.onload = (ev) => {
    inspirationPreview.value = ev.target?.result as string
  }
  reader.readAsDataURL(file)
}

function removeInspirationFile() {
  form.inspirationFileName = ''
  inspirationPreview.value = null
  inspirationFile.value = null
  ;['inspiration-upload', 'inspiration-upload-wax', 'inspiration-upload-final'].forEach((id) => {
    const input = document.getElementById(id) as HTMLInputElement | null
    if (input) input.value = ''
  })
}

function removeWaxCadFile() {
  form.waxCadFileName = ''
  waxCadFile.value = null
  const input = document.getElementById('wax-cad-upload') as HTMLInputElement | null
  if (input) input.value = ''
}

function handleWaxCadFile(e: Event) {
  const target = e.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  formErrors.value = []
  if (file.size > CAD_FILE_MAX_BYTES) {
    formErrors.value.push('CAD file must be 50 MB or smaller.')
    if (target) target.value = ''
    return
  }
  if (!CAD_FILE_NAME_PATTERN.test(file.name)) {
    formErrors.value.push('Use a CAD file (.stl, .step, .obj, .iges, .3dm, .dwg, .dxf, or .zip).')
    if (target) target.value = ''
    return
  }
  form.waxCadFileName = file.name
  waxCadFile.value = file
}

function onSelectWaxCadOption(opt: string) {
  form.hasCadFile = opt
  if (opt === 'Yes, I have a CAD file') removeInspirationFile()
  else removeWaxCadFile()
}

function onSelectCastingSource(opt: string) {
  form.castingSource = opt
  if (opt !== CASTING_SOURCE_CAD) removeWaxCadFile()
}

// Which purities make sense for which metal — 'Other' is always allowed.
function purityMatchesMetal(purity: string, metal: string): boolean {
  if (!purity || !metal || purity === 'Other') return true
  if (['18k', '22k', '24k'].includes(purity)) {
    return ['Yellow Gold', 'White Gold', 'Rose Gold'].includes(metal)
  }
  if (purity === '925 Silver') return metal === 'Silver'
  if (purity === '950 Platinum') return metal === 'Platinum'
  return true
}

function validateStep1(): boolean {
  formErrors.value = []
  const id = props.service?.id
  if (id === 'cad') {
    if (!form.jewelleryType) formErrors.value.push('Please select jewellery type.')
    if (!form.metal) formErrors.value.push('Please select metal preference.')
    if (!form.inspirationFileName) formErrors.value.push('Please upload a reference / inspiration photo.')
  } else if (id === 'wax') {
    if (!form.hasCadFile) formErrors.value.push('Please indicate if you have a CAD file.')
    if (form.hasCadFile === 'Yes, I have a CAD file') {
      if (!form.waxCadFileName) formErrors.value.push('Please upload your CAD file.')
    }
    if (form.hasCadFile === 'No, I need one made') {
      if (!form.jewelleryType) formErrors.value.push('Please select jewellery type.')
      if (!form.metal) formErrors.value.push('Please select metal preference.')
      if (!form.inspirationFileName) formErrors.value.push('Please upload a reference / inspiration photo.')
    }
  } else if (id === 'casting') {
    if (!form.castingSource) formErrors.value.push('Please tell us what we will be casting from.')
    if (form.castingSource === CASTING_SOURCE_CAD && !form.waxCadFileName) {
      formErrors.value.push('Please upload your CAD file.')
    }
    if (form.castingSource === CASTING_SOURCE_WAX && !form.castingDesc.trim()) {
      formErrors.value.push('Please describe the piece(s) you will send for casting.')
    }
    if (!form.castingMetal) formErrors.value.push('Please select metal type.')
    if (!form.purity) formErrors.value.push('Please select purity.')
    if (!purityMatchesMetal(form.purity, form.castingMetal)) {
      formErrors.value.push(`${form.purity} doesn't match ${form.castingMetal} — please adjust metal or purity.`)
    }
    if (form.castingWeight.trim() && !/^\d+(\.\d+)?$/.test(form.castingWeight.trim())) {
      formErrors.value.push('Approx. weight should be a number in grams (e.g. 8.5).')
    }
    const qty = Number(form.quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      formErrors.value.push('Quantity must be a whole number between 1 and 100.')
    }
  } else if (id === 'final') {
    if (!form.finishType) formErrors.value.push('Please select finish type.')
    if (!form.stoneRequired) formErrors.value.push('Please indicate stone setting requirement.')
    if (form.stoneRequired === STONE_SETTING_YES) {
      if (!form.stoneDetails.trim()) formErrors.value.push('Please describe the stones (type, count, sizes).')
      if (!form.stoneSupply) formErrors.value.push('Please tell us who supplies the stones.')
    }
  }
  return formErrors.value.length === 0
}

function validateStep2(): boolean {
  formErrors.value = []
  if (!form.name.trim()) formErrors.value.push('Full name is required.')
  if (!form.phone.trim()) formErrors.value.push('Mobile number is required.')
  else if (!PHONE_PATTERN.test(form.phone.trim())) formErrors.value.push('Enter a valid mobile number.')
  if (!form.email.trim()) formErrors.value.push('Email address is required.')
  else if (!EMAIL_PATTERN.test(form.email.trim())) formErrors.value.push('Enter a valid email address.')
  if (!form.address.trim()) formErrors.value.push('Street address is required.')
  if (!form.city.trim()) formErrors.value.push('City is required.')
  if (!form.state.trim()) formErrors.value.push('State / province is required.')
  if (!form.country.trim()) formErrors.value.push('Country is required.')
  if (!form.pincode.trim()) formErrors.value.push('Postal code is required.')
  if (form.country === 'IN' && !/^\d{6}$/.test(form.pincode.trim())) {
    formErrors.value.push('Enter a valid 6-digit PIN code for India.')
  }
  if (form.neededBy && form.neededBy < todayIso) {
    formErrors.value.push('The needed-by date cannot be in the past.')
  }
  return formErrors.value.length === 0
}

function nextStep() {
  formErrors.value = []
  if (bookingStep.value === 1 && !validateStep1()) return
  if (bookingStep.value === 2 && !validateStep2()) return
  bookingStep.value++
}

function prevStep() {
  formErrors.value = []
  bookingStep.value--
}

// Uploads attachments, persists the request server-side (the reference comes
// back from the server), and only then shows the success step. The email
// notification stays best-effort — the DB row is the durable record.
async function submitBooking() {
  if (submitting.value) return
  formErrors.value = []
  submitting.value = true
  const svc = props.service
  try {
    let inspirationImageUrl = ''
    let cadFileUrl = ''
    if (inspirationFile.value) {
      inspirationImageUrl = (await uploadServiceFile(inspirationFile.value, 'image')) || ''
    }
    if (waxCadFile.value) {
      cadFileUrl = (await uploadServiceFile(waxCadFile.value, 'cad')) || ''
    }

    const rows = [...reviewItems.value]
    if (inspirationImageUrl) rows.push({ label: 'Photo Link', value: inspirationImageUrl })
    if (cadFileUrl) rows.push({ label: 'CAD Link', value: cadFileUrl })

    const request = await createServiceRequest({
      service: svc,
      customerName: form.name.trim(),
      customerEmail: form.email.trim(),
      customerPhone: form.phone.trim(),
      rows,
      inspirationImageUrl,
      cadFileUrl,
    })

    persistBookingAddress()
    bookingRef.value = request.reference
    bookingStep.value = 4
    void notifyTransaction({
      kind: 'service',
      reference: request.reference,
      serviceTitle: svc?.title ?? '',
      serviceNo: svc?.no ?? '',
      customerName: form.name.trim(),
      customerEmail: form.email.trim(),
      customerPhone: form.phone.trim(),
      rows,
    })
  } catch (err) {
    formErrors.value = [
      err instanceof Error && err.message
        ? err.message
        : 'Could not submit your request. Please check your connection and try again.',
    ]
  } finally {
    submitting.value = false
  }
}

const reviewItems = computed(() => {
  const id = props.service?.id
  const rows: { label: string; value: string }[] = []
  if (id === 'cad') {
    if (form.jewelleryType) rows.push({ label: 'Jewellery Type', value: form.jewelleryType })
    if (form.metal) rows.push({ label: 'Metal', value: form.metal })
    if (form.dimensions.trim()) rows.push({ label: 'Size / Dimensions', value: form.dimensions })
    if (form.budget) rows.push({ label: 'Budget', value: form.budget })
    if (form.occasion.trim()) rows.push({ label: 'Occasion', value: form.occasion })
    if (form.inspirationFileName) rows.push({ label: 'Photo', value: form.inspirationFileName })
    if (form.designDesc) rows.push({ label: 'Design Notes', value: form.designDesc })
  } else if (id === 'wax') {
    rows.push({ label: 'Has CAD File', value: form.hasCadFile })
    if (form.hasCadFile === 'Yes, I have a CAD file' && form.waxCadFileName) {
      rows.push({ label: 'CAD file', value: form.waxCadFileName })
    }
    if (form.hasCadFile === 'No, I need one made') {
      if (form.jewelleryType) rows.push({ label: 'Jewellery Type', value: form.jewelleryType })
      if (form.metal) rows.push({ label: 'Metal', value: form.metal })
      if (form.budget) rows.push({ label: 'Budget', value: form.budget })
      if (form.occasion) rows.push({ label: 'Occasion', value: form.occasion })
      if (form.inspirationFileName) rows.push({ label: 'Inspiration Photo', value: form.inspirationFileName })
      if (form.designDesc) rows.push({ label: 'Design Notes', value: form.designDesc })
    }
    if (form.waxNotes) rows.push({ label: 'Dimension Notes', value: form.waxNotes })
  } else if (id === 'casting') {
    if (form.castingSource) rows.push({ label: 'Casting From', value: form.castingSource })
    if (form.castingSource === CASTING_SOURCE_CAD && form.waxCadFileName) {
      rows.push({ label: 'CAD file', value: form.waxCadFileName })
    }
    if (form.castingDesc.trim()) rows.push({ label: 'Piece Description', value: form.castingDesc })
    if (form.castingMetal) rows.push({ label: 'Metal', value: form.castingMetal })
    if (form.purity) rows.push({ label: 'Purity', value: form.purity })
    if (form.castingWeight.trim()) rows.push({ label: 'Approx. Weight', value: `${form.castingWeight.trim()} g per piece` })
    rows.push({ label: 'Quantity', value: form.quantity })
  } else if (id === 'final') {
    if (form.finishType) rows.push({ label: 'Finish', value: form.finishType })
    if (form.stoneRequired) rows.push({ label: 'Stone Setting', value: form.stoneRequired })
    if (form.stoneRequired === STONE_SETTING_YES) {
      if (form.stoneDetails.trim()) rows.push({ label: 'Stone Details', value: form.stoneDetails })
      if (form.stoneSupply) rows.push({ label: 'Stones Supplied By', value: form.stoneSupply })
    }
    if (form.inspirationFileName) rows.push({ label: 'Piece Photo', value: form.inspirationFileName })
    if (form.finalNotes) rows.push({ label: 'Finish Notes', value: form.finalNotes })
  }
  rows.push({ label: 'Name', value: form.name })
  rows.push({ label: 'Mobile', value: form.phone })
  rows.push({ label: 'Email', value: form.email })
  rows.push({ label: 'Address', value: form.address })
  rows.push({ label: 'City', value: form.city })
  rows.push({ label: 'State', value: form.state })
  rows.push({ label: 'Country', value: countryDisplayName(form.country) })
  rows.push({ label: 'Postal code', value: form.pincode })
  if (form.neededBy) rows.push({ label: 'Needed By', value: form.neededBy })
  if (form.additionalNotes.trim()) rows.push({ label: 'Additional Notes', value: form.additionalNotes })
  return rows
})

function applySavedAddress(id: string) {
  const a = getById(id)
  if (!a) return
  form.name = a.name
  form.phone = a.phone
  form.email = a.email
  form.address = a.address
  form.city = a.city
  form.state = a.state
  let c = a.country.trim()
  if (c === 'India') c = 'IN'
  form.country = knownCountryCodes.has(c) ? c : 'OTHER'
  form.pincode = a.pincode
}

watch(selectedSavedId, (id, prevId) => {
  if (!id) {
    if (prevId) {
      form.name = ''
      form.phone = ''
      form.email = ''
      form.address = ''
      form.city = ''
      form.state = ''
      form.country = 'IN'
      form.pincode = ''
    }
    return
  }
  applySavedAddress(id)
})

function persistBookingAddress() {
  if (!shouldSaveAddress.value || selectedSavedId.value) return
  const id = saveAddress({
    label: saveAsLabel.value.trim() || `${form.city.trim()} address`,
    isDefault: makeDefaultAddress.value,
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    country: form.country,
    pincode: form.pincode.trim(),
  })
  selectedSavedId.value = id
}

watch(
  () => [props.open, props.service] as const,
  ([isOpen, svc]) => {
    if (isOpen && svc) {
      bookingStep.value = 1
      bookingRef.value = ''
      formErrors.value = []
      shouldSaveAddress.value = true
      saveAsLabel.value = ''
      makeDefaultAddress.value = false
      Object.assign(form, { ...INITIAL_FORM })
      selectedSavedId.value = defaultAddress.value?.id ?? ''
      if (selectedSavedId.value) applySavedAddress(selectedSavedId.value)
      inspirationPreview.value = null
      inspirationFile.value = null
      waxCadFile.value = null
      submitting.value = false
    }
  }
)

watch(
  () => props.open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) requestClose()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

const JEWELLERY_TYPES = ['Ring', 'Earrings', 'Necklace', 'Bracelet', 'Pendant', 'Mangal Sutra', 'Other']
const METALS = ['Yellow Gold', 'White Gold', 'Rose Gold', 'Silver', 'Platinum']
const BUDGETS = ['Under $300', '$300 – $600', '$600 – $1,200', '$1,200 – $3,600', '$3,600+']
const PURITIES = ['18k', '22k', '24k', '925 Silver', '950 Platinum', 'Other']
const FINISHES = ['Mirror Polish', 'Satin / Brushed', 'Matte', 'Hammered', 'Combination']
const CASTING_SOURCE_WAX = 'I will ship my wax model'
const CASTING_SOURCE_CAD = 'I have a CAD file'
const CASTING_SOURCES = [CASTING_SOURCE_WAX, CASTING_SOURCE_CAD]
const STONE_SUPPLIES = ['I will provide the stones', 'Kiana sources the stones']
const STONE_SETTING_YES = 'Yes — please set stones'
// min attribute for the needed-by date input
const todayIso = new Date().toISOString().slice(0, 10)
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="ect-transition ect-duration-300 ect-ease-out" enter-from-class="ect-opacity-0" enter-to-class="ect-opacity-100" leave-active-class="ect-transition ect-duration-200" leave-from-class="ect-opacity-100" leave-to-class="ect-opacity-0">
      <div v-if="open" class="service-modal-backdrop ect-fixed ect-inset-0 ect-z-[60] ect-flex ect-items-end sm:ect-items-center ect-justify-center ect-p-0 sm:ect-p-6" @click.self="requestClose">

        <Transition enter-active-class="ect-transition ect-duration-300 ect-ease-out" enter-from-class="ect-translate-y-8 ect-opacity-0" enter-to-class="ect-translate-y-0 ect-opacity-100" leave-active-class="ect-transition ect-duration-200" leave-from-class="ect-translate-y-0 ect-opacity-100" leave-to-class="ect-translate-y-8 ect-opacity-0">
          <div v-if="open" class="service-modal-shell ect-w-full ect-bg-white ect-rounded-t-3xl sm:ect-rounded-2xl ect-shadow-2xl ect-flex ect-max-h-[94vh]" role="dialog" aria-modal="true" :aria-label="`${service?.title || 'Service'} booking form`">

            <aside class="service-modal-aside">
              <div>
                <p class="service-modal-kicker">Private consultation</p>
                <p class="service-modal-number">{{ service?.no }}</p>
                <h3>{{ service?.title }}</h3>
                <p class="service-modal-subtitle">{{ service?.subtitle }}</p>
                <p class="service-modal-description">{{ service?.desc }}</p>
              </div>
              <div class="service-modal-assurance">
                <span>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75l2.25 2.25L15 9.75m6-3c0 7.142-4.036 12.253-9 13.5-4.964-1.247-9-6.358-9-13.5A12.804 12.804 0 0012 3c3.183 0 6.09 1.16 8.25 3.08.5.444.75.666.75.92z"/></svg>
                </span>
                <div><strong>Your details stay private</strong><small>No payment is required to request a consultation.</small></div>
              </div>
            </aside>

            <div class="service-modal-main">

            <!-- Modal header -->
            <div class="service-modal-header ect-flex ect-items-center ect-justify-between ect-px-6 ect-pt-6 ect-pb-4 ect-shrink-0">
              <div>
                <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.15em] ect-text-gold-600">{{ service?.no }} · {{ service?.title }}</p>
                <h3 class="ect-font-display ect-text-xl ect-font-light ect-text-charcoal">
                  {{ bookingStep === 4 ? 'Booking Confirmed' : bookingStep === 3 ? 'Review & Confirm' : bookingStep === 2 ? 'Your Details' : 'Service Details' }}
                </h3>
              </div>
              <button @click="requestClose" class="ect-p-2 ect-rounded-full ect-text-charcoal/40 hover:ect-bg-champagne/40 hover:ect-text-charcoal ect-transition-colors" aria-label="Close">
                <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- Step progress (steps 1–3) -->
            <div v-if="bookingStep < 4" class="service-modal-progress ect-px-6 ect-pb-4 ect-shrink-0">
              <div class="ect-flex ect-items-center ect-gap-0">
                <template v-for="n in 3" :key="n">
                  <div class="ect-flex ect-items-center ect-justify-center ect-w-7 ect-h-7 ect-rounded-full ect-font-body ect-text-xs ect-font-bold ect-transition-all ect-shrink-0"
                    :class="n < bookingStep ? 'ect-bg-charcoal ect-text-white' : n === bookingStep ? 'ect-bg-charcoal ect-text-cream' : 'ect-bg-charcoal/10 ect-text-charcoal/40'">
                    <svg v-if="n < bookingStep" class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                    <span v-else>{{ n }}</span>
                  </div>
                  <div v-if="n < 3" class="ect-flex-1 ect-h-px ect-mx-1" :class="n < bookingStep ? 'ect-bg-gold-400' : 'ect-bg-charcoal/10'" />
                </template>
              </div>
              <div class="ect-flex ect-justify-between ect-mt-1.5">
                <span v-for="label in ['Service details', 'Your details', 'Review']" :key="label" class="ect-font-body ect-text-[10px] ect-text-charcoal/40">{{ label }}</span>
              </div>
            </div>

            <div class="service-modal-divider ect-h-px ect-bg-champagne ect-shrink-0" />

            <!-- Scrollable body -->
            <div class="service-modal-body ect-flex-1 ect-overflow-y-auto ect-px-6 ect-py-5">

              <!-- Error messages -->
              <div v-if="formErrors.length" class="ect-mb-4 ect-p-3 ect-rounded-xl ect-bg-red-50 ect-border ect-border-red-200">
                <p v-for="err in formErrors" :key="err" class="ect-font-body ect-text-sm ect-text-red-700">{{ err }}</p>
              </div>

              <!-- ── STEP 1: Service-specific fields ──────────────────────── -->
              <div v-if="bookingStep === 1" class="ect-space-y-5">

                <!-- CAD fields -->
                <template v-if="service?.id === 'cad'">
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Jewellery Type <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-flex-wrap ect-gap-2">
                      <button v-for="t in JEWELLERY_TYPES" :key="t" type="button" @click="form.jewelleryType = t"
                        class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                        :class="form.jewelleryType === t ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ t }}</button>
                    </div>
                  </div>
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Metal Preference <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-flex-wrap ect-gap-2">
                      <button v-for="m in METALS" :key="m" type="button" @click="form.metal = m"
                        class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                        :class="form.metal === m ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ m }}</button>
                    </div>
                  </div>
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Size / Dimensions <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></label>
                    <input v-model="form.dimensions" type="text" placeholder="e.g. Ring size 14, chain length 18 in, pendant 25 mm…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </div>
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Budget Range</label>
                    <div class="ect-flex ect-flex-wrap ect-gap-2">
                      <button v-for="b in BUDGETS" :key="b" type="button" @click="form.budget = b"
                        class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                        :class="form.budget === b ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ b }}</button>
                    </div>
                  </div>
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Occasion <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></label>
                    <input v-model="form.occasion" type="text" placeholder="e.g. Engagement, Anniversary, Gift…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </div>
                  <!-- Photo upload -->
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">
                      Reference / Inspiration Photo <span class="ect-text-gold-600">*</span>
                    </label>
                    <!-- Preview state -->
                    <div v-if="inspirationPreview" class="ect-relative ect-rounded-2xl ect-overflow-hidden ect-ring-1 ect-ring-gold-300">
                      <img :src="inspirationPreview" alt="Inspiration" class="ect-w-full ect-max-h-52 ect-object-cover" />
                      <button
                        type="button"
                        @click="removeInspirationFile"
                        class="ect-absolute ect-top-2 ect-right-2 ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal/70 ect-text-white ect-flex ect-items-center ect-justify-center hover:ect-bg-noir ect-transition-colors"
                        aria-label="Remove photo"
                      >
                        <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                      <div class="ect-absolute ect-bottom-0 ect-inset-x-0 ect-bg-charcoal/50 ect-px-3 ect-py-1.5">
                        <p class="ect-font-body ect-text-xs ect-text-white ect-truncate">{{ form.inspirationFileName }}</p>
                      </div>
                    </div>
                    <!-- Upload dropzone -->
                    <label
                      v-else
                      for="inspiration-upload"
                      class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-gap-2 ect-w-full ect-py-8 ect-rounded-2xl ect-border-2 ect-border-dashed ect-border-sand ect-bg-champagne/40 hover:ect-bg-champagne/40 hover:ect-border-gold-400 ect-transition-all ect-cursor-pointer"
                    >
                      <span class="ect-w-10 ect-h-10 ect-rounded-full ect-bg-champagne ect-flex ect-items-center ect-justify-center">
                        <svg class="ect-w-5 ect-h-5 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
                        </svg>
                      </span>
                      <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70">Tap to upload a photo</p>
                      <p class="ect-font-body ect-text-xs ect-text-charcoal/40">JPG, PNG or WEBP · Max 10 MB</p>
                      <input
                        id="inspiration-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        class="ect-sr-only"
                        @change="handleInspirationFile"
                      />
                    </label>
                  </div>
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Design Description <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></label>
                    <textarea v-model="form.designDesc" rows="3" placeholder="Describe your dream piece — style, inspiration, stones, any special details…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all ect-resize-none" />
                  </div>
                </template>

                <!-- WAX fields -->
                <template v-else-if="service?.id === 'wax'">
                  <!-- CAD file question -->
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Do you already have a CAD file? <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-gap-3">
                      <button v-for="opt in ['Yes, I have a CAD file', 'No, I need one made']" :key="opt" type="button" @click="onSelectWaxCadOption(opt)"
                        class="ect-flex-1 ect-py-3 ect-rounded-xl ect-border ect-font-body ect-text-sm ect-text-center ect-transition-all"
                        :class="form.hasCadFile === opt ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ opt }}</button>
                    </div>
                  </div>

                  <!-- Yes CAD file → upload CAD -->
                  <template v-if="form.hasCadFile === 'Yes, I have a CAD file'">
                    <div class="ect-rounded-2xl ect-bg-champagne/50 ect-border ect-border-sand ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-gold-800">
                      Upload your CAD so our wax team can review scale and printability before prototyping.
                    </div>
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">
                        CAD file <span class="ect-text-gold-600">*</span>
                      </label>
                      <div
                        v-if="form.waxCadFileName"
                        class="ect-flex ect-items-center ect-justify-between ect-gap-3 ect-rounded-xl ect-border ect-border-sand ect-bg-white ect-px-4 ect-py-3"
                      >
                        <span class="ect-flex ect-items-center ect-gap-2 ect-min-w-0">
                          <svg class="ect-w-5 ect-h-5 ect-text-gold-600 ect-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75m8.572 4.5l-.256 1.494M9.75 21h8.25m-11.177-3.75h11.218a1.125 1.125 0 001.089-.858l1.992-7.5a1.125 1.125 0 00-1.089-1.392H9.234a1.125 1.125 0 00-1.09 1.392l1.992 7.5a1.125 1.125 0 001.089.858z" />
                          </svg>
                          <span class="ect-font-body ect-text-sm ect-text-charcoal ect-truncate">{{ form.waxCadFileName }}</span>
                        </span>
                        <button type="button" class="ect-shrink-0 ect-p-1.5 ect-rounded-lg ect-text-charcoal/40 hover:ect-bg-champagne/40 hover:ect-text-gold-800 ect-transition-colors" aria-label="Remove CAD file" @click="removeWaxCadFile">
                          <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <label
                        v-else
                        for="wax-cad-upload"
                        class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-gap-2 ect-w-full ect-py-8 ect-rounded-2xl ect-border-2 ect-border-dashed ect-border-sand ect-bg-champagne/40 hover:ect-bg-champagne/40 hover:ect-border-gold-400 ect-transition-all ect-cursor-pointer"
                      >
                        <span class="ect-w-10 ect-h-10 ect-rounded-full ect-bg-champagne ect-flex ect-items-center ect-justify-center">
                          <svg class="ect-w-5 ect-h-5 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        </span>
                        <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70">Tap to attach CAD</p>
                        <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-text-center ect-px-2">.stl, .step, .obj, .iges, .3dm, .dwg, .dxf, or .zip · up to 50 MB</p>
                        <input
                          id="wax-cad-upload"
                          type="file"
                          accept=".stl,.stp,.step,.obj,.iges,.igs,.3dm,.dwg,.dxf,.zip,application/sla,model/stl,application/STEP,application/step"
                          class="ect-sr-only"
                          @change="handleWaxCadFile"
                        />
                      </label>
                    </div>
                  </template>

                  <!-- No CAD file → collect full CAD design details -->
                  <template v-if="form.hasCadFile === 'No, I need one made'">
                    <div class="ect-rounded-2xl ect-bg-champagne/50 ect-border ect-border-sand ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-gold-800">
                      We'll create your CAD first, then proceed to wax. Please provide your design details below.
                    </div>
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Jewellery Type <span class="ect-text-gold-600">*</span></label>
                      <div class="ect-flex ect-flex-wrap ect-gap-2">
                        <button v-for="t in JEWELLERY_TYPES" :key="t" type="button" @click="form.jewelleryType = t"
                          class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                          :class="form.jewelleryType === t ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ t }}</button>
                      </div>
                    </div>
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Metal Preference <span class="ect-text-gold-600">*</span></label>
                      <div class="ect-flex ect-flex-wrap ect-gap-2">
                        <button v-for="m in METALS" :key="m" type="button" @click="form.metal = m"
                          class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                          :class="form.metal === m ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ m }}</button>
                      </div>
                    </div>
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Budget Range</label>
                      <div class="ect-flex ect-flex-wrap ect-gap-2">
                        <button v-for="b in BUDGETS" :key="b" type="button" @click="form.budget = b"
                          class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                          :class="form.budget === b ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ b }}</button>
                      </div>
                    </div>
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Occasion <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></label>
                      <input v-model="form.occasion" type="text" placeholder="e.g. Engagement, Anniversary, Gift…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                    </div>
                    <!-- Inspiration photo -->
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">
                        Reference / Inspiration Photo <span class="ect-text-gold-600">*</span>
                      </label>
                      <div v-if="inspirationPreview" class="ect-relative ect-rounded-2xl ect-overflow-hidden ect-ring-1 ect-ring-gold-300">
                        <img :src="inspirationPreview" alt="Inspiration" class="ect-w-full ect-max-h-52 ect-object-cover" />
                        <button type="button" @click="removeInspirationFile" class="ect-absolute ect-top-2 ect-right-2 ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal/70 ect-text-white ect-flex ect-items-center ect-justify-center hover:ect-bg-noir ect-transition-colors" aria-label="Remove photo">
                          <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                        <div class="ect-absolute ect-bottom-0 ect-inset-x-0 ect-bg-charcoal/50 ect-px-3 ect-py-1.5">
                          <p class="ect-font-body ect-text-xs ect-text-white ect-truncate">{{ form.inspirationFileName }}</p>
                        </div>
                      </div>
                      <label v-else for="inspiration-upload-wax" class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-gap-2 ect-w-full ect-py-8 ect-rounded-2xl ect-border-2 ect-border-dashed ect-border-sand ect-bg-champagne/40 hover:ect-bg-champagne/40 hover:ect-border-gold-400 ect-transition-all ect-cursor-pointer">
                        <span class="ect-w-10 ect-h-10 ect-rounded-full ect-bg-champagne ect-flex ect-items-center ect-justify-center">
                          <svg class="ect-w-5 ect-h-5 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>
                        </span>
                        <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70">Tap to upload a photo</p>
                        <p class="ect-font-body ect-text-xs ect-text-charcoal/40">JPG, PNG or WEBP · Max 10 MB</p>
                        <input id="inspiration-upload-wax" type="file" accept="image/jpeg,image/png,image/webp" class="ect-sr-only" @change="handleInspirationFile" />
                      </label>
                    </div>
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Design Description <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></label>
                      <textarea v-model="form.designDesc" rows="3" placeholder="Describe your dream piece — style, inspiration, stones, any special details…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 ect-transition-all ect-resize-none" />
                    </div>
                  </template>

                  <!-- Has CAD → just notes -->
                  <div v-if="form.hasCadFile === 'Yes, I have a CAD file'">
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Dimensions / Special Notes <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></label>
                    <textarea v-model="form.waxNotes" rows="3" placeholder="Any size, weight, or specific dimension requirements…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 ect-transition-all ect-resize-none" />
                  </div>
                </template>

                <!-- Casting fields -->
                <template v-else-if="service?.id === 'casting'">
                  <!-- What are we casting from? -->
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">What will we cast from? <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-gap-3">
                      <button v-for="opt in CASTING_SOURCES" :key="opt" type="button" @click="onSelectCastingSource(opt)"
                        class="ect-flex-1 ect-py-3 ect-rounded-xl ect-border ect-font-body ect-text-sm ect-text-center ect-transition-all"
                        :class="form.castingSource === opt ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ opt }}</button>
                    </div>
                  </div>

                  <!-- Ship wax model → we need a description of the piece(s) -->
                  <div v-if="form.castingSource === CASTING_SOURCE_WAX" class="ect-rounded-2xl ect-bg-champagne/50 ect-border ect-border-sand ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-gold-800">
                    We'll share the shipping address for your wax model after we review your request.
                  </div>

                  <!-- CAD file → upload so we can print the wax -->
                  <div v-if="form.castingSource === CASTING_SOURCE_CAD">
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">
                      CAD file <span class="ect-text-gold-600">*</span>
                    </label>
                    <div
                      v-if="form.waxCadFileName"
                      class="ect-flex ect-items-center ect-justify-between ect-gap-3 ect-rounded-xl ect-border ect-border-sand ect-bg-white ect-px-4 ect-py-3"
                    >
                      <span class="ect-flex ect-items-center ect-gap-2 ect-min-w-0">
                        <svg class="ect-w-5 ect-h-5 ect-text-gold-600 ect-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75m8.572 4.5l-.256 1.494M9.75 21h8.25m-11.177-3.75h11.218a1.125 1.125 0 001.089-.858l1.992-7.5a1.125 1.125 0 00-1.089-1.392H9.234a1.125 1.125 0 00-1.09 1.392l1.992 7.5a1.125 1.125 0 001.089.858z" />
                        </svg>
                        <span class="ect-font-body ect-text-sm ect-text-charcoal ect-truncate">{{ form.waxCadFileName }}</span>
                      </span>
                      <button type="button" class="ect-shrink-0 ect-p-1.5 ect-rounded-lg ect-text-charcoal/40 hover:ect-bg-champagne/40 hover:ect-text-gold-800 ect-transition-colors" aria-label="Remove CAD file" @click="removeWaxCadFile">
                        <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <label
                      v-else
                      for="wax-cad-upload"
                      class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-gap-2 ect-w-full ect-py-8 ect-rounded-2xl ect-border-2 ect-border-dashed ect-border-sand ect-bg-champagne/40 hover:ect-bg-champagne/40 hover:ect-border-gold-400 ect-transition-all ect-cursor-pointer"
                    >
                      <span class="ect-w-10 ect-h-10 ect-rounded-full ect-bg-champagne ect-flex ect-items-center ect-justify-center">
                        <svg class="ect-w-5 ect-h-5 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </span>
                      <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70">Tap to attach CAD</p>
                      <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-text-center ect-px-2">.stl, .step, .obj, .iges, .3dm, .dwg, .dxf, or .zip · up to 50 MB</p>
                      <input
                        id="wax-cad-upload"
                        type="file"
                        accept=".stl,.stp,.step,.obj,.iges,.igs,.3dm,.dwg,.dxf,.zip,application/sla,model/stl,application/STEP,application/step"
                        class="ect-sr-only"
                        @change="handleWaxCadFile"
                      />
                    </label>
                  </div>

                  <div v-if="form.castingSource">
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">
                      Piece Description
                      <span v-if="form.castingSource === CASTING_SOURCE_WAX" class="ect-text-gold-600">*</span>
                      <span v-else class="ect-text-charcoal/30 ect-normal-case">(optional)</span>
                    </label>
                    <textarea v-model="form.castingDesc" rows="3" placeholder="What are the pieces — e.g. 3 ring shanks with prong heads, approx. 6 g each…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all ect-resize-none" />
                  </div>

                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Metal Type <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-flex-wrap ect-gap-2">
                      <button v-for="m in METALS" :key="m" type="button" @click="form.castingMetal = m"
                        class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                        :class="form.castingMetal === m ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ m }}</button>
                    </div>
                  </div>
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Purity <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-flex-wrap ect-gap-2">
                      <button v-for="p in PURITIES" :key="p" type="button" @click="form.purity = p"
                        class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                        :class="form.purity === p ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ p }}</button>
                    </div>
                  </div>
                  <div class="ect-flex ect-gap-4">
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Quantity</label>
                      <input v-model="form.quantity" type="number" min="1" max="100" class="ect-w-24 ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 ect-transition-all" />
                    </div>
                    <div class="ect-flex-1">
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Approx. Weight / Piece <span class="ect-text-charcoal/30 ect-normal-case">(g, optional)</span></label>
                      <input v-model="form.castingWeight" type="text" inputmode="decimal" placeholder="e.g. 8.5" class="ect-w-full ect-max-w-[10rem] ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 ect-transition-all" />
                    </div>
                  </div>
                </template>

                <!-- Final Product fields -->
                <template v-else-if="service?.id === 'final'">
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Finish Type <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-flex-wrap ect-gap-2">
                      <button v-for="f in FINISHES" :key="f" type="button" @click="form.finishType = f"
                        class="ect-px-3.5 ect-py-1.5 ect-rounded-full ect-border ect-font-body ect-text-sm ect-transition-all"
                        :class="form.finishType === f ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ f }}</button>
                    </div>
                  </div>
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Stone Setting Required? <span class="ect-text-gold-600">*</span></label>
                    <div class="ect-flex ect-gap-3">
                      <button v-for="opt in ['Yes — please set stones', 'No stone setting needed']" :key="opt" type="button" @click="form.stoneRequired = opt"
                        class="ect-flex-1 ect-py-3 ect-rounded-xl ect-border ect-font-body ect-text-sm ect-text-center ect-transition-all"
                        :class="form.stoneRequired === opt ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ opt }}</button>
                    </div>
                  </div>

                  <!-- Stone setting requested → the setters need the details -->
                  <template v-if="form.stoneRequired === STONE_SETTING_YES">
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Stone Details <span class="ect-text-gold-600">*</span></label>
                      <textarea v-model="form.stoneDetails" rows="2" placeholder="Type, count, and sizes — e.g. 1 round diamond 0.5 ct centre, 12 × 1.5 mm side stones…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all ect-resize-none" />
                    </div>
                    <div>
                      <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-2">Who supplies the stones? <span class="ect-text-gold-600">*</span></label>
                      <div class="ect-flex ect-gap-3">
                        <button v-for="opt in STONE_SUPPLIES" :key="opt" type="button" @click="form.stoneSupply = opt"
                          class="ect-flex-1 ect-py-3 ect-rounded-xl ect-border ect-font-body ect-text-sm ect-text-center ect-transition-all"
                          :class="form.stoneSupply === opt ? 'ect-border-gold-500 ect-bg-champagne/50 ect-text-gold-800' : 'ect-border-charcoal/15 ect-text-charcoal/60 hover:ect-border-gold-300'">{{ opt }}</button>
                      </div>
                    </div>
                  </template>

                  <!-- Optional photo of the piece being finished -->
                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">
                      Photo of Your Piece <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span>
                    </label>
                    <div v-if="inspirationPreview" class="ect-relative ect-rounded-2xl ect-overflow-hidden ect-ring-1 ect-ring-gold-300">
                      <img :src="inspirationPreview" alt="Inspiration" class="ect-w-full ect-max-h-52 ect-object-cover" />
                      <button type="button" @click="removeInspirationFile" class="ect-absolute ect-top-2 ect-right-2 ect-w-7 ect-h-7 ect-rounded-full ect-bg-charcoal/70 ect-text-white ect-flex ect-items-center ect-justify-center hover:ect-bg-noir ect-transition-colors" aria-label="Remove photo">
                        <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                      <div class="ect-absolute ect-bottom-0 ect-inset-x-0 ect-bg-charcoal/50 ect-px-3 ect-py-1.5">
                        <p class="ect-font-body ect-text-xs ect-text-white ect-truncate">{{ form.inspirationFileName }}</p>
                      </div>
                    </div>
                    <label v-else for="inspiration-upload-final" class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-gap-2 ect-w-full ect-py-8 ect-rounded-2xl ect-border-2 ect-border-dashed ect-border-sand ect-bg-champagne/40 hover:ect-bg-champagne/40 hover:ect-border-gold-400 ect-transition-all ect-cursor-pointer">
                      <span class="ect-w-10 ect-h-10 ect-rounded-full ect-bg-champagne ect-flex ect-items-center ect-justify-center">
                        <svg class="ect-w-5 ect-h-5 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>
                      </span>
                      <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70">Tap to upload a photo</p>
                      <p class="ect-font-body ect-text-xs ect-text-charcoal/40">JPG, PNG or WEBP · Max 10 MB</p>
                      <input id="inspiration-upload-final" type="file" accept="image/jpeg,image/png,image/webp" class="ect-sr-only" @change="handleInspirationFile" />
                    </label>
                  </div>

                  <div>
                    <label class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Special Requirements <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></label>
                    <textarea v-model="form.finalNotes" rows="3" placeholder="Any specific finishing requirements, engravings, or notes for the karigar…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 ect-transition-all ect-resize-none" />
                  </div>
                </template>

              </div>

              <!-- ── STEP 2: Contact & address ─────────────────────────────── -->
              <div v-else-if="bookingStep === 2" class="ect-space-y-4">
                <div class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-4">
                  <SavedAddressSelector
                    v-model="selectedSavedId"
                    :addresses="savedAddresses"
                    label="Service address"
                    helper-text="Selecting a saved address fills your contact details and service address."
                    class="sm:ect-col-span-2"
                  />
                  <label class="ect-block">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Full Name <span class="ect-text-gold-600">*</span></span>
                    <input v-model="form.name" type="text" placeholder="Priya Sharma" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </label>
                  <label class="ect-block">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Mobile Number <span class="ect-text-gold-600">*</span></span>
                    <input v-model="form.phone" type="tel" placeholder="+91 98765 43210" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </label>
                  <label class="ect-block sm:ect-col-span-2">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Email Address <span class="ect-text-gold-600">*</span></span>
                    <input v-model="form.email" type="email" placeholder="priya@example.com" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </label>
                  <label class="ect-block sm:ect-col-span-2">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Street address <span class="ect-text-gold-600">*</span></span>
                    <input v-model="form.address" type="text" placeholder="Flat / house no., street, area" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </label>
                  <label class="ect-block">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">City <span class="ect-text-gold-600">*</span></span>
                    <input v-model="form.city" type="text" placeholder="Mumbai" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </label>
                  <label class="ect-block">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">State / Province <span class="ect-text-gold-600">*</span></span>
                    <input v-model="form.state" type="text" placeholder="Maharashtra" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </label>
                  <div class="ect-block">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Country <span class="ect-text-gold-600">*</span></span>
                    <UiSelect v-model="form.country" :options="countrySelectOptions" />
                  </div>
                  <label class="ect-block">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Postal code <span class="ect-text-gold-600">*</span></span>
                    <input
                      v-model="form.pincode"
                      type="text"
                      :pattern="form.country === 'IN' ? '[0-9]{6}' : undefined"
                      :placeholder="form.country === 'IN' ? '400001' : 'ZIP / postal code'"
                      class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all"
                    />
                  </label>
                  <label class="ect-block sm:ect-col-span-2">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Needed by <span class="ect-font-normal ect-text-charcoal/40 ect-normal-case">(optional — e.g. a wedding or gifting date)</span></span>
                    <input v-model="form.neededBy" type="date" :min="todayIso" class="ect-w-full sm:ect-w-56 ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 focus:ect-border-gold-400 ect-transition-all" />
                  </label>
                  <SavedAddressSavePanel
                    v-if="selectedSavedId === ''"
                    v-model="shouldSaveAddress"
                    v-model:label="saveAsLabel"
                    v-model:make-default="makeDefaultAddress"
                    class="sm:ect-col-span-2"
                  />
                  <label class="ect-block sm:ect-col-span-2">
                    <span class="ect-block ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/60 ect-uppercase ect-tracking-[0.1em] ect-mb-1.5">Additional Notes <span class="ect-text-charcoal/30 ect-normal-case">(optional)</span></span>
                    <textarea v-model="form.additionalNotes" rows="2" placeholder="Any other information you'd like us to know…" class="ect-w-full ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/30 ect-transition-all ect-resize-none" />
                  </label>
                </div>
              </div>

              <!-- ── STEP 3: Review ──────────────────────────────────────── -->
              <div v-else-if="bookingStep === 3" class="ect-space-y-4">
                <div class="ect-bg-champagne/50 ect-rounded-2xl ect-p-5 ect-border ect-border-sand">
                  <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-3">{{ service?.no }} · {{ service?.subtitle }}</p>
                  <!-- Inspiration photo preview in review -->
                  <div v-if="inspirationPreview && (service?.id === 'cad' || service?.id === 'final' || (service?.id === 'wax' && form.hasCadFile === 'No, I need one made'))" class="ect-mb-4 ect-rounded-xl ect-overflow-hidden ect-ring-1 ect-ring-gold-300">
                    <img :src="inspirationPreview" alt="Inspiration" class="ect-w-full ect-max-h-36 ect-object-cover" />
                  </div>
                  <dl class="ect-space-y-2">
                    <div v-for="row in reviewItems" :key="row.label" class="ect-flex ect-gap-3">
                      <dt class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-shrink-0 ect-w-28">{{ row.label }}</dt>
                      <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-font-medium ect-break-words">{{ row.value }}</dd>
                    </div>
                  </dl>
                </div>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-leading-relaxed">
                  Our team will review your request and reach out within one business day to confirm details and share a quote. Booking is non-binding until you confirm the final quote.
                </p>
              </div>

              <!-- ── STEP 4: Success ────────────────────────────────────── -->
              <div v-else-if="bookingStep === 4" class="ect-text-center ect-py-4">
                <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-16 ect-h-16 ect-rounded-full ect-bg-champagne ect-mb-5">
                  <svg class="ect-w-8 ect-h-8 ect-text-gold-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                </span>
                <h4 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-1">We've received your request!</h4>
                <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mb-5">Our team will contact you shortly to confirm details.</p>
                <p class="ect-inline-block ect-px-5 ect-py-2.5 ect-rounded-full ect-bg-charcoal ect-font-body ect-text-sm ect-font-bold ect-text-cream ect-tracking-widest ect-mb-8">{{ bookingRef }}</p>
                <div class="ect-bg-champagne/50 ect-rounded-2xl ect-p-5 ect-text-left ect-mb-6">
                  <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-3">What happens next</p>
                  <ol class="ect-list-none ect-m-0 ect-p-0 ect-space-y-2.5">
                    <li v-for="(step, i) in ['Our team reviews your request (within 24 hrs)', 'We call or WhatsApp you to confirm details', 'You receive an itemised quote for approval', 'Work begins once quote is confirmed']" :key="i" class="ect-flex ect-gap-3 ect-items-start">
                      <span class="ect-shrink-0 ect-w-5 ect-h-5 ect-rounded-full ect-bg-sand ect-text-gold-800 ect-flex ect-items-center ect-justify-center ect-font-body ect-text-[10px] ect-font-bold ect-mt-0.5">{{ i + 1 }}</span>
                      <p class="ect-font-body ect-text-sm ect-text-charcoal/70">{{ step }}</p>
                    </li>
                  </ol>
                </div>
                <div class="ect-flex ect-flex-col ect-gap-2">
                  <button type="button" @click="requestClose" class="ect-inline-flex ect-items-center ect-justify-center ect-gap-2 ect-py-3 ect-rounded-xl ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold hover:ect-bg-noir ect-transition-colors">Done</button>
                  <RouterLink to="/services" @click="requestClose" class="ect-inline-flex ect-items-center ect-justify-center ect-gap-2 ect-py-3 ect-rounded-xl ect-border ect-border-charcoal/15 ect-font-body ect-text-sm ect-text-charcoal/70 hover:ect-border-charcoal/30 hover:ect-bg-champagne/40 ect-transition-colors">View Services</RouterLink>
                </div>
              </div>

            </div>

            <!-- Modal footer (navigation buttons) -->
            <div v-if="bookingStep < 4" class="service-modal-footer ect-px-6 ect-py-4 ect-border-t ect-border-sand ect-flex ect-items-center ect-justify-between ect-shrink-0">
              <button v-if="bookingStep > 1" type="button" @click="prevStep" class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-5 ect-py-2.5 ect-rounded-full ect-border ect-border-charcoal/15 ect-font-body ect-text-sm ect-text-charcoal/70 hover:ect-border-charcoal/30 ect-transition-colors">
                <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
                Back
              </button>
              <span v-else />
              <button v-if="bookingStep < 3" type="button" @click="nextStep" class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-6 ect-py-2.5 ect-rounded-full ect-bg-charcoal ect-text-cream ect-font-body ect-text-sm ect-font-semibold hover:ect-bg-noir ect-transition-colors">
                Continue
                <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
              </button>
              <button v-else type="button" :disabled="submitting" @click="submitBooking" class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-6 ect-py-2.5 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-60 disabled:ect-cursor-not-allowed">
                <svg v-if="!submitting" class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                <svg v-else class="ect-w-4 ect-h-4 ect-animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v3m6.364.636l-2.121 2.121M21 12h-3m-.636 6.364l-2.121-2.121M12 18v3m-6.364-.636l2.121-2.121M6 12H3m3.636-6.364l2.121 2.121"/></svg>
                {{ submitting ? 'Submitting…' : 'Confirm Booking' }}
              </button>
            </div>

            </div>

          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

</template>

<style scoped>
.service-modal-backdrop {
  background:
    radial-gradient(circle at 50% 12%, rgba(201, 166, 102, 0.16), transparent 35%),
    rgba(17, 16, 14, 0.78);
  backdrop-filter: blur(12px);
}

.service-modal-shell {
  width: min(920px, calc(100vw - 48px));
  overflow: hidden;
  border: 1px solid rgba(201, 166, 102, 0.28);
  box-shadow: 0 32px 90px rgba(12, 10, 7, 0.36), 0 2px 10px rgba(12, 10, 7, 0.12);
}

.service-modal-aside {
  position: relative;
  display: flex;
  width: 292px;
  flex: 0 0 292px;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 38px 32px 30px;
  color: #f8f2e8;
  background:
    linear-gradient(145deg, rgba(201, 166, 102, 0.12), transparent 42%),
    #24221f;
}

.service-modal-aside::after {
  position: absolute;
  right: -74px;
  bottom: 92px;
  width: 180px;
  height: 180px;
  border: 1px solid rgba(201, 166, 102, 0.14);
  border-radius: 50%;
  box-shadow: 0 0 0 28px rgba(201, 166, 102, 0.035), 0 0 0 56px rgba(201, 166, 102, 0.025);
  content: '';
}

.service-modal-kicker {
  margin-bottom: 28px;
  color: #d6b778;
  font-family: var(--font-body, sans-serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .2em;
  text-transform: uppercase;
}

.service-modal-number {
  color: rgba(214, 183, 120, 0.38);
  font-family: var(--font-display, serif);
  font-size: 72px;
  font-weight: 300;
  line-height: .85;
}

.service-modal-aside h3 {
  margin: -3px 0 4px;
  font-family: var(--font-display, serif);
  font-size: 30px;
  font-weight: 300;
  line-height: 1.1;
}

.service-modal-subtitle {
  margin-bottom: 20px;
  color: #d6b778;
  font-family: var(--font-body, sans-serif);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.service-modal-description {
  color: rgba(248, 242, 232, 0.58);
  font-family: var(--font-body, sans-serif);
  font-size: 13px;
  line-height: 1.7;
}

.service-modal-assurance {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding-top: 22px;
  border-top: 1px solid rgba(248, 242, 232, 0.1);
}

.service-modal-assurance > span {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 50%;
  color: #d6b778;
  background: rgba(214, 183, 120, 0.12);
}

.service-modal-assurance svg { width: 16px; stroke-width: 1.6; }
.service-modal-assurance strong,
.service-modal-assurance small { display: block; font-family: var(--font-body, sans-serif); }
.service-modal-assurance strong { margin-bottom: 4px; font-size: 11px; font-weight: 600; }
.service-modal-assurance small { color: rgba(248, 242, 232, 0.45); font-size: 10px; line-height: 1.45; }

.service-modal-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  background: #fffdf9;
}

.service-modal-header { padding: 26px 30px 15px; }
.service-modal-progress { padding-right: 30px; padding-bottom: 18px; padding-left: 30px; }
.service-modal-body { padding: 26px 30px 30px; scrollbar-color: rgba(177, 143, 76, .35) transparent; }
.service-modal-footer { padding: 18px 30px; background: rgba(255, 253, 249, .94); backdrop-filter: blur(10px); }

.service-modal-main :deep(input),
.service-modal-main :deep(textarea) {
  min-height: 44px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(36, 34, 31, .02);
}

.service-modal-main :deep(textarea) { min-height: 88px; }
.service-modal-main :deep(label),
.service-modal-main :deep(button) { -webkit-tap-highlight-color: transparent; }
.service-modal-main :deep(button:focus-visible),
.service-modal-main :deep(input:focus-visible),
.service-modal-main :deep(textarea:focus-visible) { outline: 2px solid rgba(177, 143, 76, .6); outline-offset: 2px; }

@media (max-width: 767px) {
  .service-modal-shell {
    width: 100%;
    max-height: 92dvh;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 26px 26px 0 0;
  }

  .service-modal-aside { display: none; }
  .service-modal-main { min-height: 0; }
  .service-modal-header { padding: 20px 20px 12px; }
  .service-modal-progress { padding-right: 20px; padding-bottom: 15px; padding-left: 20px; }
  .service-modal-body { padding: 20px 20px 26px; }
  .service-modal-footer { padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); }
  .service-modal-footer :deep(button) { min-height: 44px; }
}
</style>
