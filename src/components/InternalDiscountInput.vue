<script setup lang="ts">
import type { DiscountMode } from '../composables/useDiscountDraft'

/**
 * The $ / % toggle plus amount box staff use to take money off a sale. The
 * arithmetic lives in useDiscountDraft; this only edits its two fields.
 */
defineProps<{
  mode: DiscountMode
  raw: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:mode': [DiscountMode]; 'update:raw': [string] }>()
</script>

<template>
  <div class="ect-inline-flex ect-items-center ect-gap-2">
    <div class="ect-inline-flex ect-overflow-hidden ect-rounded-lg ect-border ect-border-charcoal/15" role="group" aria-label="Discount type">
      <button
        type="button"
        :disabled="disabled"
        class="ect-px-3 ect-py-1.5 ect-font-body ect-text-sm ect-font-semibold ect-transition-colors disabled:ect-opacity-50"
        :class="mode === 'amount' ? 'ect-bg-charcoal ect-text-white' : 'ect-bg-white ect-text-charcoal/60 hover:ect-text-charcoal'"
        :aria-pressed="mode === 'amount'"
        @click="emit('update:mode', 'amount')"
      >
        $
      </button>
      <button
        type="button"
        :disabled="disabled"
        class="ect-px-3 ect-py-1.5 ect-font-body ect-text-sm ect-font-semibold ect-transition-colors disabled:ect-opacity-50"
        :class="mode === 'percent' ? 'ect-bg-charcoal ect-text-white' : 'ect-bg-white ect-text-charcoal/60 hover:ect-text-charcoal'"
        :aria-pressed="mode === 'percent'"
        @click="emit('update:mode', 'percent')"
      >
        %
      </button>
    </div>
    <input
      :value="raw"
      type="number"
      min="0"
      :max="mode === 'percent' ? 100 : undefined"
      step="1"
      inputmode="numeric"
      placeholder="0"
      :disabled="disabled"
      aria-label="Discount"
      class="ect-w-24 ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-1.5 ect-text-right ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none disabled:ect-opacity-50"
      @input="emit('update:raw', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
