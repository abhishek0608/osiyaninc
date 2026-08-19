<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const route = useRoute()
const { signin } = useAuth()

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')
const returnTo = computed(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
})
const cameFromLockedCollection = computed(() => returnTo.value.startsWith('/collections'))

async function handleSubmit() {
  error.value = ''
  isLoading.value = true
  try {
    await signin(email.value, password.value)
    isLoading.value = false
    router.push(returnTo.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to sign in.'
    isLoading.value = false
  }
}
</script>

<template>
  <section class="ect-min-h-screen ect-flex ect-items-center ect-justify-center ect-px-4 ect-pt-16 ect-pb-16 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream">
    <article class="ect-w-full ect-max-w-md">
      <div class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-overflow-hidden">
        <div class="ect-h-1 ect-bg-gradient-to-r ect-from-gold-200 ect-via-gold-400 ect-to-gold-200" />

        <div class="ect-px-8 ect-pt-10 ect-pb-8 sm:ect-px-10 sm:ect-pt-12 sm:ect-pb-10">
          <header class="ect-text-center ect-mb-8">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-3">Osiyan</p>
            <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-tracking-wide ect-mb-2">Welcome back</h1>
            <p class="ect-font-body ect-text-base ect-text-charcoal/60">{{ cameFromLockedCollection ? 'Sign in to unlock the complete collection' : 'Sign in to continue to your account' }}</p>
          </header>

          <form @submit.prevent="handleSubmit" class="ect-space-y-5">
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

            <label class="ect-block">
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Password</span>
              <div class="ect-relative">
                <span class="ect-absolute ect-left-4 ect-top-1/2 -ect-translate-y-1/2 ect-text-charcoal/30 ect-pointer-events-none">
                  <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.852-.715-1.943-1.086-3.121-1.086-3.205 0-5.67 2.592-5.67 5.99 0 .209.01.418.028.627M12 15.75c-3.453 0-6.027-2.56-6.027-5.994 0-.104.01-.209.028-.313M15.75 5.25c0-1.21-.91-2.2-2.09-2.25a2.2 2.2 0 00-2.09 2.25m0 9.75v.008v-.008m0 0h.008m-.008 0H12m0 0h.008m-.008 0H15.75" />
                  </svg>
                </span>
                <input
                  v-model="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  class="ect-w-full ect-pl-12 ect-pr-4 ect-py-3.5 ect-bg-cream ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 focus:ect-bg-white ect-transition-all"
                />
              </div>
            </label>

            <RouterLink to="/forgot-password" class="ect-block ect-text-right ect-font-body ect-text-sm ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors">Forgot password?</RouterLink>

            <button
              type="submit"
              :disabled="isLoading"
              class="ect-w-full ect-py-4 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-rounded-xl hover:ect-bg-noir focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400 focus:ect-ring-offset-2 focus:ect-ring-offset-white ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed ect-mt-6"
            >
              {{ isLoading ? 'Signing in…' : 'Sign in' }}
            </button>
            <p v-if="error" class="ect-font-body ect-text-xs ect-text-red-600">{{ error }}</p>
          </form>

          <footer class="ect-mt-8 ect-pt-6 ect-border-t ect-border-sand ect-text-center">
            <p class="ect-font-body ect-text-sm ect-text-charcoal/60">
              Don't have an account?
              <RouterLink :to="{ name: 'signup', query: returnTo === '/' ? {} : { redirect: returnTo } }" class="ect-text-gold-700 hover:ect-text-gold-800 ect-font-semibold ect-transition-colors">Create one</RouterLink>
            </p>
            <p class="ect-mt-4 ect-flex ect-items-center ect-justify-center ect-gap-1.5 ect-font-body ect-text-[11px] ect-text-charcoal/40">
              <svg class="ect-w-3.5 ect-h-3.5 ect-text-gold-600/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Secure sign in
            </p>
          </footer>
        </div>
      </div>
    </article>
  </section>
</template>
