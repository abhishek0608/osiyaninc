<script setup lang="ts">
import { computed } from 'vue'
import { useSiteConfig } from '../composables/useSiteConfig'

const props = withDefaults(
  defineProps<{
    /** Current cart quantity, used to highlight the tier currently unlocked. */
    currentQty?: number
    /** Which edge of the trigger the tooltip should align to. */
    align?: 'left' | 'right'
    /** Short text shown next to the icon (omit for an icon-only trigger). */
    label?: string
  }>(),
  { currentQty: 0, align: 'left', label: 'Volume discount' },
)

const { volumeDiscountEnabled, volumeDiscountTiers } = useSiteConfig()

// Tiers arrive sorted high→low; show them low→high so the table reads naturally.
const tiers = computed(() => [...volumeDiscountTiers.value].sort((a, b) => a.minQty - b.minQty))
const show = computed(() => volumeDiscountEnabled.value && tiers.value.length > 0)

// The best tier the current quantity satisfies (highest minQty ≤ currentQty).
const activeMinQty = computed(() => {
  const eligible = tiers.value.filter((t) => props.currentQty >= t.minQty)
  const best = eligible[eligible.length - 1]
  return best ? best.minQty : null
})
</script>

<template>
  <span v-if="show" class="ect-relative ect-inline-flex ect-items-center ect-group/vdi ect-align-middle">
    <button
      type="button"
      class="ect-inline-flex ect-items-center ect-gap-1 ect-font-body ect-text-[11px] ect-font-semibold ect-text-charcoal/55 hover:ect-text-charcoal focus:ect-outline-none focus-visible:ect-text-charcoal ect-transition-colors"
      aria-label="Volume discount details"
    >
      <svg class="ect-w-4 ect-h-4 ect-text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
      <span v-if="label">{{ label }}</span>
    </button>

    <span
      class="ect-absolute ect-bottom-full ect-mb-2 ect-w-60 ect-bg-white ect-rounded-xl ect-shadow-xl ect-shadow-charcoal/10 ect-ring-1 ect-ring-charcoal/[0.06] ect-p-3 ect-opacity-0 ect-invisible group-hover/vdi:ect-opacity-100 group-hover/vdi:ect-visible group-focus-within/vdi:ect-opacity-100 group-focus-within/vdi:ect-visible ect-transition-all ect-duration-200 ect-z-20"
      :class="align === 'right' ? 'ect-right-0' : 'ect-left-0'"
    >
      <span class="ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-block ect-mb-2">
        Buy more, save more
      </span>
      <span class="ect-block ect-space-y-1">
        <span
          v-for="t in tiers"
          :key="t.minQty"
          class="ect-flex ect-justify-between ect-items-center ect-rounded-lg ect-px-2 ect-py-1"
          :class="activeMinQty === t.minQty ? 'ect-bg-gold-50' : ''"
        >
          <span class="ect-font-body ect-text-xs ect-text-charcoal/65">{{ t.minQty }}+ items</span>
          <span
            class="ect-font-body ect-text-xs ect-font-semibold"
            :class="activeMinQty === t.minQty ? 'ect-text-gold-600' : 'ect-text-charcoal'"
          >{{ t.percent }}% off</span>
        </span>
      </span>
      <span class="ect-block ect-mt-2 ect-font-body ect-text-[10px] ect-leading-4 ect-text-charcoal/40">
        Discount applies automatically to your cart total based on quantity.
      </span>
    </span>
  </span>
</template>
