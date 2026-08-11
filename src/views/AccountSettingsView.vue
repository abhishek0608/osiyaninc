<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, isLoggedIn, changePassword } = useAuth()

if (!isLoggedIn.value) router.replace('/login')

type SectionId = 'password'

const sections: { id: SectionId; label: string; description: string }[] = [
  { id: 'password', label: 'Change password', description: 'Update your account password' },
]
const activeSection = ref<SectionId>('password')

const currentPassword = ref('')
const newPassword = ref('')
const confirm = ref('')
const isLoading = ref(false)
const error = ref('')
const message = ref('')

async function handleSubmit() {
  error.value = ''
  message.value = ''
  if (newPassword.value !== confirm.value) {
    error.value = 'New passwords do not match.'
    return
  }
  if (newPassword.value === currentPassword.value) {
    error.value = 'New password must be different from your current password.'
    return
  }
  isLoading.value = true
  try {
    message.value = await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirm.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to change password.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <section class="ect-min-h-screen ect-px-4 sm:ect-px-6 ect-pt-28 ect-pb-16 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream">
    <div class="ect-max-w-5xl ect-mx-auto">
      <header class="ect-mb-8 lg:ect-mb-10">
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">Kiana Jewels</p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-tracking-wide">Account settings</h1>
      </header>

      <div class="ect-grid ect-grid-cols-1 lg:ect-grid-cols-[260px_1fr] ect-gap-6 lg:ect-gap-8 ect-items-start">
        <!-- Sidebar -->
        <aside class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-overflow-hidden">
          <div class="ect-px-4 ect-py-5 ect-border-b ect-border-sand ect-flex ect-items-center ect-gap-3">
            <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-11 ect-h-11 ect-rounded-full ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-bold ect-uppercase ect-shrink-0">{{ user?.name?.charAt(0) }}</span>
            <span class="ect-min-w-0">
              <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-truncate">{{ user?.name }}</p>
              <p class="ect-font-body ect-text-[12px] ect-text-charcoal/50 ect-truncate">{{ user?.email }}</p>
            </span>
          </div>
          <nav class="ect-p-2">
            <button
              v-for="section in sections"
              :key="section.id"
              type="button"
              @click="activeSection = section.id"
              class="ect-w-full ect-text-left ect-px-3 ect-py-2.5 ect-rounded-xl ect-font-body ect-text-sm ect-transition-colors"
              :class="activeSection === section.id ? 'ect-bg-champagne/60 ect-text-charcoal ect-font-semibold' : 'ect-text-charcoal/70 hover:ect-bg-cream hover:ect-text-charcoal'"
            >
              {{ section.label }}
            </button>
          </nav>
        </aside>

        <!-- Content panel -->
        <div class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-overflow-hidden">
          <div class="ect-h-1 ect-bg-gradient-to-r ect-from-gold-200 ect-via-gold-400 ect-to-gold-200" />

          <div v-if="activeSection === 'password'" class="ect-px-6 ect-py-8 sm:ect-px-10 sm:ect-py-10">
            <header class="ect-mb-8">
              <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-tracking-wide ect-mb-1">Change password</h2>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/60">Choose a strong password you don't use elsewhere</p>
            </header>

            <form @submit.prevent="handleSubmit" class="ect-space-y-5 ect-max-w-md">
              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Current password</span>
                <div class="ect-relative">
                  <span class="ect-absolute ect-left-4 ect-top-1/2 -ect-translate-y-1/2 ect-text-charcoal/30 ect-pointer-events-none">
                    <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </span>
                  <input
                    v-model="currentPassword"
                    type="password"
                    required
                    placeholder="••••••••"
                    class="ect-w-full ect-pl-12 ect-pr-4 ect-py-3.5 ect-bg-cream ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-base ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 focus:ect-bg-white ect-transition-all"
                  />
                </div>
              </label>

              <label class="ect-block">
                <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">New password</span>
                <div class="ect-relative">
                  <span class="ect-absolute ect-left-4 ect-top-1/2 -ect-translate-y-1/2 ect-text-charcoal/30 ect-pointer-events-none">
                    <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.852-.715-1.943-1.086-3.121-1.086-3.205 0-5.67 2.592-5.67 5.99 0 .209.01.418.028.627M12 15.75c-3.453 0-6.027-2.56-6.027-5.994 0-.104.01-.209.028-.313M15.75 5.25c0-1.21-.91-2.2-2.09-2.25a2.2 2.2 0 00-2.09 2.25m0 9.75v.008v-.008m0 0h.008m-.008 0H12m0 0h.008m-.008 0H15.75" />
                    </svg>
                  </span>
                  <input
                    v-model="newPassword"
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
                <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Confirm new password</span>
                <div class="ect-relative">
                  <span class="ect-absolute ect-left-4 ect-top-1/2 -ect-translate-y-1/2 ect-text-charcoal/30 ect-pointer-events-none">
                    <svg class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.852-.715-1.943-1.086-3.121-1.086-3.205 0-5.67 2.592-5.67 5.99 0 .209.01.418.028.627M12 15.75c-3.453 0-6.027-2.56-6.027-5.994 0-.104.01-.209.028-.313M15.75 5.25c0-1.21-.91-2.2-2.09-2.25a2.2 2.2 0 00-2.09 2.25m0 9.75v.008v-.008m0 0h.008m-.008 0H12m0 0h.008m-.008 0H15.75" />
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
                class="ect-w-full sm:ect-w-auto ect-px-8 ect-py-4 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-rounded-xl hover:ect-bg-noir focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400 focus:ect-ring-offset-2 focus:ect-ring-offset-white ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed ect-mt-2"
              >
                {{ isLoading ? 'Updating…' : 'Update password' }}
              </button>
              <p v-if="message" class="ect-font-body ect-text-sm ect-text-green-600">{{ message }}</p>
              <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600">{{ error }}</p>
            </form>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
