<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import UiSelect from '../components/UiSelect.vue'
import { useAuth } from '../composables/useAuth'
import { US_STATES } from '../data/us-states'

const route = useRoute()
const { signup } = useAuth()

// Company name and tax ID are optional; everything else on this form is needed
// before a Full Admin can approve the account.
const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  companyName: '',
  taxId: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  password: '',
})

// Addresses are US-only: the country is fixed rather than asked for (the server
// stores 'US' whatever a caller sends), and the state comes from the USPS list.
const US_STATE_OPTIONS = US_STATES

const isLoading = ref(false)
const error = ref('')
const submittedReference = ref('')
const submittedMessage = ref('')
const formRef = ref<HTMLFormElement | null>(null)

// One message per field, shown under that field. Mirrors the server's rules in
// server/api/signup-requests.js so the applicant is not bounced by a round trip
// for something we can catch here.
type FormField = keyof typeof form
const errors = reactive<Partial<Record<FormField, string>>>({})

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const US_ZIP_PATTERN = /^\d{5}(-\d{4})?$/
const REQUIRED_FIELDS: FormField[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'addressLine1',
  'city',
  'state',
  'postalCode',
  'password',
]

function getFieldError(field: FormField) {
  if (field === 'firstName' && !form.firstName.trim()) return 'Enter your first name.'
  if (field === 'lastName' && !form.lastName.trim()) return 'Enter your last name.'
  if (field === 'email') {
    if (!form.email.trim()) return 'Enter your email address.'
    if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid email address.'
  }
  if (field === 'phone') {
    if (!form.phone.trim()) return 'Enter your phone number.'
    if (form.phone.replace(/\D/g, '').length < 7) return 'Enter a valid phone number.'
  }
  if (field === 'addressLine1' && !form.addressLine1.trim()) return 'Enter your street address.'
  if (field === 'city' && !form.city.trim()) return 'Enter your city.'
  if (field === 'state' && !form.state) return 'Choose a state.'
  if (field === 'postalCode') {
    if (!form.postalCode.trim()) return 'Enter your ZIP code.'
    if (!US_ZIP_PATTERN.test(form.postalCode.trim())) return 'Use 12345 or 12345-6789.'
  }
  if (field === 'password') {
    if (!form.password) return 'Choose a password.'
    if (form.password.length < 8) return 'Use at least 8 characters.'
  }
  return ''
}

function validateField(field: FormField) {
  const message = getFieldError(field)
  if (message) errors[field] = message
  else delete errors[field]
}

function revalidateErroredField(field: FormField) {
  if (errors[field]) validateField(field)
}

function errorId(field: FormField) {
  return `signup-${field}-error`
}

function validate() {
  ;(Object.keys(errors) as FormField[]).forEach((key) => delete errors[key])
  REQUIRED_FIELDS.forEach(validateField)
  return !Object.keys(errors).length
}

async function revealFirstError() {
  await nextTick()
  const firstInvalidField = REQUIRED_FIELDS.find((field) => errors[field])
  if (!firstInvalidField) return
  const fieldHost = formRef.value?.querySelector<HTMLElement>(`[data-field="${firstInvalidField}"]`)
  const control = fieldHost?.matches('input, button, select, textarea')
    ? fieldHost
    : fieldHost?.querySelector<HTMLElement>('input, button, select, textarea')
  control?.focus({ preventScroll: true })
  control?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const returnTo = computed(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
})
const cameFromLockedCollection = computed(() => returnTo.value.startsWith('/collections'))

// The border colour is swapped rather than layered, so a field never carries two
// competing border utilities.
const baseFieldClass =
  'ect-w-full ect-px-4 ect-py-3.5 ect-bg-cream ect-border ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-ring-2 focus:ect-bg-white ect-transition-all'
const validFieldClass = 'ect-border-sand focus:ect-border-gold-400 focus:ect-ring-gold-400/25'
const invalidFieldClass = 'ect-border-red-400 focus:ect-border-red-400 focus:ect-ring-red-400/25'
const labelClass =
  'ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block'
const errorClass = 'ect-font-body ect-text-xs ect-text-red-600 ect-mt-1.5 ect-block'
const optionalClass = 'ect-text-charcoal/35 ect-normal-case ect-tracking-normal ect-font-normal'
const sectionClass =
  'ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-text-gold-700'

