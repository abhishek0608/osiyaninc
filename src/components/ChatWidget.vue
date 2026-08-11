<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ChatPanel from './ChatPanel.vue'
import { useChat } from '../composables/useChat'

const open = ref(false)
const { scrollToBottom } = useChat()

watch(open, (isOpen) => {
  if (isOpen) nextTick(() => scrollToBottom())
})
</script>

<template>
  <section class="ect-fixed ect-bottom-6 ect-right-6 ect-z-50 ect-flex ect-flex-col ect-items-end ect-gap-3">
    <Transition
      enter-active-class="ect-transition ect-duration-200 ect-ease-out"
      enter-from-class="ect-opacity-0 ect-scale-95"
      enter-to-class="ect-opacity-100 ect-scale-100"
      leave-active-class="ect-transition ect-duration-150 ect-ease-in"
      leave-from-class="ect-opacity-100 ect-scale-100"
      leave-to-class="ect-opacity-0 ect-scale-95"
    >
      <article
        v-if="open"
        class="ect-w-[360px] sm:ect-w-[380px] ect-h-[480px] ect-flex ect-flex-col ect-bg-white ect-rounded-2xl ect-shadow-xl ect-border ect-border-sand ect-overflow-hidden"
      >
        <header class="ect-flex ect-items-center ect-justify-between ect-px-4 ect-py-3 ect-bg-champagne/50 ect-border-b ect-border-sand ect-shrink-0">
          <span class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">AI Assistant</span>
          <button
            type="button"
            aria-label="Close chat"
            class="ect-p-1.5 ect-rounded-full hover:ect-bg-champagne ect-text-charcoal/60 hover:ect-text-charcoal ect-transition-colors"
            @click="open = false"
          >
            <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <ChatPanel class="ect-flex-1 ect-min-h-0" />
      </article>
    </Transition>

    <button
      type="button"
      aria-label="Open chat"
      class="ect-w-14 ect-h-14 ect-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-text-white ect-shadow-lg hover:ect-bg-noir ect-transition-colors"
      :class="open ? 'ect-hidden' : ''"
      @click="open = !open"
    >
      <svg class="ect-w-6 ect-h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    </button>
  </section>
</template>
