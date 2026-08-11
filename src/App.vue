<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import ChatWidget from './components/ChatWidget.vue'
import ServiceBookingModal from './components/ServiceBookingModal.vue'
import { useServiceBooking } from './composables/useServiceBooking'
import { useAuth } from './composables/useAuth'
import { ensureSiteConfigLoaded } from './composables/useSiteConfig'

onMounted(() => {
  void ensureSiteConfigLoaded()
})

const route = useRoute()
const router = useRouter()
const isChatRoute = computed(() => route.name === 'chat')
const isInternalPath = computed(
  () => typeof route.path === 'string' && route.path.startsWith('/internal'),
)
const { bookingOpen, bookingService, closeBooking } = useServiceBooking()
const { isLoggedIn, sessionExpiresSoon, logout } = useAuth()

watch(isLoggedIn, (loggedIn, wasLoggedIn) => {
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
