<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'

const { requestPasswordReset } = useAuth()

const email = ref('')
const isLoading = ref(false)
const error = ref('')
const message = ref('')

async function handleSubmit() {
  error.value = ''
  message.value = ''
  isLoading.value = true
  try {
    message.value = await requestPasswordReset(email.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to send reset link.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <section class="ect-min-h-screen ect-flex ect-items-center ect-justify-center ect-px-4 ect-pt-24 ect-pb-16 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream">
    <article class="ect-w-full ect-max-w-md">
      <div class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-overflow-hidden">
        <div class="ect-h-1 ect-bg-gradient-to-r ect-from-gold-200 ect-via-gold-400 ect-to-gold-200" />

        <div class="ect-px-8 ect-pt-10 ect-pb-8 sm:ect-px-10 sm:ect-pt-12 sm:ect-pb-10">
          <header class="ect-text-center ect-mb-8">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-3">Kiana Jewels</p>
            <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-tracking-wide ect-mb-2">Forgot password</h1>
            <p class="ect-font-body ect-text-base ect-text-charcoal/60">Enter your email and we'll send you a reset link</p>
          </header>

          <div v-if="message" class="ect-rounded-xl ect-bg-green-50 ect-border ect-border-green-200 ect-px-4 ect-py-4 ect-text-center">
            <p class="ect-font-body ect-text-sm ect-text-green-700">{{ message }}</p>
          </div>

          <form v-else @submit.prevent="handleSubmit" class="ect-space-y-5">
            <label class="ect-block">
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Email</span>
              <div class="ect-relative">
                <span class="ect-absolute ect-left-4 ect-top-1/2 -ect-translate-y-1/2 ect-text-charcoal/30 ect-pointer-events-none">
                  <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </span>
                <input
                  v-model="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  class="ect-w-full ect-pl-12 ect-pr-4 ect-py-3.5 ect-bg-cream ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 focus:ect-bg-white ect-transition-all"
                />
              </div>
            </label>

            <button
              type="submit"
              :disabled="isLoading"
              class="ect-w-full ect-py-4 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-rounded-xl hover:ect-bg-noir focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400 focus:ect-ring-offset-2 focus:ect-ring-offset-white ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed ect-mt-6"
            >
              {{ isLoading ? 'Sending…' : 'Send reset link' }}
            </button>
            <p v-if="error" class="ect-font-body ect-text-xs ect-text-red-600">{{ error }}</p>
          </form>

          <footer class="ect-mt-8 ect-pt-6 ect-border-t ect-border-sand ect-text-center">
            <p class="ect-font-body ect-text-sm ect-text-charcoal/60">
              Remembered it?
              <RouterLink to="/login" class="ect-text-gold-700 hover:ect-text-gold-800 ect-font-semibold ect-transition-colors">Back to sign in</RouterLink>
            </p>
          </footer>
        </div>
      </div>
    </article>
  </section>
</template>