function fieldClass(field: FormField) {
  return [baseFieldClass, errors[field] ? invalidFieldClass : validFieldClass]
}

// Submitting never signs anyone in — the account does not exist until it is
// approved — so the form is replaced by a confirmation panel instead of a redirect.
async function handleSubmit() {
  error.value = ''
  if (!validate()) {
    await revealFirstError()
    return
  }
  isLoading.value = true
  try {
    const { request, message } = await signup({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      companyName: form.companyName,
      taxId: form.taxId,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      state: form.state,
      postalCode: form.postalCode,
      password: form.password,
    })
    submittedReference.value = request.reference
    submittedMessage.value = message
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to submit your sign-up request.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <section class="ect-min-h-screen ect-flex ect-items-center ect-justify-center ect-px-4 ect-pt-16 ect-pb-16 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream">
    <article class="ect-w-full ect-max-w-2xl">
      <div class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-overflow-hidden">
        <div class="ect-h-1 ect-bg-gradient-to-r ect-from-gold-200 ect-via-gold-400 ect-to-gold-200" />

        <!-- Confirmation: the request is filed and awaiting a Full Admin. -->
        <div v-if="submittedReference" class="ect-px-8 ect-pt-12 ect-pb-10 sm:ect-px-12 ect-text-center">
          <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-14 ect-h-14 ect-rounded-full ect-bg-champagne/60 ect-text-gold-700 ect-mb-6">
            <svg class="ect-w-7 ect-h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <p :class="sectionClass" class="ect-mb-3">Awaiting approval</p>
          <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-tracking-wide ect-mb-3">Request received</h1>
          <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-max-w-md ect-mx-auto">{{ submittedMessage }}</p>
          <div class="ect-inline-flex ect-items-center ect-gap-2 ect-mt-6 ect-rounded-full ect-bg-cream ect-border ect-border-sand ect-px-4 ect-py-2.5">
            <span class="ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40">Reference</span>
            <span class="ect-font-body ect-text-sm ect-font-semibold ect-tracking-[0.08em] ect-text-charcoal">{{ submittedReference }}</span>
          </div>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/50 ect-mt-6">
            You will not be able to sign in until an account manager approves this request. We have emailed a copy to
            <span class="ect-text-charcoal/70">{{ form.email }}</span>.
          </p>
          <RouterLink to="/" class="ect-inline-block ect-mt-8 ect-font-body ect-text-sm ect-font-semibold ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors">
            Back to the storefront
          </RouterLink>
        </div>

        <div v-else class="ect-px-8 ect-pt-10 ect-pb-8 sm:ect-px-10 sm:ect-pt-12 sm:ect-pb-10">
          <header class="ect-text-center ect-mb-8">
            <p :class="sectionClass" class="ect-mb-3">Osiyan</p>
            <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-tracking-wide ect-mb-2">Request an account</h1>
            <p class="ect-font-body ect-text-base ect-text-charcoal/60">
              {{ cameFromLockedCollection ? 'Every design unlocks once your account is approved' : 'Accounts are reviewed and approved by our team' }}
            </p>
          </header>

          <!-- novalidate: the inline messages below each field are the single
               source of validation feedback, rather than browser bubbles. -->
          <form ref="formRef" novalidate @submit.prevent="handleSubmit" class="ect-space-y-8">
            <p class="ect-font-body ect-text-xs ect-text-charcoal/40">
              <span class="ect-text-red-500">*</span> Required
            </p>

            <fieldset class="ect-space-y-5">
              <legend :class="sectionClass">Your details</legend>
              <div class="ect-grid sm:ect-grid-cols-2 ect-gap-5">
                <label class="ect-block">
                  <span :class="labelClass">First name <span class="ect-text-red-500">*</span></span>
                  <input
                    v-model="form.firstName"
                    type="text"
                    required
                    data-field="firstName"
                    autocomplete="given-name"
                    placeholder="Jane"
                    :class="fieldClass('firstName')"
                    :aria-invalid="!!errors.firstName"
                    :aria-describedby="errors.firstName ? errorId('firstName') : undefined"
                    @input="revalidateErroredField('firstName')"
                    @blur="validateField('firstName')"
                  />
                  <span v-if="errors.firstName" :id="errorId('firstName')" role="alert" :class="errorClass">{{ errors.firstName }}</span>
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Last name <span class="ect-text-red-500">*</span></span>
                  <input
                    v-model="form.lastName"
                    type="text"
                    required
                    data-field="lastName"
                    autocomplete="family-name"
                    placeholder="Doe"
                    :class="fieldClass('lastName')"
                    :aria-invalid="!!errors.lastName"
                    :aria-describedby="errors.lastName ? errorId('lastName') : undefined"
                    @input="revalidateErroredField('lastName')"
                    @blur="validateField('lastName')"
                  />
                  <span v-if="errors.lastName" :id="errorId('lastName')" role="alert" :class="errorClass">{{ errors.lastName }}</span>
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Email <span class="ect-text-red-500">*</span></span>
                  <input
                    v-model="form.email"
                    type="email"
                    required
                    data-field="email"
                    autocomplete="email"
                    placeholder="you@company.com"
                    :class="fieldClass('email')"
                    :aria-invalid="!!errors.email"
                    :aria-describedby="errors.email ? errorId('email') : undefined"
                    @input="revalidateErroredField('email')"
                    @blur="validateField('email')"
                  />
                  <span v-if="errors.email" :id="errorId('email')" role="alert" :class="errorClass">{{ errors.email }}</span>
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Phone <span class="ect-text-red-500">*</span></span>
                  <input
                    v-model="form.phone"
                    type="tel"
                    required
                    data-field="phone"
                    autocomplete="tel"
                    placeholder="+1 (555) 123-4567"
                    :class="fieldClass('phone')"
                    :aria-invalid="!!errors.phone"
                    :aria-describedby="errors.phone ? errorId('phone') : undefined"
                    @input="revalidateErroredField('phone')"
                    @blur="validateField('phone')"
                  />
                  <span v-if="errors.phone" :id="errorId('phone')" role="alert" :class="errorClass">{{ errors.phone }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="ect-space-y-5">
              <legend :class="sectionClass">Business</legend>
              <div class="ect-grid sm:ect-grid-cols-2 ect-gap-5">
                <label class="ect-block">
                  <span :class="labelClass">Company name <span :class="optionalClass">(optional)</span></span>
                  <input
                    v-model="form.companyName"
                    type="text"
                    autocomplete="organization"
                    placeholder="Doe Jewelers LLC"
                    :class="fieldClass('companyName')"
                  />
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Tax ID <span :class="optionalClass">(optional)</span></span>
                  <input
                    v-model="form.taxId"
                    type="text"
                    placeholder="EIN 12-3456789"
                    :class="fieldClass('taxId')"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset class="ect-space-y-5">
              <legend :class="sectionClass">Address</legend>
              <label class="ect-block">
                <span :class="labelClass">Street address <span class="ect-text-red-500">*</span></span>
                <input
                  v-model="form.addressLine1"
                  type="text"
                  required
                  data-field="addressLine1"
                  autocomplete="address-line1"
                  placeholder="1234 Market Street"
                  :class="fieldClass('addressLine1')"
                  :aria-invalid="!!errors.addressLine1"
                  :aria-describedby="errors.addressLine1 ? errorId('addressLine1') : undefined"
                  @input="revalidateErroredField('addressLine1')"
                  @blur="validateField('addressLine1')"
                />
                <span v-if="errors.addressLine1" :id="errorId('addressLine1')" role="alert" :class="errorClass">{{ errors.addressLine1 }}</span>
              </label>
              <label class="ect-block">
                <span :class="labelClass">Apt, suite, floor <span :class="optionalClass">(optional)</span></span>
                <input
                  v-model="form.addressLine2"
                  type="text"
                  autocomplete="address-line2"
                  placeholder="Suite 500"
                  :class="fieldClass('addressLine2')"
                />
              </label>
              <div class="ect-grid sm:ect-grid-cols-2 ect-gap-5">
                <label class="ect-block">
                  <span :class="labelClass">City <span class="ect-text-red-500">*</span></span>
                  <input
                    v-model="form.city"
                    type="text"
                    required
                    data-field="city"
                    autocomplete="address-level2"
                    placeholder="San Francisco"
                    :class="fieldClass('city')"
                    :aria-invalid="!!errors.city"
                    :aria-describedby="errors.city ? errorId('city') : undefined"
                    @input="revalidateErroredField('city')"
                    @blur="validateField('city')"
                  />
                  <span v-if="errors.city" :id="errorId('city')" role="alert" :class="errorClass">{{ errors.city }}</span>
                </label>
                <div class="ect-block">
                  <span :class="labelClass">State <span class="ect-text-red-500">*</span></span>
                  <UiSelect
                    data-field="state"
                    :model-value="form.state"
                    :options="US_STATE_OPTIONS"
                    placeholder="Choose a state"
                    aria-label="State"
                    :invalid="!!errors.state"
                    :described-by="errors.state ? errorId('state') : undefined"
                    @update:model-value="(v) => { form.state = v; validateField('state') }"
                  />
                  <span v-if="errors.state" :id="errorId('state')" role="alert" :class="errorClass">{{ errors.state }}</span>
                </div>
                <label class="ect-block">
                  <span :class="labelClass">ZIP code <span class="ect-text-red-500">*</span></span>
                  <input
                    v-model="form.postalCode"
                    type="text"
                    required
                    data-field="postalCode"
                    inputmode="numeric"
                    autocomplete="postal-code"
                    placeholder="94103"
                    :class="fieldClass('postalCode')"
                    :aria-invalid="!!errors.postalCode"
                    :aria-describedby="errors.postalCode ? errorId('postalCode') : undefined"
                    @input="revalidateErroredField('postalCode')"
                    @blur="validateField('postalCode')"
                  />
                  <span v-if="errors.postalCode" :id="errorId('postalCode')" role="alert" :class="errorClass">{{ errors.postalCode }}</span>
                </label>
                <div class="ect-block">
                  <span :class="labelClass">Country</span>
                  <p class="ect-w-full ect-px-4 ect-py-3.5 ect-bg-cream/60 ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal/55">United States</p>
                </div>
              </div>
            </fieldset>

            <fieldset class="ect-space-y-5">
              <legend :class="sectionClass">Password</legend>
              <label class="ect-block">
                <span :class="labelClass">Choose a password <span class="ect-text-red-500">*</span></span>
                <input
                  v-model="form.password"
                  type="password"
                  required
                  data-field="password"
                  autocomplete="new-password"
                  :class="fieldClass('password')"
                  :aria-invalid="!!errors.password"
                  :aria-describedby="errors.password ? errorId('password') : 'signup-password-hint'"
                  @input="revalidateErroredField('password')"
                  @blur="validateField('password')"
                />
                <span v-if="errors.password" :id="errorId('password')" role="alert" :class="errorClass">{{ errors.password }}</span>
                <span v-else id="signup-password-hint" class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mt-1.5 ect-block">At least 8 characters. You will use it to sign in once your account is approved.</span>
              </label>
            </fieldset>

            <button
              type="submit"
              :disabled="isLoading"
              class="ect-w-full ect-py-4 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-rounded-xl hover:ect-bg-noir focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400 focus:ect-ring-offset-2 focus:ect-ring-offset-white ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
            >
              {{ isLoading ? 'Submitting request…' : 'Submit for approval' }}
            </button>
            <p v-if="error" class="ect-font-body ect-text-xs ect-text-red-600">{{ error }}</p>
          </form>

          <footer class="ect-mt-8 ect-pt-6 ect-border-t ect-border-sand ect-text-center">
            <p class="ect-font-body ect-text-sm ect-text-charcoal/60">
              Already have an account?
              <RouterLink :to="{ name: 'login', query: returnTo === '/' ? {} : { redirect: returnTo } }" class="ect-text-gold-700 hover:ect-text-gold-800 ect-font-semibold ect-transition-colors">Sign in</RouterLink>
            </p>
            <p class="ect-mt-4 ect-flex ect-items-center ect-justify-center ect-gap-1.5 ect-font-body ect-text-[11px] ect-text-charcoal/40">
              <svg class="ect-w-3.5 ect-h-3.5 ect-text-gold-600/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Reviewed and approved by our team
            </p>
          </footer>
        </div>
      </div>
    </article>
  </section>
</template>
