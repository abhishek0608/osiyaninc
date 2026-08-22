<script setup lang="ts">
import { computed } from 'vue'
import { countryDisplayName, type SavedAddressEntry } from '../composables/useSavedAddresses'

const props = withDefaults(defineProps<{
  modelValue: string
  addresses: SavedAddressEntry[]
  label?: string
  newAddressLabel?: string
  newAddressHint?: string
  helperText?: string
}>(), {
  label: 'Saved shipping address',
  newAddressLabel: 'Use a new address',
  newAddressHint: 'Enter details manually below',
  helperText: 'Selecting a saved address fills your contact details and shipping address.',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const selection = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})
</script>

<template>
  <div v-if="addresses.length" role="radiogroup" :aria-label="label" class="ect-block">
    <span class="ect-font-body ect-text-xs ect-font-medium ect-text-charcoal/60 ect-mb-1.5 ect-block">{{ label }}</span>
    <div class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-2.5">
      <label
        v-for="address in addresses"
        :key="address.id"
        class="ect-flex ect-items-start ect-gap-3 ect-p-3.5 ect-rounded-xl ect-cursor-pointer ect-border ect-transition-all ect-duration-200"
        :class="selection === address.id
          ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
          : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
      >
        <input v-model="selection" type="radio" :value="address.id" class="ect-accent-charcoal ect-w-4 ect-h-4 ect-shrink-0 ect-mt-0.5" />
        <span class="ect-flex-1 ect-min-w-0">
          <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-block ect-truncate">{{ address.label }}</span>
          <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block ect-truncate">{{ address.address }}</span>
          <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block ect-truncate">{{ address.city }}, {{ address.state }} {{ address.pincode }} · {{ countryDisplayName(address.country) }}</span>
        </span>
        <span v-if="selection === address.id" class="ect-w-5 ect-h-5 ect-rounded-full ect-bg-champagne/500 ect-flex ect-items-center ect-justify-center ect-shrink-0" aria-hidden="true">
          <svg class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      </label>

      <label
        class="ect-flex ect-items-start ect-gap-3 ect-p-3.5 ect-rounded-xl ect-cursor-pointer ect-border ect-transition-all ect-duration-200"
        :class="selection === ''
          ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
          : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
      >
        <input v-model="selection" type="radio" value="" class="ect-accent-charcoal ect-w-4 ect-h-4 ect-shrink-0 ect-mt-0.5" />
        <span class="ect-flex-1 ect-min-w-0">
          <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-block">{{ newAddressLabel }}</span>
          <span class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-block">{{ newAddressHint }}</span>
        </span>
        <span v-if="selection === ''" class="ect-w-5 ect-h-5 ect-rounded-full ect-bg-champagne/500 ect-flex ect-items-center ect-justify-center ect-shrink-0" aria-hidden="true">
          <svg class="ect-w-3 ect-h-3 ect-text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      </label>
    </div>
    <span v-if="helperText" class="ect-mt-1.5 ect-block ect-font-body ect-text-[11px] ect-text-charcoal/40">{{ helperText }}</span>
  </div>
</template>
