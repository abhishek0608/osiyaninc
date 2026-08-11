<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    qty: number
    busy?: boolean
    /** Typo guard only — not a stock or order limit. */
    max?: number
    /** `solid` is the catalog card's call-to-action; `quiet` sits inside a row. */
    variant?: 'solid' | 'quiet'
    /**
     * Turns decrement into a trash icon at quantity 1. Switch it off where the
     * row already carries its own remove control.
     */
    removeIconAtOne?: boolean
  }>(),
  { busy: false, max: 9999, variant: 'solid', removeIconAtOne: true },
)

const emit = defineEmits<{ change: [qty: number] }>()

const SKINS = {
  solid: {
    shell: 'ect-h-9 ect-rounded-lg ect-bg-rose-600 ect-text-white ect-overflow-hidden',
    button: 'ect-w-9 ect-h-9 hover:ect-bg-rose-700',
    field: 'ect-w-12 ect-h-9 ect-bg-rose-700/40 ect-text-white hover:ect-bg-rose-700/60 focus:ect-bg-rose-700/60',
  },
  quiet: {
    shell: 'ect-h-8 ect-rounded-full ect-border ect-border-sand ect-bg-cream ect-text-charcoal',
    button: 'ect-w-8 ect-h-8 ect-rounded-full ect-text-charcoal/50 hover:ect-text-charcoal hover:ect-bg-champagne',
    field: 'ect-w-10 ect-h-8 ect-bg-transparent ect-text-charcoal hover:ect-bg-champagne/60 focus:ect-bg-champagne/60',
  },
} as const

const skin = computed(() => SKINS[props.variant])
const showRemoveIcon = computed(() => props.removeIconAtOne && props.qty === 1)

// While the field has focus the typed text lives here rather than in `qty`, so
// a cart refresh landing mid-edit can't pull the digits out from under the
// buyer, and no server round-trip fires on every keystroke.
const draft = ref<string | null>(null)
const displayed = computed(() => draft.value ?? String(props.qty))
const maxLength = computed(() => String(props.max).length)

function clamp(value: number) {
  return Math.min(Math.max(value, 0), props.max)
}

function submit(next: number) {
  const clamped = clamp(next)
  if (clamped !== props.qty) emit('change', clamped)
}

function step(delta: number) {
  // `busy` flips synchronously in the parent, so this also catches the click
  // that lands right after a blur-commit and would otherwise re-apply a stale
  // quantity over the one just typed.
  if (props.busy) return
  submit(props.qty + delta)
}

function onFocus(e: FocusEvent) {
  draft.value = String(props.qty)
  ;(e.target as HTMLInputElement).select()
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const cleaned = el.value.replace(/\D/g, '').slice(0, maxLength.value)
  draft.value = cleaned
  el.value = cleaned
}

function onBlur() {
  const raw = draft.value
  draft.value = null
  // A cleared field is an abandoned edit, not an order for zero.
  if (!raw) return
  submit(Number(raw))
}

function onEnter(e: KeyboardEvent) {
  ;(e.target as HTMLInputElement).blur()
}

function onEscape(e: KeyboardEvent) {
  draft.value = null
  ;(e.target as HTMLInputElement).blur()
}
</script>

<template>
  <!-- The spinner in the count carries the busy state now, so the shell stays
       at full strength and only the inert +/- controls fade. -->
  <div class="ect-shrink-0 ect-inline-flex ect-items-center" :class="skin.shell">
    <button
      type="button"
      @click.prevent.stop="step(-1)"
      :disabled="busy"
      :aria-label="qty === 1 ? 'Remove from cart' : 'Decrease quantity'"
      class="ect-flex ect-items-center ect-justify-center ect-transition-all ect-duration-200 disabled:ect-cursor-wait disabled:ect-opacity-50 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-inset focus:ect-ring-gold-400"
      :class="skin.button"
    >
      <svg v-if="showRemoveIcon" class="ect-w-4 ect-h-4 ect-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.2v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
      <svg v-else class="ect-w-4 ect-h-4 ect-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
      </svg>
    </button>

    <!-- The count and its in-flight spinner share one box, so the stepper keeps
         its width while a quantity is being saved and the buyer sees the wait
         exactly where the number they changed used to be. -->
    <span class="ect-relative ect-inline-flex ect-shrink-0">
      <input
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :value="displayed"
        :disabled="busy"
        :maxlength="maxLength"
        :aria-label="`Quantity in cart, currently ${qty}`"
        @click.stop
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
        @keydown.enter.prevent="onEnter"
        @keydown.esc.prevent="onEscape"
        class="ect-text-center ect-font-body ect-text-sm ect-font-semibold ect-tabular-nums ect-border-0 ect-transition-colors ect-duration-200 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-inset focus:ect-ring-gold-400 disabled:ect-cursor-wait"
        :class="[skin.field, busy && '!ect-text-transparent']"
      />

      <span
        v-if="busy"
        class="ect-absolute ect-inset-0 ect-flex ect-items-center ect-justify-center ect-pointer-events-none"
        role="status"
        aria-label="Updating quantity"
      >
        <svg class="ect-w-4 ect-h-4 ect-shrink-0 ect-animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="ect-opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3.5" />
          <path class="ect-opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
      </span>
    </span>

    <button
      type="button"
      @click.prevent.stop="step(1)"
      :disabled="busy || qty >= max"
      aria-label="Increase quantity"
      class="ect-flex ect-items-center ect-justify-center ect-transition-all ect-duration-200 disabled:ect-cursor-wait disabled:ect-opacity-50 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-inset focus:ect-ring-gold-400"
      :class="skin.button"
    >
      <svg class="ect-w-4 ect-h-4 ect-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    </button>
  </div>
</template>
