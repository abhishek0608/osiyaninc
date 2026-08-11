<script setup lang="ts">
import { computed, ref } from 'vue'
import UiSelect from './UiSelect.vue'
import { SERVICE_OFFERINGS } from '../data/services-catalog'
import { useAuth } from '../composables/useAuth'
import { createInternalServiceRequest, type ServiceRequestRow } from '../composables/useServiceRequests'

const emit = defineEmits<{ close: []; created: [] }>()

const { user } = useAuth()

const serviceId = ref(SERVICE_OFFERINGS[0]?.id || '')
const customerName = ref('')
const customerEmail = ref('')
const customerPhone = ref('')
const notes = ref('')
const errorMsg = ref('')
const saving = ref(false)

const serviceOptions = SERVICE_OFFERINGS.map((offering) => ({
  value: offering.id,
  label: `${offering.title} — ${offering.subtitle}`,
}))

const selectedService = computed(
  () => SERVICE_OFFERINGS.find((offering) => offering.id === serviceId.value) || null,
)

async function submit() {
  if (saving.value) return
  errorMsg.value = ''
  if (!selectedService.value) {
    errorMsg.value = 'Pick a service.'
    return
  }
  if (!customerName.value.trim()) {
    errorMsg.value = 'Customer name is required.'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.value.trim())) {
    errorMsg.value = 'A valid customer email is required.'
    return
  }
  const userId = user.value?.id
  if (!userId) {
    errorMsg.value = 'Your session has expired. Please sign in again.'
    return
  }
  const rows: ServiceRequestRow[] = []
  if (customerPhone.value.trim()) rows.push({ label: 'Phone', value: customerPhone.value.trim() })
  if (notes.value.trim()) rows.push({ label: 'Notes', value: notes.value.trim() })
  saving.value = true
  try {
    await createInternalServiceRequest(userId, {
      service: selectedService.value,
      customerName: customerName.value.trim(),
      customerEmail: customerEmail.value.trim(),
      customerPhone: customerPhone.value.trim(),
      rows,
    })
    emit('created')
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Could not create the service request.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    class="ect-fixed ect-inset-0 ect-z-[60] ect-flex ect-items-center ect-justify-center ect-bg-charcoal/40 ect-backdrop-blur-sm ect-p-4"
    role="dialog"
    aria-modal="true"
    aria-label="New service request"
    @click.self="emit('close')"
  >
    <div class="ect-w-full ect-max-w-md ect-max-h-[85vh] ect-overflow-y-auto ect-rounded-2xl ect-bg-white ect-p-6 ect-shadow-2xl">
      <h3 class="ect-font-display ect-text-xl ect-text-charcoal">New service request</h3>
      <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55">
        Log a request taken over the phone or in the showroom. It is saved alongside requests booked through the storefront.
      </p>

      <div class="ect-mt-5 ect-space-y-3">
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Service *</span>
          <UiSelect v-model="serviceId" :options="serviceOptions" class="ect-mt-1" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Customer name *</span>
          <input v-model="customerName" type="text" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Customer email *</span>
          <input v-model="customerEmail" type="email" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Phone</span>
          <input v-model="customerPhone" type="tel" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Notes</span>
          <textarea v-model="notes" rows="3" placeholder="What does the customer need?" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"></textarea>
        </label>
      </div>

      <p v-if="errorMsg" class="ect-mt-3 ect-font-body ect-text-sm ect-text-red-600">{{ errorMsg }}</p>

      <div class="ect-mt-6 ect-flex ect-justify-end ect-gap-2">
        <button
          type="button"
          class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="saving"
          class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-60 disabled:ect-cursor-not-allowed"
          @click="submit"
        >
          {{ saving ? 'Creating…' : 'Create request' }}
        </button>
      </div>
    </div>
  </div>
</template>
