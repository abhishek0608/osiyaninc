<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  rating: number
  max?: number
  size?: 'sm' | 'md'
}>()

const max = computed(() => props.max ?? 5)
const sizeClass = computed(() => (props.size === 'sm' ? 'ect-w-3.5 ect-h-3.5' : 'ect-w-4 ect-h-4'))

function starFill(index: number): 'full' | 'half' | 'empty' {
  const r = props.rating
  const i = index + 1
  if (r >= i) return 'full'
  if (r >= i - 0.5) return 'half'
  return 'empty'
}
</script>

<template>
  <span class="ect-inline-flex ect-items-center ect-gap-0.5" role="img" :aria-label="`${rating} out of ${max} stars`">
    <template v-for="n in max" :key="n">
      <span v-if="starFill(n - 1) === 'full'" :class="[sizeClass, 'ect-text-amber-400']" aria-hidden="true">
        <svg fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
      </span>
      <span v-else-if="starFill(n - 1) === 'half'" :class="[sizeClass, 'ect-text-amber-400 ect-relative']" aria-hidden="true">
        <span class="ect-absolute ect-inset-0 ect-overflow-hidden" style="width: 50%">
          <svg class="ect-absolute ect-top-0 ect-left-0 ect-w-full ect-h-full" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        </span>
        <svg class="ect-text-charcoal/20" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
      </span>
      <span v-else :class="[sizeClass, 'ect-text-charcoal/20']" aria-hidden="true">
        <svg fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
      </span>
    </template>
  </span>
</template>
