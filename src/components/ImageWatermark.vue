<script setup lang="ts">
import { useSiteConfig } from '../composables/useSiteConfig'

// A small, semi-transparent logo tucked into the bottom-right corner of
// product imagery to deter casual reuse of screenshots / saved images. Purely
// cosmetic protection — it does not stop a determined user.
//
// Drop inside any `position: relative; overflow: hidden` image container.
const props = withDefaults(
  defineProps<{
    /** Watermark opacity, 0–1. */
    opacity?: number
    /** Mark width as a fraction of the container width, 0–1. */
    scale?: number
  }>(),
  { opacity: 0.55, scale: 0.2 },
)

const { logoSrc } = useSiteConfig()
</script>

<template>
  <span
    class="ect-pointer-events-none ect-absolute ect-inset-0 ect-z-[5] ect-flex ect-items-end ect-justify-end ect-p-2.5 ect-select-none"
    aria-hidden="true"
  >
    <img
      :src="logoSrc"
      alt=""
      draggable="false"
      class="ect-h-auto ect-max-w-none ect-object-contain"
      :style="{ width: `${scale * 100}%`, opacity }"
    />
  </span>
</template>
