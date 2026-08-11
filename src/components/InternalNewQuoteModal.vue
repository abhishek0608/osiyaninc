<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuotes } from '../composables/useQuotes'

const emit = defineEmits<{ close: []; created: [] }>()

const { addManualQuote } = useQuotes()

interface ItemDraft {
  title: string
  price: number | null
  qty: number
}

const customerName = ref('')
const customerEmail = ref('')
const customerPhone = ref('')
const items = ref<ItemDraft[]>([{ title: '', price: null, qty: 1 }])
const errorMsg = ref('')

const total = computed(() =>
  items.value.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0),
)

function addItem() {
  items.value.push({ title: '', price: null, qty: 1 })
}

function removeItem(index: number) {
  items.value.splice(index, 1)
}

function submit() {
  errorMsg.value = ''
  if (!customerName.value.trim()) {
    errorMsg.value = 'Customer name is required.'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.value.trim())) {
    errorMsg.value = 'A valid customer email is required.'
    return
  }
  const cleanItems = items.value
    .map((item) => ({
      title: item.title.trim(),
      price: Number(item.price) || 0,
      qty: Math.max(Math.floor(Number(item.qty) || 0), 0),
    }))
    .filter((item) => item.title && item.qty > 0)
  if (!cleanItems.length) {
    errorMsg.value = 'Add at least one line item with a title and quantity.'
    return
  }
  addManualQuote(cleanItems, {
    name: customerName.value.trim(),
    email: customerEmail.value.trim(),
    phone: customerPhone.value.trim(),
    address: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
  })
  emit('created')
}
</script>

<template>
  <div
    class="ect-fixed ect-inset-0 ect-z-[60] ect-flex ect-items-center ect-justify-center ect-bg-charcoal/40 ect-backdrop-blur-sm ect-p-4"
    role="dialog"
    aria-modal="true"
    aria-label="New quote"
    @click.self="emit('close')"
  >
    <div class="ect-w-full ect-max-w-lg ect-max-h-[85vh] ect-overflow-y-auto ect-rounded-2xl ect-bg-white ect-p-6 ect-shadow-2xl">
      <h3 class="ect-font-display ect-text-xl ect-text-charcoal">New quote</h3>
      <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55">
        Key in a quote for a customer enquiry. It is stored on this browser, like quotes requested through the storefront.
      </p>

      <div class="ect-mt-5 ect-grid ect-grid-cols-2 ect-gap-3">
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Customer name *</span>
          <input v-model="customerName" type="text" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Phone</span>
          <input v-model="customerPhone" type="tel" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-col-span-2 ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Customer email *</span>
          <input v-model="customerEmail" type="email" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
      </div>

      <div class="ect-mt-5">
        <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Line items *</p>
        <div v-for="(item, index) in items" :key="index" class="ect-mt-2 ect-flex ect-items-center ect-gap-2">
          <input v-model="item.title" type="text" placeholder="Item description" class="ect-min-w-0 ect-flex-1 ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none" />
          <input v-model.number="item.price" type="number" min="0" placeholder="Price $" class="ect-w-24 ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none" />
          <input v-model.number="item.qty" type="number" min="1" class="ect-w-16 ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" aria-label="Quantity" />
          <button
            type="button"
            :disabled="items.length === 1"
            class="ect-shrink-0 ect-rounded-full ect-border ect-border-red-200 ect-px-2.5 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-red-600 hover:ect-bg-red-50 disabled:ect-opacity-40 disabled:ect-cursor-not-allowed"
            aria-label="Remove item"
            @click="removeItem(index)"
          >
            ✕
          </button>
        </div>
        <button
          type="button"
          class="ect-mt-2 ect-rounded-full ect-border ect-border-charcoal/15 ect-px-3 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700"
          @click="addItem"
        >
          + Add item
        </button>
        <p class="ect-mt-3 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">
          Total: ${{ total.toLocaleString('en-US') }}
        </p>
      </div>

      <p v-if="errorMsg" class="ect-mt-3 ect-font-body ect-text-sm ect-text-red-600">{{ errorMsg }}</p>

      <div class="ect-mt-6 ect-flex ect-justify-end ect-gap-2">
        <button
          type="button"
          class="ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors"
          @click="submit"
        >
          Create quote
        </button>
      </div>
    </div>
  </div>
</template>
