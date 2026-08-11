<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface UiSelectOption {
  value: string
  label: string
}

const props = defineProps<{ modelValue: string; options: UiSelectOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const activeIndex = ref(-1)
const buttonRef = ref<HTMLButtonElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? ''
)

watch(open, (isOpen) => {
  if (isOpen) {
    activeIndex.value = props.options.findIndex((o) => o.value === props.modelValue)
  }
})

function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
  buttonRef.value?.focus()
}

function moveActive(delta: number) {
  if (!props.options.length) return
  const next = Math.min(Math.max(activeIndex.value + delta, 0), props.options.length - 1)
  activeIndex.value = next
  listRef.value
    ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) open.value = true
    else moveActive(e.key === 'ArrowDown' ? 1 : -1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const active = props.options[activeIndex.value]
    if (open.value && active) choose(active.value)
    else open.value = true
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    open.value = false
  } else if (e.key === 'Tab') {
    open.value = false
  }
}
</script>

<template>
  <div class="ect-relative">
    <button
      ref="buttonRef"
      type="button"
      @click="open = !open"
      @keydown="onKeydown"
      :aria-expanded="open"
      aria-haspopup="listbox"
      class="ect-w-full ect-flex ect-items-center ect-justify-between ect-gap-2 ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-bg-white ect-font-body ect-text-sm ect-text-charcoal ect-text-left focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40 focus:ect-border-gold-400 ect-transition-all"
    >
      <span class="ect-truncate">{{ selectedLabel }}</span>
      <svg class="ect-w-4 ect-h-4 ect-shrink-0 ect-text-charcoal/40 ect-transition-transform" :class="open ? 'ect-rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
    </button>
    <span v-if="open" @click="open = false" class="ect-fixed ect-inset-0 ect-z-10"></span>
    <div
      v-if="open"
      ref="listRef"
      role="listbox"
      class="ect-absolute ect-left-0 ect-right-0 ect-top-full ect-mt-2 ect-z-20 ect-rounded-xl ect-border ect-border-sand ect-bg-white ect-shadow-luxe-sm ect-py-1.5 ect-max-h-60 ect-overflow-y-auto"
    >
      <button
        v-for="(opt, i) in options"
        :key="opt.value"
        type="button"
        role="option"
        :data-index="i"
        :aria-selected="opt.value === modelValue"
        @click="choose(opt.value)"
        @mousemove="activeIndex = i"
        class="ect-w-full ect-text-left ect-px-4 ect-py-2 ect-font-body ect-text-sm ect-transition-colors"
        :class="[
          activeIndex === i ? 'ect-bg-champagne' : '',
          opt.value === modelValue ? 'ect-text-gold-700 ect-font-semibold' : 'ect-text-charcoal/80',
        ]"
      >{{ opt.label }}</button>
    </div>
  </div>
</template>
