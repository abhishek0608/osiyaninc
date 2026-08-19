<script setup lang="ts">
import { computed } from 'vue'
import type { ProductCertification } from '../data/products'

// The "GIA Certified" tag laid over a piece's photograph. The lab name comes
// from the product record, so a piece graded elsewhere reads "IGI Certified"
// without a code change.
//
// Sits bottom-left by design: top-left is the NEW badge on a catalog card and
// the image counter on the product page, and bottom-right is the watermark.
// Drop inside any `position: relative; overflow: hidden` image container, the
// same way as ImageWatermark.
const props = withDefaults(
  defineProps<{
    certification?: ProductCertification | null
    /** `sm` for catalog tiles, `md` for the product-page stage. */
    size?: 'sm' | 'md'
  }>(),
  { size: 'sm' },
)

// An in-house certificate is ours, not a lab's, so it is labelled as such
// rather than claiming third-party grading.
const label = computed(() => {
  const lab = props.certification?.lab?.trim() || ''
  if (!lab) return ''
  return /^in[-\s]?house$/i.test(lab) ? 'Certified in-house' : `${lab} Certified`
})
</script>

<template>
  <span
    v-if="label"
    class="ect-pointer-events-none ect-absolute ect-z-[6] ect-inline-flex ect-items-center ect-gap-1 ect-rounded-full ect-border ect-border-gold-200 ect-bg-white/92 ect-backdrop-blur-sm ect-font-body ect-font-semibold ect-uppercase ect-text-gold-700 ect-shadow-sm ect-select-none"
    :class="size === 'md'
      ? 'ect-bottom-3 ect-left-3 ect-gap-1.5 ect-px-3 ect-py-1.5 ect-text-[11px] ect-tracking-[0.14em]'
      : 'ect-bottom-2 ect-left-2 ect-px-2 ect-py-1 ect-text-[9px] ect-tracking-[0.06em]'"
    :title="certification?.number ? `Certificate no. ${certification.number}` : label"
  >
    <svg
      class="ect-shrink-0 ect-text-gold-400"
      :class="size === 'md' ? 'ect-h-3.5 ect-w-3.5' : 'ect-h-3 ect-w-3'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 5.25-3.75 8.25-9 9.75C6.75 20.25 3 17.25 3 12V5.25l9-3 9 3V12z" />
    </svg>
    {{ label }}
  </span>
</template>
