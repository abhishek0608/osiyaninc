<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import UiSelect from '../components/UiSelect.vue'
import { useAuth } from '../composables/useAuth'
import { US_STATES } from '../data/us-states'

const route = useRoute()
const { signup } = useAuth()

// Every field here is required for approval — a Full Admin reviews the tax ID,
// company and address before the account is created, so the form collects them
// up front rather than after sign-in.
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

const returnTo = computed(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
})
const cameFromLockedCollection = computed(() => returnTo.value.startsWith('/collections'))

const fieldClass =
  'ect-w-full ect-px-4 ect-py-3.5 ect-bg-cream ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 focus:ect-bg-white ect-transition-all'
const labelClass =
  'ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block'
const sectionClass =
  'ect-font-body ect-text-[11px] ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-text-gold-700'

// Submitting never signs anyone in — the account does not exist until it is
// approved — so the form is replaced by a confirmation panel instead of a redirect.
async function handleSubmit() {
  error.value = ''
  // A UiSelect is not a native form control, so `required` cannot cover it.
  if (!form.state) {
    error.value = 'Please choose a state.'
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

          <form @submit.prevent="handleSubmit" class="ect-space-y-8">
            <fieldset class="ect-space-y-5">
              <legend :class="sectionClass">Your details</legend>
              <div class="ect-grid sm:ect-grid-cols-2 ect-gap-5">
                <label class="ect-block">
                  <span :class="labelClass">First name</span>
                  <input v-model="form.firstName" type="text" required autocomplete="given-name" placeholder="Jane" :class="fieldClass" />
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Last name</span>
                  <input v-model="form.lastName" type="text" required autocomplete="family-name" placeholder="Doe" :class="fieldClass" />
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Email</span>
                  <input v-model="form.email" type="email" required autocomplete="email" placeholder="you@company.com" :class="fieldClass" />
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Phone</span>
                  <input v-model="form.phone" type="tel" required autocomplete="tel" placeholder="+1 (555) 123-4567" :class="fieldClass" />
                </label>
              </div>
            </fieldset>

            <fieldset class="ect-space-y-5">
              <legend :class="sectionClass">Business</legend>
              <div class="ect-grid sm:ect-grid-cols-2 ect-gap-5">
                <label class="ect-block">
                  <span :class="labelClass">Company name</span>
                  <input v-model="form.companyName" type="text" required autocomplete="organization" placeholder="Doe Jewelers LLC" :class="fieldClass" />
                </label>
                <label class="ect-block">
                  <span :class="labelClass">Tax ID</span>
                  <input v-model="form.taxId" type="text" required placeholder="EIN 12-3456789" :class="fieldClass" />
                </label>
              </div>
            </fieldset>

            <fieldset class="ect-space-y-5">
              <legend :class="sectionClass">Address</legend>
              <label class="ect-block">
                <span :class="labelClass">Street address</span>
                <input v-model="form.addressLine1" type="text" required autocomplete="address-line1" placeholder="1234 Market Street" :class="fieldClass" />
              </label>
              <label class="ect-block">
                <span :class="labelClass">Apt, suite, floor <span class="ect-text-charcoal/35 ect-normal-case ect-tracking-normal ect-font-normal">(optional)</span></span>
                <input v-model="form.addressLine2" type="text" autocomplete="address-line2" placeholder="Suite 500" :class="fieldClass" />
              </label>
              <div class="ect-grid sm:ect-grid-cols-2 ect-gap-5">
                <label class="ect-block">
                  <span :class="labelClass">City</span>
                  <input v-model="form.city" type="text" required autocomplete="address-level2" placeholder="San Francisco" :class="fieldClass" />
                </label>
                <div class="ect-block">
                  <span :class="labelClass">State</span>
                  <UiSelect
                    :model-value="form.state"
                    :options="US_STATE_OPTIONS"
                    placeholder="Choose a state"
                    aria-label="State"
                    @update:model-value="(v) => (form.state = v)"
                  />
                </div>
                <label class="ect-block">
                  <span :class="labelClass">ZIP code</span>
                  <input
                    v-model="form.postalCode"
                    type="text"
                    required
                    inputmode="numeric"
                    autocomplete="postal-code"
                    pattern="\d{5}(-\d{4})?"
                    title="5 digits, or ZIP+4 as 12345-6789"
                    placeholder="94103"
                    :class="fieldClass"
                  />
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
                <span :class="labelClass">Choose a password</span>
                <input v-model="form.password" type="password" required minlength="8" autocomplete="new-password" placeholder="••••••••" :class="fieldClass" />
                <span class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mt-1.5 ect-block">At least 8 characters. You will use it to sign in once your account is approved.</span>
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
