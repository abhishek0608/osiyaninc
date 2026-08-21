<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'

interface InternalOrder {
  id: string
  orderNo: string
  customer: string
  customerEmail: string
  status: string
  total: string
  itemCount: number
  createdAt: string
}

interface InternalUser {
  id: string
  name: string
  email: string
  isInternal: boolean
  isAdmin: boolean
  canMemo: boolean
  memoLimitPaise: number | null
  memoDays: number
  canPayTerms: boolean
  termsLimitPaise: number | null
  termsDays: number
  channel: string
  orderCount: number
  createdAt: string
}

const route = useRoute()
const router = useRouter()
const { user, isInternalUser, isAdminUser, refreshCurrentUser } = useAuth()

const loading = ref(false)
const error = ref('')
const savingRole = ref(false)
const roleError = ref('')
const detailSkeletonRows = Array.from({ length: 6 }, (_, index) => index)
const dashboard = ref<{
  orders: InternalOrder[]
  users: InternalUser[]
} | null>(null)

const targetUser = computed(() =>
  dashboard.value?.users?.find((row) => row.id === String(route.params.id || '')) || null
)

const showNotFound = computed(
  () => !loading.value && !error.value && dashboard.value != null && !targetUser.value,
)

const matchingOrders = computed(() => {
  if (!targetUser.value) return []
  return (dashboard.value?.orders || []).filter((order) => order.customerEmail === targetUser.value?.email)
})

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

async function loadDashboard() {
  if (!isInternalUser.value || !user.value?.id) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE}/api/internal?userId=${encodeURIComponent(user.value.id)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load internal user detail.')
    dashboard.value = data
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load internal user detail.'
  } finally {
    loading.value = false
  }
}

const roleLabel = computed(() => {
  if (!targetUser.value) return '-'
  if (targetUser.value.isAdmin) return 'Full Admin'
  if (targetUser.value.isInternal) return 'Internal'
  return 'Customer'
})

const isSelf = computed(() => targetUser.value?.id === user.value?.id)

