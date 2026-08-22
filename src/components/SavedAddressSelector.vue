<script setup lang="ts">
import { computed, ref } from 'vue'
import { countryDisplayName, type SavedAddressEntry } from '../composables/useSavedAddresses'

const props = withDefaults(defineProps<{
  modelValue: string
  addresses: SavedAddressEntry[]
  label?: string
  newAddressLabel?: string
  newAddressHint?: string
  helperText?: string
}>(), {
  label: 'Shipping to',
  newAddressLabel: 'A new address',
  newAddressHint: 'Enter the details below',
  helperText: 'Selecting a saved address fills your contact details and shipping address.',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isChoosing = ref(false)
const selectedAddress = computed(() => props.addresses.find((address) => address.id === props.modelValue))
const selectedTitle = computed(() => selectedAddress.value?.label || props.newAddressLabel)
const selectedDescription = computed(() => {
  const address = selectedAddress.value
  if (!address) return props.newAddressHint
  return [
    address.address,
    `${address.city}, ${address.state} ${address.pincode}`.trim(),
    countryDisplayName(address.country),
  ].filter(Boolean).join(' · ')
})

function choose(value: string) {
  emit('update:modelValue', value)
  isChoosing.value = false
}
</script>

<template>
  <div class="ect-block">
    <span class="ect-font-body ect-text-sm ect-font-medium ect-text-charcoal/60 ect-mb-2 ect-block">{{ label }}</span>

    <div class="ect-flex ect-items-center ect-gap-3 sm:ect-gap-4 ect-rounded-2xl ect-border ect-border-gold-400 ect-bg-cream/70 ect-p-4 sm:ect-p-5">
      <span class="ect-flex ect-h-8 ect-w-8 ect-shrink-0 ect-items-center ect-justify-center ect-rounded-full ect-bg-gold-500 ect-text-white" aria-hidden="true">
        <svg class="ect-h-5 ect-w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
      <span class="ect-min-w-0 ect-flex-1">
        <span class="ect-block ect-font-body ect-text-base ect-font-semibold ect-text-charcoal">{{ selectedTitle }}</span>
        <span class="ect-mt-0.5 ect-block ect-truncate ect-font-body ect-text-sm ect-text-charcoal/50">{{ selectedDescription }}</span>
      </span>
      <button
        v-if="addresses.length"
        type="button"
        class="ect-shrink-0 ect-rounded-lg ect-px-2 ect-py-1 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-bg-white/70 hover:ect-text-charcoal focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40 ect-transition-colors"
        :aria-expanded="isChoosing"
        @click="isChoosing = !isChoosing"
      >
        {{ isChoosing ? 'Done' : 'Change' }}
      </button>
    </div>

    <div v-if="isChoosing" role="radiogroup" :aria-label="label" class="ect-mt-3 ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-2.5">
      <button
        type="button"
        role="radio"
        :aria-checked="modelValue === ''"
        class="ect-flex ect-items-start ect-gap-3 ect-rounded-xl ect-border ect-p-3.5 ect-text-left ect-transition-all ect-duration-200"
        :class="modelValue === ''
          ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
          : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
        @click="choose('')"
      >
        <span class="ect-mt-0.5 ect-flex ect-h-5 ect-w-5 ect-shrink-0 ect-items-center ect-justify-center ect-rounded-full ect-border"
          :class="modelValue === '' ? 'ect-border-gold-500 ect-bg-gold-500 ect-text-white' : 'ect-border-charcoal/20 ect-text-transparent'">
          <svg class="ect-h-3 ect-w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
        <span class="ect-min-w-0 ect-flex-1">
          <span class="ect-block ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ newAddressLabel }}</span>
          <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/50">{{ newAddressHint }}</span>
        </span>
      </button>

      <button
        v-for="address in addresses"
        :key="address.id"
        type="button"
        role="radio"
        :aria-checked="modelValue === address.id"
        class="ect-flex ect-items-start ect-gap-3 ect-rounded-xl ect-border ect-p-3.5 ect-text-left ect-transition-all ect-duration-200"
        :class="modelValue === address.id
          ? 'ect-border-gold-400 ect-bg-champagne/50 ect-shadow-card'
          : 'ect-border-sand hover:ect-border-gold-300 hover:ect-bg-champagne/40'"
        @click="choose(address.id)"
      >
        <span class="ect-mt-0.5 ect-flex ect-h-5 ect-w-5 ect-shrink-0 ect-items-center ect-justify-center ect-rounded-full ect-border"
          :class="modelValue === address.id ? 'ect-border-gold-500 ect-bg-gold-500 ect-text-white' : 'ect-border-charcoal/20 ect-text-transparent'">
          <svg class="ect-h-3 ect-w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
        <span class="ect-min-w-0 ect-flex-1">
          <span class="ect-flex ect-items-center ect-gap-2">
            <span class="ect-block ect-truncate ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ address.label }}</span>
            <span v-if="address.isDefault" class="ect-rounded-full ect-bg-charcoal ect-px-2 ect-py-0.5 ect-font-body ect-text-[9px] ect-font-semibold ect-uppercase ect-tracking-wider ect-text-white">Default</span>
          </span>
          <span class="ect-block ect-truncate ect-font-body ect-text-xs ect-text-charcoal/50">{{ address.address }}</span>
          <span class="ect-block ect-truncate ect-font-body ect-text-xs ect-text-charcoal/50">{{ address.city }}, {{ address.state }} {{ address.pincode }} · {{ countryDisplayName(address.country) }}</span>
        </span>
      </button>
    </div>

    <span v-if="helperText" class="ect-mt-2 ect-block ect-font-body ect-text-xs ect-text-charcoal/40">{{ helperText }}</span>
  </div>
</template>
