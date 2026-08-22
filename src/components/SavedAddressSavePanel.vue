<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  label: string
  makeDefault: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:label': [value: string]
  'update:makeDefault': [value: boolean]
}>()

function updateEnabled(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  emit('update:modelValue', checked)
  if (!checked) emit('update:makeDefault', false)
}
</script>

<template>
  <section class="ect-rounded-2xl ect-border ect-border-sand ect-bg-pearl ect-p-4 sm:ect-p-5">
    <label class="ect-flex ect-cursor-pointer ect-items-start ect-gap-3">
      <input
        :checked="modelValue"
        type="checkbox"
        class="ect-mt-0.5 ect-h-5 ect-w-5 ect-shrink-0 ect-rounded ect-accent-charcoal"
        @change="updateEnabled"
      />
      <span>
        <span class="ect-block ect-font-body ect-text-base ect-font-semibold ect-text-charcoal">Save this address for next time</span>
        <span class="ect-mt-0.5 ect-block ect-font-body ect-text-sm ect-leading-relaxed ect-text-charcoal/50">It’ll be offered as a choice when you order again. Only you can see it.</span>
      </span>
    </label>

    <div v-if="modelValue" class="ect-ml-8 ect-mt-4 ect-space-y-4">
      <label class="ect-block ect-max-w-sm">
        <span class="ect-mb-1.5 ect-block ect-font-body ect-text-sm ect-font-medium ect-text-charcoal/60">Name it <span class="ect-font-normal ect-text-charcoal/40">(optional)</span></span>
        <input
          :value="label"
          type="text"
          placeholder="e.g. Office"
          class="ect-w-full ect-rounded-xl ect-border ect-border-sand ect-bg-white ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/30 focus:ect-border-gold-400 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/25 ect-transition-all"
          @input="emit('update:label', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="ect-flex ect-w-fit ect-cursor-pointer ect-items-center ect-gap-3">
        <input
          :checked="makeDefault"
          type="checkbox"
          class="ect-h-5 ect-w-5 ect-shrink-0 ect-rounded ect-accent-charcoal"
          @change="emit('update:makeDefault', ($event.target as HTMLInputElement).checked)"
        />
        <span class="ect-font-body ect-text-sm ect-text-charcoal/70">Make this my default address</span>
      </label>
    </div>
  </section>
</template>