async function updateRole(changes: {
  isInternal?: boolean
  isAdmin?: boolean
  canMemo?: boolean
  memoLimitPaise?: number | null
  memoDays?: number
  canPayTerms?: boolean
  termsLimitPaise?: number | null
  termsDays?: number
}) {
  if (!isAdminUser.value || !user.value?.id || !targetUser.value || savingRole.value) return false
  savingRole.value = true
  roleError.value = ''
  try {
    const res = await fetch(`${API_BASE}/api/internal?action=update-user-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.value.id,
        targetUserId: targetUser.value.id,
        ...changes,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to update user role.')
    // Reload the dashboard so the badge reflects the new state.
    await loadDashboard()
    // If we edited our own record, refresh the stored session too.
    if (isSelf.value) await refreshCurrentUser().catch(() => {})
    return true
  } catch (e) {
    roleError.value = e instanceof Error ? e.message : 'Unable to update user role.'
    return false
  } finally {
    savingRole.value = false
  }
}

// --- Memo (consignment) settings -----------------------------------------
// Ticking the box only reveals the fields — nothing is saved until Save, so
// granting memo access and setting its limit go to the server as one call
// rather than leaving a user briefly memo-enabled with no limit set.
// The limit is held in paise/cents on the record but edited in whole dollars,
// which is how staff think about "how much can be out with this customer".
const memoEnabled = ref(false)
// Vue casts v-model on <input type="number"> to a number as soon as the field
// holds a parseable value, so these hold a string OR a number and every read
// has to go through draftText().
const memoLimitInput = ref<string | number>('')
const memoDaysInput = ref<string | number>('')
const memoDraftUserId = ref('')

function draftText(value: string | number) {
  return String(value ?? '').trim()
}

function savedMemoLimit(target: InternalUser | null) {
  return target?.memoLimitPaise == null ? '' : String(Math.round(target.memoLimitPaise / 100))
}

function savedMemoDays(target: InternalUser | null) {
  return String(target?.memoDays ?? 30)
}

function resetMemoDraft(target: InternalUser | null) {
  memoEnabled.value = Boolean(target?.canMemo)
  memoLimitInput.value = savedMemoLimit(target)
  memoDaysInput.value = savedMemoDays(target)
}

const memoDirty = computed(() => {
  const target = targetUser.value
  if (!target) return false
  if (memoEnabled.value !== target.canMemo) return true
  // Limit and days only matter while memo access is on.
  if (!memoEnabled.value) return false
  return (
    draftText(memoLimitInput.value) !== savedMemoLimit(target) ||
    draftText(memoDaysInput.value) !== savedMemoDays(target)
  )
})

// --- Payment-terms (buy now, pay later) settings --------------------------
// Same shape as memo above: ticking the box only reveals the fields, and the
// grant plus its credit limit and period go to the server as one save.
const termsEnabled = ref(false)
const termsLimitInput = ref<string | number>('')
const termsDaysInput = ref<string | number>('')

function savedTermsLimit(target: InternalUser | null) {
  return target?.termsLimitPaise == null ? '' : String(Math.round(target.termsLimitPaise / 100))
}

function savedTermsDays(target: InternalUser | null) {
  return String(target?.termsDays ?? 30)
}

function resetTermsDraft(target: InternalUser | null) {
  termsEnabled.value = Boolean(target?.canPayTerms)
  termsLimitInput.value = savedTermsLimit(target)
  termsDaysInput.value = savedTermsDays(target)
}

const termsDirty = computed(() => {
  const target = targetUser.value
  if (!target) return false
  if (termsEnabled.value !== target.canPayTerms) return true
  if (!termsEnabled.value) return false
  return (
    draftText(termsLimitInput.value) !== savedTermsLimit(target) ||
    draftText(termsDaysInput.value) !== savedTermsDays(target)
  )
})

async function saveTermsSettings() {
  if (!termsDirty.value || savingRole.value) return
  roleError.value = ''

  if (!termsEnabled.value) {
    if (await updateRole({ canPayTerms: false })) resetTermsDraft(targetUser.value)
    return
  }

  const limitRaw = draftText(termsLimitInput.value)
  const days = Number(draftText(termsDaysInput.value))
  if (limitRaw !== '' && (!Number.isFinite(Number(limitRaw)) || Number(limitRaw) < 0)) {
    roleError.value = 'Credit limit must be a positive amount, or blank for no limit.'
    return
  }
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    roleError.value = 'Payment term must be between 1 and 365 days.'
    return
  }

  const saved = await updateRole({
    canPayTerms: true,
    termsLimitPaise: limitRaw === '' ? null : Math.round(Number(limitRaw) * 100),
    termsDays: Math.floor(days),
  })
  if (saved) resetTermsDraft(targetUser.value)
}

function cancelTermsSettings() {
  roleError.value = ''
  resetTermsDraft(targetUser.value)
}

// Seed the draft once per user; after that only an explicit save or cancel
// moves it, so a dashboard reload can't wipe what is being typed.
watch(
  targetUser,
  (next) => {
    if (!next || next.id === memoDraftUserId.value) return
    memoDraftUserId.value = next.id
    resetMemoDraft(next)
    resetTermsDraft(next)
  },
  { immediate: true },
)

async function saveMemoSettings() {
  if (!memoDirty.value || savingRole.value) return
  roleError.value = ''

  // Revoking needs no limit — send the flag alone.
  if (!memoEnabled.value) {
    if (await updateRole({ canMemo: false })) resetMemoDraft(targetUser.value)
    return
  }

  const limitRaw = draftText(memoLimitInput.value)
  const days = Number(draftText(memoDaysInput.value))
  if (limitRaw !== '' && (!Number.isFinite(Number(limitRaw)) || Number(limitRaw) < 0)) {
    roleError.value = 'Memo limit must be a positive amount, or blank for no limit.'
    return
  }
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    roleError.value = 'Memo period must be between 1 and 365 days.'
    return
  }

  const saved = await updateRole({
    canMemo: true,
    memoLimitPaise: limitRaw === '' ? null : Math.round(Number(limitRaw) * 100),
    memoDays: Math.floor(days),
  })
  if (saved) resetMemoDraft(targetUser.value)
}

function cancelMemoSettings() {
  roleError.value = ''
  resetMemoDraft(targetUser.value)
}


onMounted(() => {
  if (!isInternalUser.value) {
    router.replace('/')
    return
  }
  void loadDashboard()
})
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-6 sm:ect-pt-14 ect-pb-16">
    <div class="ect-max-w-6xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <header class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5 ect-mb-6">
        <div
          v-if="loading && !targetUser"
          class="ect-h-5 ect-w-28 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-4"
        ></div>
        <RouterLink
          v-else
          :to="{ path: '/internal', query: { tab: 'users' } }"
          class="ect-inline-flex ect-items-center ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline ect-mb-4"
        >
          Back to users
        </RouterLink>
        <template v-if="loading && !targetUser">
          <div class="ect-h-3 ect-w-20 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-3"></div>
          <div class="ect-h-10 ect-w-56 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
          <div class="ect-mt-2 ect-h-4 ect-w-64 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
        </template>
        <template v-else>
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-rose-600 ect-mb-2">User record</p>
          <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">{{ targetUser?.name || 'User detail' }}</h1>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">{{ targetUser?.email || '' }}</p>
        </template>
      </header>

      <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>

      <section v-if="loading && !targetUser" class="ect-grid lg:ect-grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
          <div class="ect-h-3 ect-w-16 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-5"></div>
          <div class="ect-space-y-5">
            <div v-for="index in detailSkeletonRows" :key="index">
              <div class="ect-h-3 ect-w-20 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-2"></div>
              <div class="ect-h-4 ect-w-40 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
            </div>
          </div>
        </article>
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-overflow-hidden">
          <div class="ect-p-5 ect-border-b ect-border-rose-200/30">
            <div class="ect-h-3 ect-w-24 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-3"></div>
            <div class="ect-h-4 ect-w-48 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
          </div>
          <div class="ect-p-5 ect-space-y-3">
            <div v-for="index in 3" :key="index" class="ect-h-20 ect-rounded-lg ect-border ect-border-rose-100 ect-bg-rose-50/50 ect-animate-pulse"></div>
          </div>
        </article>
      </section>

      <section v-if="targetUser" class="ect-grid lg:ect-grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Profile</p>
          <dl class="ect-space-y-4">
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Name</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ targetUser.name }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Email</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ targetUser.email }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Role</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ roleLabel }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Channel</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ targetUser.channel }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Orders</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ targetUser.orderCount }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Joined</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ formatDate(targetUser.createdAt) }}</dd>
            </div>
          </dl>

          <div v-if="isAdminUser" class="ect-mt-6 ect-pt-5 ect-border-t ect-border-rose-200/40">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Manage access</p>
            <div class="ect-flex ect-flex-wrap ect-gap-2.5">
              <button
                type="button"
                :disabled="savingRole"
                @click="updateRole({ isInternal: !targetUser.isInternal })"
                class="ect-rounded-full ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-border ect-transition disabled:ect-opacity-50"
                :class="targetUser.isInternal
                  ? 'ect-border-rose-200 ect-text-charcoal/70 hover:ect-bg-rose-50'
                  : 'ect-border-charcoal ect-bg-charcoal ect-text-white hover:ect-opacity-90'"
              >
                {{ targetUser.isInternal ? 'Revoke internal access' : 'Grant internal access' }}
              </button>
              <button
                type="button"
                :disabled="savingRole || (isSelf && targetUser.isAdmin)"
                @click="updateRole({ isAdmin: !targetUser.isAdmin })"
                class="ect-rounded-full ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-border ect-transition disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                :class="targetUser.isAdmin
                  ? 'ect-border-rose-200 ect-text-charcoal/70 hover:ect-bg-rose-50'
                  : 'ect-border-charcoal ect-bg-charcoal ect-text-white hover:ect-opacity-90'"
              >
                {{ targetUser.isAdmin ? 'Remove full admin' : 'Make full admin' }}
              </button>
            </div>
            <p v-if="isSelf && targetUser.isAdmin" class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mt-2">
              You can't remove your own admin access.
            </p>

            <!-- Memo: goods can leave without payment, so it is a deliberate,
                 admin-only grant with a cap on how much can be out at once. -->
            <div class="ect-mt-5 ect-pt-4 ect-border-t ect-border-rose-200/40">
              <label class="ect-flex ect-items-start ect-gap-3 ect-cursor-pointer">
                <input
                  v-model="memoEnabled"
                  type="checkbox"
                  :disabled="savingRole"
                  class="ect-mt-0.5 ect-h-4 ect-w-4 ect-rounded ect-border-charcoal/25 ect-text-charcoal focus:ect-ring-gold-400"
                />
                <span>
                  <span class="ect-block ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Memo user</span>
                  <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-0.5">
                    Can take pieces out on memo at checkout instead of paying. Goods stay ours until they buy or return them.
                  </span>
                </span>
              </label>

              <div v-if="memoEnabled" class="ect-mt-4 ect-flex ect-flex-wrap ect-items-end ect-gap-3">
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35 ect-mb-1">Memo limit ($)</span>
                  <input
                    v-model="memoLimitInput"
                    type="number"
                    min="0"
                    placeholder="No limit"
                    class="ect-w-36 ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"
                  />
                </label>
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35 ect-mb-1">Days to return</span>
                  <input
                    v-model="memoDaysInput"
                    type="number"
                    min="1"
                    max="365"
                    class="ect-w-28 ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"
                  />
                </label>
              </div>
              <p v-if="memoEnabled" class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mt-2">
                Blank limit means no cap. The limit is checked against everything already out when a memo is raised.
              </p>

              <div v-if="memoDirty" class="ect-mt-4 ect-flex ect-flex-wrap ect-items-center ect-gap-2.5">
                <button
                  type="button"
                  :disabled="savingRole"
                  class="ect-rounded-full ect-border ect-border-charcoal ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-white hover:ect-opacity-90 ect-transition disabled:ect-opacity-50"
                  @click="saveMemoSettings"
                >
                  {{ savingRole ? 'Saving…' : memoEnabled ? 'Save memo access' : 'Revoke memo access' }}
                </button>
                <button
                  type="button"
                  :disabled="savingRole"
                  class="ect-rounded-full ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/45 hover:ect-text-charcoal ect-transition disabled:ect-opacity-50"
                  @click="cancelMemoSettings"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Payment terms: the sale is final but the money comes in
                 later, so it is an admin-only grant with a credit limit. -->
            <div class="ect-mt-5 ect-pt-4 ect-border-t ect-border-rose-200/40">
              <label class="ect-flex ect-items-start ect-gap-3 ect-cursor-pointer">
                <input
                  v-model="termsEnabled"
                  type="checkbox"
                  :disabled="savingRole"
                  class="ect-mt-0.5 ect-h-4 ect-w-4 ect-rounded ect-border-charcoal/25 ect-text-charcoal focus:ect-ring-gold-400"
                />
                <span>
                  <span class="ect-block ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Payment terms</span>
                  <span class="ect-block ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-0.5">
                    Can choose to pay later at checkout instead of paying immediately. The pieces are sold and ship now; the invoice falls due after the term.
                  </span>
                </span>
              </label>

              <div v-if="termsEnabled" class="ect-mt-4 ect-flex ect-flex-wrap ect-items-end ect-gap-3">
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35 ect-mb-1">Credit limit ($)</span>
                  <input
                    v-model="termsLimitInput"
                    type="number"
                    min="0"
                    placeholder="No limit"
                    class="ect-w-36 ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"
                  />
                </label>
                <label class="ect-block">
                  <span class="ect-block ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35 ect-mb-1">Days to pay</span>
                  <input
                    v-model="termsDaysInput"
                    type="number"
                    min="1"
                    max="365"
                    class="ect-w-28 ect-rounded-lg ect-border ect-border-charcoal/15 ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal focus:ect-border-gold-400 focus:ect-outline-none"
                  />
                </label>
              </div>
              <p v-if="termsEnabled" class="ect-font-body ect-text-xs ect-text-charcoal/40 ect-mt-2">
                Days to pay sets the Net term the customer sees at checkout. Blank limit means no cap.
              </p>

              <div v-if="termsDirty" class="ect-mt-4 ect-flex ect-flex-wrap ect-items-center ect-gap-2.5">
                <button
                  type="button"
                  :disabled="savingRole"
                  class="ect-rounded-full ect-border ect-border-charcoal ect-bg-charcoal ect-px-4 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-white hover:ect-opacity-90 ect-transition disabled:ect-opacity-50"
                  @click="saveTermsSettings"
                >
                  {{ savingRole ? 'Saving…' : termsEnabled ? 'Save payment terms' : 'Revoke payment terms' }}
                </button>
                <button
                  type="button"
                  :disabled="savingRole"
                  class="ect-rounded-full ect-px-3 ect-py-2 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/45 hover:ect-text-charcoal ect-transition disabled:ect-opacity-50"
                  @click="cancelTermsSettings"
                >
                  Cancel
                </button>
              </div>
            </div>

            <p v-if="roleError" class="ect-font-body ect-text-sm ect-text-red-600 ect-mt-3">{{ roleError }}</p>
          </div>
        </article>

        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-overflow-hidden">
          <header class="ect-flex ect-items-end ect-justify-between ect-gap-3 ect-p-5 ect-border-b ect-border-rose-200/30">
            <div>
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-rose-600 ect-mb-1">Related orders</p>
              <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">Orders placed by this account</h2>
            </div>
            <span class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ matchingOrders.length }} found</span>
          </header>
          <div class="ect-p-5">
            <ul v-if="matchingOrders.length" class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
              <li v-for="order in matchingOrders" :key="order.id" class="ect-rounded-lg ect-border ect-border-rose-100 ect-p-4">
                <div class="ect-flex ect-items-start ect-justify-between ect-gap-3">
                  <div>
                    <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ order.orderNo }}</p>
                    <p class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ order.status }} · {{ formatDate(order.createdAt) }}</p>
                  </div>
                  <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ order.total }}</p>
                </div>
                <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-2">{{ order.itemCount }} items</p>
              </li>
            </ul>
            <p v-else class="ect-font-body ect-text-sm ect-text-charcoal/45">No matching orders found for this user.</p>
          </div>
        </article>
      </section>

      <section
        v-else-if="showNotFound"
        class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5"
      >
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55">This record could not be found.</p>
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'users' } }"
          class="ect-inline-block ect-mt-4 ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800"
        >
          Back to users list
        </RouterLink>
      </section>
    </div>
  </section>
</template>
