<script setup lang="ts">
import { ref, watch } from 'vue'
import { productImageUrl } from '../composables/productImageUrl'

// Photo for one order/memo line. The server resolves `image` (S3 first, DB rows
// as the fallback); a piece with no photo, or one that fails to load, gets a
// plain placeholder so the rows still line up.
const props = withDefaults(
  defineProps<{ image?: string | null; alt?: string; size?: 'sm' | 'md' }>(),
  { image: '', alt: '', size: 'md' },
)

const failed = ref(false)
watch(
  () => props.image,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <span
    class="ect-shrink-0 ect-flex ect-items-center ect-justify-center ect-overflow-hidden ect-rounded-lg ect-bg-charcoal/5"
    :class="size === 'sm' ? 'ect-w-10 ect-h-10' : 'ect-w-14 ect-h-14'"
  >
    <img
      v-if="image && !failed"
      :src="productImageUrl(image, size === 'sm' ? 80 : 112)"
      :alt="alt"
      loading="lazy"
      class="ect-w-full ect-h-full ect-object-cover"
      @error="failed = true"
    />
    <svg v-else class="ect-w-5 ect-h-5 ect-text-charcoal/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0021.75 19.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21zm10.5-11.25h.008v.008h-.008V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  </span>
</template>
