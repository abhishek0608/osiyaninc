<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import { useChat } from '../composables/useChat'
import { useServiceBooking } from '../composables/useServiceBooking'

const listRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingImageFile = ref<File | null>(null)
const imageIntentPickerOpen = ref(false)
const servicePickerOpen = ref(false)
const isAtBottom = ref(true)

const injectedChat = inject<ReturnType<typeof useChat>>('chat')
const { messages, input, loading, processingText, error, setListEl, send, sendImage, scrollToBottom } =
  injectedChat ?? useChat()
const { openBookingByServiceId } = useServiceBooking()

type StarterPrompt = { text: string; opensServicePicker?: boolean }

const starterPrompts: StarterPrompt[] = [
  { text: 'Show me rings under $1,500' },
  { text: 'Gold earrings for a wedding' },
  { text: 'Minimal silver necklaces' },
  { text: 'Shipping & returns?' },
  { text: 'Help me book CAD, wax, or casting', opensServicePicker: true },
]

const serviceBookChips: { id: string; label: string }[] = [
  { id: 'cad', label: 'CAD' },
  { id: 'wax', label: 'Wax' },
  { id: 'casting', label: 'Cast' },
  { id: 'full-pipeline', label: 'Complete piece' },
]

onMounted(() => {
  setListEl(listRef.value)
  listRef.value?.addEventListener('scroll', handleScroll)
})

onBeforeUnmount(() => {
  setListEl(null)
  listRef.value?.removeEventListener('scroll', handleScroll)
})

watch(() => messages.value.length, () => {
  if (messages.value.length) servicePickerOpen.value = false
  nextTick(() => scrollToBottom())
})

function handleScroll() {
  if (!listRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = listRef.value
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 48
}

async function sendSuggestion(text: string) {
  if (loading.value) return
  input.value = text
  await nextTick()
  send()
}

function onStarterPrompt(p: StarterPrompt) {
  if (p.opensServicePicker) {
    servicePickerOpen.value = true
    return
  }
  sendSuggestion(p.text)
}

function pickBookService(id: string) {
  openBookingByServiceId(id)
  servicePickerOpen.value = false
}

function closeServicePicker() {
  servicePickerOpen.value = false
}

function openImagePicker() {
  fileInputRef.value?.click()
}

async function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (file) {
    pendingImageFile.value = file
    imageIntentPickerOpen.value = true
  }
  if (target) target.value = ''
}

async function chooseImageIntent(intent: 'search' | 'pricing') {
  const file = pendingImageFile.value
  imageIntentPickerOpen.value = false
  pendingImageFile.value = null
  if (file) await sendImage(file, intent)
}

function cancelImageIntent() {
  imageIntentPickerOpen.value = false
  pendingImageFile.value = null
}
</script>

