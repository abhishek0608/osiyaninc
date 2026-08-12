<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { resetPassword } = useAuth()

const token = computed(() => String(route.query.token || '').trim())
const password = ref('')
const confirm = ref('')
const isLoading = ref(false)
const error = ref('')
const done = ref(false)

async function handleSubmit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match.'
    return
  }
  isLoading.value = true
  try {
    await resetPassword(token.value, password.value)
    done.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to reset password.'
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
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-3">Osiyan</p>
            <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-tracking-wide ect-mb-2">Reset password</h1>
            <p class="ect-font-body ect-text-base ect-text-charcoal/60">Choose a new password for your account</p>
          </header>

          <div v-if="done" class="ect-text-center ect-space-y-5">
            <div class="ect-rounded-xl ect-bg-green-50 ect-border ect-border-green-200 ect-px-4 ect-py-4">
              <p class="ect-font-body ect-text-sm ect-text-green-700">Your password has been updated.</p>
            </div>
            <button
              type="button"
              @click="router.push('/login')"
              class="ect-w-full ect-py-4 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-rounded-xl hover:ect-bg-noir ect-transition-colors"
            >
              Go to sign in
            </button>
          </div>

          <div v-else-if="!token" class="ect-rounded-xl ect-bg-red-50 ect-border ect-border-red-200 ect-px-4 ect-py-4 ect-text-center">
            <p class="ect-font-body ect-text-sm ect-text-red-700">This reset link is missing or invalid. Please request a new one.</p>
            <RouterLink to="/forgot-password" class="ect-inline-block ect-mt-3 ect-text-gold-700 hover:ect-text-gold-800 ect-font-semibold ect-text-sm ect-transition-colors">Request a new link</RouterLink>
          </div>

          <form v-else @submit.prevent="handleSubmit" class="ect-space-y-5">
            <label class="ect-block">
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">New password</span>
              <div class="ect-relative">
                <span class="ect-absolute ect-left-4 ect-top-1/2 -ect-translate-y-1/2 ect-text-charcoal/30 ect-pointer-events-none">
                  <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </span>
                <input
                  v-model="password"
                  type="password"
                  required
                  minlength="8"
                  placeholder="••••••••"
                  class="ect-w-full ect-pl-12 ect-pr-4 ect-py-3.5 ect-bg-cream ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 focus:ect-bg-white ect-transition-all"
                />
              </div>
              <span class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mt-1.5 ect-block">At least 8 characters</span>
            </label>

            <label class="ect-block">
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Confirm password</span>
              <div class="ect-relative">
                <span class="ect-absolute ect-left-4 ect-top-1/2 -ect-translate-y-1/2 ect-text-charcoal/30 ect-pointer-events-none">
                  <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </span>
                <input
                  v-model="confirm"
                  type="password"
                  required
                  minlength="8"
                  placeholder="••••••••"
                  class="ect-w-full ect-pl-12 ect-pr-4 ect-py-3.5 ect-bg-cream ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 focus:ect-bg-white ect-transition-all"
                />
              </div>
            </label>

            <button
              type="submit"
              :disabled="isLoading"
              class="ect-w-full ect-py-4 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-rounded-xl hover:ect-bg-noir focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400 focus:ect-ring-offset-2 focus:ect-ring-offset-white ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed ect-mt-6"
            >
              {{ isLoading ? 'Updating…' : 'Update password' }}
            </button>
            <p v-if="error" class="ect-font-body ect-text-xs ect-text-red-600">{{ error }}</p>
          </form>

          <footer class="ect-mt-8 ect-pt-6 ect-border-t ect-border-sand ect-text-center">
            <RouterLink to="/login" class="ect-font-body ect-text-sm ect-text-gold-700 hover:ect-text-gold-800 ect-font-semibold ect-transition-colors">Back to sign in</RouterLink>
          </footer>
        </div>
      </div>
    </article>
  </section>
</template>
