<script setup lang="ts">
import { ref } from 'vue'
import UiSelect from './UiSelect.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'

const emit = defineEmits<{ close: []; created: [] }>()

const { user } = useAuth()

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const phone = ref('')
const channel = ref('B2C')
const role = ref('customer')
const password = ref('')
const saving = ref(false)
const errorMsg = ref('')

const channelOptions = [
  { value: 'B2C', label: 'B2C (retail)' },
  { value: 'B2B', label: 'B2B (wholesale)' },
]
const roleOptions = [
  { value: 'customer', label: 'Customer' },
  { value: 'internal', label: 'Internal' },
  { value: 'admin', label: 'Full Admin' },
]

async function submit() {
  errorMsg.value = ''
  if (!firstName.value.trim()) {
    errorMsg.value = 'First name is required.'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    errorMsg.value = 'A valid email is required.'
    return
  }
  if (password.value && password.value.length < 8) {
    errorMsg.value = 'Password must be at least 8 characters.'
    return
  }
  saving.value = true
  try {
    const res = await fetch(`${API_BASE}/api/internal?resource=user-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value?.id,
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim(),
        channel: channel.value,
        role: role.value,
        password: password.value || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to create user.')
    emit('created')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Unable to create user.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    class="ect-fixed ect-inset-0 ect-z-[60] ect-flex ect-items-center ect-justify-center ect-bg-charcoal/40 ect-backdrop-blur-sm ect-p-4"
    role="dialog"
    aria-modal="true"
    aria-label="New user"
    @click.self="emit('close')"
  >
    <div class="ect-w-full ect-max-w-md ect-max-h-[85vh] ect-overflow-y-auto ect-rounded-2xl ect-bg-white ect-p-6 ect-shadow-2xl">
      <h3 class="ect-font-display ect-text-xl ect-text-charcoal">New user</h3>
      <p class="ect-mt-1 ect-font-body ect-text-sm ect-text-charcoal/55">
        Creates the account right away. Leave the password blank and the person can set one via “Forgot password”.
      </p>

      <div class="ect-mt-5 ect-grid ect-grid-cols-2 ect-gap-3">
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">First name *</span>
          <input v-model="firstName" type="text" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Last name</span>
          <input v-model="lastName" type="text" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-col-span-2 ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Email *</span>
          <input v-model="email" type="email" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-col-span-2 ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Phone</span>
          <input v-model="phone" type="tel" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Channel</span>
          <UiSelect v-model="channel" :options="channelOptions" class="ect-mt-1" />
        </label>
        <label class="ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Role</span>
          <UiSelect v-model="role" :options="roleOptions" class="ect-mt-1" />
        </label>
        <label class="ect-col-span-2 ect-block">
          <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">Password (optional)</span>
          <input v-model="password" type="password" autocomplete="new-password" placeholder="Min 8 characters" class="ect-mt-1 ect-w-full ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none" />
        </label>
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
          :disabled="saving"
          class="ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
          @click="submit"
        >
          {{ saving ? 'Creating…' : 'Create user' }}
        </button>
      </div>
    </div>
  </div>
</template>