<template>
  <section class="ect-relative ect-grid ect-grid-rows-[1fr_auto] ect-h-full ect-min-h-0">

    <!-- Image intent picker overlay -->
    <Transition
      enter-active-class="ect-transition ect-duration-200 ect-ease-out"
      enter-from-class="ect-opacity-0"
      enter-to-class="ect-opacity-100"
      leave-active-class="ect-transition ect-duration-150 ect-ease-in"
      leave-from-class="ect-opacity-100"
      leave-to-class="ect-opacity-0"
    >
      <div
        v-if="imageIntentPickerOpen"
        class="ect-absolute ect-inset-0 ect-z-20 ect-bg-charcoal/35 ect-backdrop-blur-[2px] ect-flex ect-items-end sm:ect-items-center ect-justify-center ect-p-4"
      >
        <Transition
          enter-active-class="ect-transition ect-duration-250 ect-ease-out"
          enter-from-class="ect-opacity-0 ect-translate-y-4"
          enter-to-class="ect-opacity-100 ect-translate-y-0"
        >
          <div v-if="imageIntentPickerOpen" class="ect-w-full ect-max-w-sm ect-rounded-3xl ect-bg-white ect-shadow-2xl ect-border ect-border-sand ect-overflow-hidden">
            <div class="ect-px-5 ect-pt-5 ect-pb-3">
              <p class="ect-font-display ect-text-lg ect-text-charcoal ect-leading-snug">Use this image for…</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">Choose whether you want matching products or a quick price estimate.</p>
            </div>
            <div class="ect-px-4 ect-pb-4 ect-space-y-2.5">
              <button
                type="button"
                class="ect-w-full ect-text-left ect-rounded-2xl ect-border ect-border-sand ect-bg-champagne/50 ect-px-4 ect-py-3.5 hover:ect-border-gold-400 hover:ect-bg-champagne/40 ect-transition-all ect-duration-200 ect-group"
                @click="chooseImageIntent('search')"
              >
                <span class="ect-flex ect-items-center ect-gap-3">
                  <span class="ect-w-8 ect-h-8 ect-rounded-xl ect-bg-champagne ect-flex ect-items-center ect-justify-center ect-shrink-0 group-hover:ect-bg-sand ect-transition-colors">
                    <svg class="ect-w-4 ect-h-4 ect-text-gold-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </span>
                  <span>
                    <span class="ect-block ect-font-body ect-font-semibold ect-text-charcoal ect-text-sm">Find similar pieces</span>
                    <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/55 ect-mt-0.5">Catalog matches closest to this image.</span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                class="ect-w-full ect-text-left ect-rounded-2xl ect-border ect-border-amber-200 ect-bg-amber-50/80 ect-px-4 ect-py-3.5 hover:ect-border-amber-400 hover:ect-bg-amber-50 ect-transition-all ect-duration-200 ect-group"
                @click="chooseImageIntent('pricing')"
              >
                <span class="ect-flex ect-items-center ect-gap-3">
                  <span class="ect-w-8 ect-h-8 ect-rounded-xl ect-bg-amber-100 ect-flex ect-items-center ect-justify-center ect-shrink-0 group-hover:ect-bg-amber-200 ect-transition-colors">
                    <svg class="ect-w-4 ect-h-4 ect-text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span>
                    <span class="ect-block ect-font-body ect-font-semibold ect-text-charcoal ect-text-sm">Get sample pricing</span>
                    <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/55 ect-mt-0.5">Approximate price range from similar pieces.</span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                class="ect-w-full ect-rounded-2xl ect-border ect-border-charcoal/12 ect-px-4 ect-py-3 ect-font-body ect-text-sm ect-text-charcoal/55 hover:ect-border-charcoal/25 hover:ect-text-charcoal ect-transition-all ect-duration-200"
                @click="cancelImageIntent"
              >
                Cancel
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Scroll-to-bottom floating button -->
    <Transition
      enter-active-class="ect-transition ect-duration-200 ect-ease-out"
      enter-from-class="ect-opacity-0 ect-translate-y-2"
      enter-to-class="ect-opacity-100 ect-translate-y-0"
      leave-active-class="ect-transition ect-duration-150 ect-ease-in"
      leave-from-class="ect-opacity-100 ect-translate-y-0"
      leave-to-class="ect-opacity-0 ect-translate-y-2"
    >
      <button
        v-if="!isAtBottom && messages.length > 2"
        type="button"
        aria-label="Scroll to latest message"
        class="ect-absolute ect-bottom-[88px] ect-right-4 ect-z-10 ect-w-8 ect-h-8 ect-rounded-full ect-bg-white ect-shadow-lg ect-shadow-charcoal/15 ect-border ect-border-sand ect-flex ect-items-center ect-justify-center ect-text-gold-600 hover:ect-bg-champagne/40 hover:ect-text-gold-700 ect-transition-all ect-duration-200"
        @click="scrollToBottom"
      >
        <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    </Transition>

    <!-- Message list -->
    <ul
      ref="listRef"
      class="ect-min-h-0 ect-overflow-y-auto ect-p-4 sm:ect-p-5 ect-pb-6 ect-space-y-3 ect-list-none ect-m-0 ect-scroll-smooth"
    >
      <!-- Empty state / suggestions -->
      <li v-if="!messages.length" class="ect-pt-2">
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mb-4">How can I help you today?</p>
        <section class="ect-flex ect-flex-wrap ect-gap-2">
          <button
            v-for="p in starterPrompts"
            :key="p.text"
            type="button"
            class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-3.5 ect-py-2 ect-rounded-full ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.08em] ect-border ect-transition-all ect-duration-200 ect-bg-white/85 ect-border-sand ect-text-charcoal/65 hover:ect-bg-champagne/40 hover:ect-border-gold-300 hover:ect-text-gold-800 hover:ect-shadow-sm active:ect-scale-95"
            @click="onStarterPrompt(p)"
          >
            <svg class="ect-w-3 ect-h-3 ect-opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {{ p.text }}
          </button>
        </section>
        <Transition
          enter-active-class="ect-transition ect-duration-200 ect-ease-out"
          enter-from-class="ect-opacity-0 ect-translate-y-1"
          enter-to-class="ect-opacity-100 ect-translate-y-0"
          leave-active-class="ect-transition ect-duration-150 ect-ease-in"
          leave-from-class="ect-opacity-100"
          leave-to-class="ect-opacity-0"
        >
          <section v-if="servicePickerOpen" class="ect-mt-5 ect-rounded-2xl ect-border ect-border-sand ect-bg-cream ect-p-4">
            <p class="ect-font-body ect-text-sm ect-font-medium ect-text-charcoal ect-mb-3">Which service do you want to book?</p>
            <div class="ect-flex ect-flex-wrap ect-gap-2">
              <button
                v-for="chip in serviceBookChips"
                :key="chip.id"
                type="button"
                class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-3 ect-py-1.5 ect-rounded-full ect-border ect-border-charcoal/15 ect-bg-white ect-font-body ect-text-[11px] ect-font-medium ect-text-charcoal/80 hover:ect-border-gold-400 hover:ect-bg-champagne/40 hover:ect-text-gold-900 ect-transition-all ect-duration-200 active:ect-scale-95"
                @click="pickBookService(chip.id)"
              >
                <svg class="ect-w-3 ect-h-3 ect-text-gold-600/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                </svg>
                {{ chip.label }}
              </button>
            </div>
            <button
              type="button"
              class="ect-mt-3 ect-w-full ect-py-2 ect-rounded-xl ect-border ect-border-charcoal/12 ect-font-body ect-text-xs ect-text-charcoal/50 hover:ect-border-charcoal/25 hover:ect-text-charcoal ect-transition-colors"
              @click="closeServicePicker"
            >
              Cancel
            </button>
          </section>
        </Transition>
      </li>

      <!-- Messages -->
      <TransitionGroup name="msg">
        <li
          v-for="(msg, i) in messages"
          :key="i"
          class="ect-flex ect-gap-2"
          :class="msg.role === 'user' ? 'ect-justify-end' : 'ect-justify-start ect-items-end'"
        >
          <!-- AI avatar -->
          <span
            v-if="msg.role === 'assistant'"
            class="ect-w-6 ect-h-6 ect-rounded-full ect-bg-champagne ect-border ect-border-sand ect-flex ect-items-center ect-justify-center ect-shrink-0 ect-mb-0.5"
          >
            <svg class="ect-w-3 ect-h-3 ect-text-gold-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-5.74L4 10l5.91-1.74L12 2z" />
            </svg>
          </span>

          <span
            class="ect-max-w-[85%] ect-px-4 ect-py-2.5 ect-font-body ect-text-sm ect-leading-relaxed ect-whitespace-pre-wrap"
            :class="msg.role === 'user'
              ? 'ect-bg-gradient-to-br ect-from-charcoal ect-to-noir ect-text-white ect-shadow-md ect-shadow-charcoal/20 ect-rounded-2xl ect-rounded-br-sm'
              : 'ect-bg-white ect-text-charcoal ect-border ect-border-sand ect-shadow-sm ect-rounded-2xl ect-rounded-bl-sm'"
          >
            <img
              v-if="msg.imageUrl"
              :src="msg.imageUrl"
              :alt="msg.imageName || 'Uploaded jewellery inspiration'"
              class="ect-block ect-w-full ect-max-w-[200px] ect-rounded-xl ect-mb-2 ect-border ect-border-white/20"
            />
            {{ msg.content }}
            <button
              v-if="msg.role === 'assistant' && msg.action?.href && msg.action?.id"
              type="button"
              class="ect-mt-3 ect-inline-flex ect-items-center ect-gap-1.5 ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-cream hover:ect-bg-noir ect-transition-colors"
              @click="msg.action?.id && openBookingByServiceId(msg.action.id)"
            >
              {{ msg.action.cta || msg.action.label }}
              <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
            <RouterLink
              v-else-if="msg.role === 'assistant' && msg.action?.href"
              :to="msg.action.href"
              class="ect-mt-3 ect-inline-flex ect-items-center ect-gap-1.5 ect-rounded-full ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-cream hover:ect-bg-noir ect-transition-colors"
            >
              {{ msg.action.cta || msg.action.label }}
              <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </RouterLink>
            <div
              v-if="msg.role === 'assistant' && msg.actionOptions?.length"
              class="ect-mt-3 ect-flex ect-flex-wrap ect-gap-2"
            >
              <button
                v-for="option in msg.actionOptions.filter((item) => item.id)"
                :key="`${option.id || option.href}-${option.label}`"
                type="button"
                class="ect-inline-flex ect-items-center ect-gap-1.5 ect-rounded-full ect-border ect-border-gold-400/60 ect-bg-champagne/50 ect-px-3 ect-py-1.5 ect-font-body ect-text-[11px] ect-font-semibold ect-text-gold-800 hover:ect-border-gold-500 hover:ect-bg-champagne ect-transition-colors"
                @click="option.id && openBookingByServiceId(option.id)"
              >
                {{ option.cta || option.label }}
              </button>
              <RouterLink
                v-for="option in msg.actionOptions.filter((item) => !item.id && item.href)"
                :key="`${option.href}-${option.label}`"
                :to="option.href"
                class="ect-inline-flex ect-items-center ect-gap-1.5 ect-rounded-full ect-border ect-border-gold-400/60 ect-bg-champagne/50 ect-px-3 ect-py-1.5 ect-font-body ect-text-[11px] ect-font-semibold ect-text-gold-800 hover:ect-border-gold-500 hover:ect-bg-champagne ect-transition-colors"
              >
                {{ option.cta || option.label }}
              </RouterLink>
            </div>
          </span>
        </li>
      </TransitionGroup>

      <!-- Loading indicator -->
      <li v-if="loading" class="ect-flex ect-items-end ect-gap-2">
        <span class="ect-w-6 ect-h-6 ect-rounded-full ect-bg-champagne ect-border ect-border-sand ect-flex ect-items-center ect-justify-center ect-shrink-0">
          <svg class="ect-w-3 ect-h-3 ect-text-gold-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-5.74L4 10l5.91-1.74L12 2z" />
          </svg>
        </span>
        <span class="ect-px-4 ect-py-2.5 ect-rounded-2xl ect-rounded-bl-sm ect-bg-white ect-border ect-border-sand ect-shadow-sm ect-font-body ect-text-sm ect-text-charcoal/55">
          <span class="ect-inline-flex ect-items-center ect-gap-2">
            <span class="ect-inline-flex ect-gap-1">
              <span class="ect-w-1.5 ect-h-1.5 ect-rounded-full ect-bg-gold-400 ect-animate-bounce" style="animation-delay:0ms" />
              <span class="ect-w-1.5 ect-h-1.5 ect-rounded-full ect-bg-gold-400 ect-animate-bounce" style="animation-delay:120ms" />
              <span class="ect-w-1.5 ect-h-1.5 ect-rounded-full ect-bg-gold-400 ect-animate-bounce" style="animation-delay:240ms" />
            </span>
            <span class="ect-text-xs">{{ processingText }}</span>
          </span>
        </span>
      </li>
    </ul>

    <!-- Input bar -->
    <form
      class="ect-p-3 sm:ect-p-4 ect-border-t ect-border-sand ect-bg-white/92 ect-backdrop-blur-sm ect-shadow-[0_-8px_24px_rgba(0,0,0,0.03)]"
      style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.75rem);"
      @submit.prevent="send"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="ect-hidden"
        :disabled="loading"
        @change="handleImageChange"
      />
      <section class="ect-flex ect-gap-2 ect-p-1.5 ect-rounded-[26px] ect-bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(252,246,244,0.92))] ect-border ect-border-sand ect-shadow-[0_10px_24px_rgba(120,70,60,0.05)] focus-within:ect-border-gold-400/70 focus-within:ect-shadow-[0_12px_28px_rgba(196,88,117,0.10)] ect-transition-all">
        <!-- Upload image button -->
        <button
          type="button"
          class="ect-shrink-0 ect-w-11 ect-h-11 ect-flex ect-items-center ect-justify-center ect-rounded-2xl ect-bg-white ect-text-gold-700 ect-border ect-border-gold-400/60 ect-shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:ect-bg-champagne/40 hover:ect-border-gold-400 hover:ect-text-gold-800 disabled:ect-opacity-45 disabled:ect-cursor-not-allowed ect-transition-all ect-duration-200 ect-group"
          :disabled="loading"
          aria-label="Upload jewellery image"
          title="Upload inspiration image"
          @click="openImagePicker"
        >
          <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9">
            <rect x="3.25" y="5" width="17.5" height="14" rx="3" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.5 15l3.4-3.6a1.5 1.5 0 012.16-.05l2.05 2.05 1.9-1.9a1.5 1.5 0 012.12 0L20.5 14" />
            <circle cx="8.3" cy="9.2" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <!-- Text input -->
        <input
          v-model="input"
          type="text"
          placeholder="Ask about jewellery, or upload an image…"
          class="ect-flex-1 ect-min-h-11 ect-px-4 ect-py-2.5 ect-rounded-2xl ect-border ect-border-transparent ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-slate-400 focus:ect-outline-none ect-bg-white/96 focus:ect-border-gold-400/60 ect-transition-all"
          :disabled="loading"
          @keydown.enter.exact.prevent="send"
        />

        <!-- Send button -->
        <button
          type="submit"
          class="ect-shrink-0 ect-w-11 ect-h-11 ect-flex ect-items-center ect-justify-center ect-rounded-2xl ect-transition-all ect-duration-200 disabled:ect-cursor-not-allowed"
          :class="input.trim() && !loading
            ? 'ect-bg-gradient-to-br ect-from-charcoal ect-to-noir ect-text-white ect-shadow-md ect-shadow-charcoal/25 hover:ect-from-noir hover:ect-to-noir active:ect-scale-95'
            : 'ect-bg-white ect-text-gold-200 ect-border ect-border-sand ect-shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]'"
          :disabled="loading || !input.trim()"
          aria-label="Send"
        >
          <svg class="ect-w-5 ect-h-5 ect-translate-x-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.15">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 19l16-7L4 5l2.8 7L4 19z" />
            <path stroke-linecap="round" d="M6.8 12H14" />
          </svg>
        </button>
      </section>

      <!-- Error -->
      <Transition
        enter-active-class="ect-transition ect-duration-200"
        enter-from-class="ect-opacity-0 ect-translate-y-1"
        enter-to-class="ect-opacity-100 ect-translate-y-0"
      >
        <p v-if="error" class="ect-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-xs ect-text-red-500 ect-mt-2 ect-px-1">
          <svg class="ect-w-3.5 ect-h-3.5 ect-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {{ error }}
        </p>
      </Transition>
    </form>
  </section>
</template>

<style scoped>
.msg-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.msg-leave-active {
  transition: all 0.15s ease-in;
}
.msg-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
