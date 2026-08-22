<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import ChatWidget from './components/ChatWidget.vue'
import ServiceBookingModal from './components/ServiceBookingModal.vue'
import { useServiceBooking } from './composables/useServiceBooking'
import { useAuth } from './composables/useAuth'
import { ensureSiteConfigLoaded } from './composables/useSiteConfig'

const route = useRoute()
const router = useRouter()
const isChatRoute = computed(() => route.name === 'chat')
const isInternalPath = computed(
  () => typeof route.path === 'string' && route.path.startsWith('/internal'),
)
const { bookingOpen, bookingService, closeBooking } = useServiceBooking()
const { isLoggedIn, sessionExpiresSoon, refreshCurrentUser, logout } = useAuth()

// Role flags are persisted with the local session, but an admin can change
// them while the customer still has the site open. Refresh the account when
// the app starts or regains focus so newly granted memo/terms access appears
// without requiring a sign-out and sign-in cycle.
let lastAccountRefreshAt = 0
const ACCOUNT_REFRESH_DEBOUNCE_MS = 5 * 1000

function refreshAccount(force = false) {
  if (!isLoggedIn.value) return
  const now = Date.now()
  if (!force && now - lastAccountRefreshAt < ACCOUNT_REFRESH_DEBOUNCE_MS) return
  lastAccountRefreshAt = now
  void refreshCurrentUser().catch(() => {
    // Keep the valid local session during a transient network failure. The
    // next focus/navigation will retry the server-backed permission refresh.
  })
}

function refreshAccountWhenVisible() {
  if (document.visibilityState === 'visible') refreshAccount()
}

function refreshAccountOnFocus() {
  refreshAccount()
}

onMounted(() => {
  void ensureSiteConfigLoaded()
  refreshAccount(true)
  window.addEventListener('focus', refreshAccountOnFocus)
  document.addEventListener('visibilitychange', refreshAccountWhenVisible)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshAccountOnFocus)
  document.removeEventListener('visibilitychange', refreshAccountWhenVisible)
})

watch(
  () => route.path,
  (path) => {
    if (path === '/memos' || path === '/checkout') refreshAccount(true)
  },
)

watch(isLoggedIn, (loggedIn, wasLoggedIn) => {
  if (loggedIn && !wasLoggedIn) lastAccountRefreshAt = Date.now()
  if (!loggedIn && wasLoggedIn && isInternalPath.value) void router.replace('/login')
})
</script>

<template>
  <aside
    v-if="sessionExpiresSoon"
    class="ect-fixed ect-inset-x-0 ect-top-0 ect-z-[100] ect-bg-charcoal ect-px-4 ect-py-2 ect-text-center ect-font-body ect-text-sm ect-text-white"
    role="alert"
  >
    Your session expires in less than five minutes. Continue using the site to stay signed in,
    or <button class="ect-underline" type="button" @click="logout">sign out now</button>.
  </aside>
  <AppHeader />
  <main>
    <RouterView />
  </main>
  <AppFooter v-if="!isChatRoute && !isInternalPath" />
  <ChatWidget v-if="!isChatRoute && !isInternalPath" />
  <ServiceBookingModal :open="bookingOpen" :service="bookingService" @close="closeBooking" />
</template>
