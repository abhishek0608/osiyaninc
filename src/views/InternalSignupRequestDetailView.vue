<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import UiSelect from '../components/UiSelect.vue'
import { useAuth } from '../composables/useAuth'
import { countryDisplayName } from '../composables/useSavedAddresses'
import { usStateName } from '../data/us-states'
import {
  fetchSignupRequest,
  reviewSignupRequest,
  type SignupRequest,
} from '../composables/useSignupRequests'

// Full read of one storefront sign-up: everything a Full Admin needs to decide
// — tax ID, company, name, address, phone, email — with the approve / reject
// controls. Approving here is what creates the account (api/internal.js,
// resource=signup-requests).

const route = useRoute()
const router = useRouter()
const { user, isInternalUser, isAdminUser } = useAuth()

const request = ref<SignupRequest | null>(null)
const loading = ref(true)
const loadError = ref('')
const deciding = ref(false)
const decisionMessage = ref('')
const decisionError = ref('')
const note = ref('')
const channel = ref<'B2C' | 'B2B'>('B2C')
const role = ref<'customer' | 'internal' | 'admin'>('customer')

const detailSkeletonRows = Array.from({ length: 6 }, (_, index) => index)
const showNotFound = computed(() => !loading.value && !loadError.value && !request.value)
const isPending = computed(() => request.value?.status === 'pending')

const channelOptions = [
  { value: 'B2C', label: 'B2C — retail customer' },
  { value: 'B2B', label: 'B2B — trade account' },
]
const roleOptions = [
  { value: 'customer', label: 'Customer' },
  { value: 'internal', label: 'Internal user' },
  { value: 'admin', label: 'Full Admin' },
]

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

const statusClass = computed(() => {
  if (request.value?.status === 'approved') return 'ect-bg-emerald-100 ect-text-emerald-800'
  if (request.value?.status === 'rejected') return 'ect-bg-red-100 ect-text-red-700'
  return 'ect-bg-sand ect-text-gold-700'
})

const addressLines = computed(() => {
  const value = request.value
  if (!value) return []
  return [
    value.addressLine1,
    value.addressLine2,
    `${value.city}, ${value.state} ${value.postalCode}`,
    countryDisplayName(value.country),
  ].filter(Boolean)
})

// The row stores the USPS code; spell it out so the reviewer is not decoding it.
const stateName = computed(() => (request.value ? usStateName(request.value.state) : ''))

async function decide(action: 'approve' | 'reject') {
  const target = request.value
  const userId = user.value?.id
  if (!target || !userId || deciding.value) return
  if (action === 'approve' && !window.confirm(`Approve ${target.reference} and create an account for ${target.email}?`)) {
    return
  }
  deciding.value = true
  decisionMessage.value = ''
  decisionError.value = ''
  try {
    request.value = await reviewSignupRequest(userId, target.reference, action, {
      note: note.value,
      channel: channel.value,
      role: role.value,
    })
    decisionMessage.value =
      action === 'approve'
        ? `Approved — the account for ${target.email} is live and they can sign in with the password they chose.`
        : 'Request rejected. The applicant has been emailed.'
  } catch (err) {
    decisionError.value = err instanceof Error ? err.message : 'Could not update this request.'
  } finally {
    deciding.value = false
  }
}

onMounted(async () => {
  if (!isInternalUser.value || !user.value?.id) {
    router.replace('/')
    return
  }
  try {
    request.value = await fetchSignupRequest(user.value.id, String(route.params.reference || ''))
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Could not load the sign-up request.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-6 sm:ect-pt-14 ect-pb-16">
    <div class="ect-max-w-6xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <header class="ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-5 ect-mb-6">
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'approvals' } }"
          class="ect-inline-flex ect-items-center ect-font-body ect-text-sm ect-font-semibold ect-text-gold-700 hover:ect-text-gold-800 hover:ect-underline ect-mb-4"
        >
          Back to approvals
        </RouterLink>
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">Sign-up request</p>
        <template v-if="loading && !request">
          <div class="ect-h-10 ect-w-56 ect-rounded ect-bg-sand ect-animate-pulse"></div>
          <div class="ect-mt-2 ect-h-4 ect-w-64 ect-rounded ect-bg-sand ect-animate-pulse"></div>
        </template>
        <template v-else-if="request">
          <div class="ect-flex ect-flex-col ect-gap-3 sm:ect-flex-row sm:ect-items-end sm:ect-justify-between">
            <div>
              <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">{{ request.name }}</h1>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">{{ request.companyName }} · submitted {{ formatDate(request.createdAt) }}</p>
            </div>
            <div class="ect-flex ect-items-center ect-gap-2 ect-self-start">
              <span class="ect-rounded-full ect-px-3 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-capitalize" :class="statusClass">{{ request.status }}</span>
              <span class="ect-inline-flex ect-items-center ect-gap-2 ect-rounded-full ect-bg-cream ect-border ect-border-sand ect-px-3.5 ect-py-2">
                <span class="ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40">Ref</span>
                <span class="ect-font-body ect-text-sm ect-font-semibold ect-tracking-[0.08em] ect-text-charcoal">{{ request.reference }}</span>
              </span>
            </div>
          </div>
        </template>
      </header>

      <section v-if="loading && !request" class="ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-5">
        <div class="ect-grid sm:ect-grid-cols-2 ect-gap-4">
          <div v-for="index in detailSkeletonRows" :key="index">
            <div class="ect-h-3 ect-w-20 ect-rounded ect-bg-sand ect-animate-pulse ect-mb-2"></div>
            <div class="ect-h-4 ect-w-40 ect-rounded ect-bg-sand ect-animate-pulse"></div>
          </div>
        </div>
      </section>

      <section v-else-if="request" class="ect-grid lg:ect-grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-5">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-4">Details supplied for approval</p>
          <dl class="ect-grid sm:ect-grid-cols-2 ect-gap-4">
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">First name</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1">{{ request.firstName }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Last name</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1">{{ request.lastName }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Email address</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1 ect-break-words">
                <a :href="`mailto:${request.email}`" class="ect-text-gold-700 hover:ect-underline">{{ request.email }}</a>
              </dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Phone</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1">{{ request.phone }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Company name</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1">{{ request.companyName }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Tax ID</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mt-1">{{ request.taxId }}</dd>
            </div>
            <div class="sm:ect-col-span-2">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Address</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1">
                <span v-for="line in addressLines" :key="line" class="ect-block">{{ line }}</span>
                <span class="ect-block ect-text-xs ect-text-charcoal/40 ect-mt-1">{{ stateName }}</span>
              </dd>
            </div>
          </dl>
        </article>

        <article class="ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-5">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-4">Decision</p>

          <template v-if="isPending && isAdminUser">
            <p class="ect-font-body ect-text-sm ect-text-charcoal/60 ect-mb-4">
              Approving creates the account, saves this address, and files the company under its tax ID. The applicant signs in with the password they chose.
            </p>

            <label class="ect-block ect-mb-4">
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Sales channel</span>
              <UiSelect :model-value="channel" :options="channelOptions" @update:model-value="(v) => (channel = v as 'B2C' | 'B2B')" />
            </label>

            <label class="ect-block ect-mb-4">
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Account type</span>
              <UiSelect :model-value="role" :options="roleOptions" @update:model-value="(v) => (role = v as 'customer' | 'internal' | 'admin')" />
            </label>

            <label class="ect-block ect-mb-5">
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/70 ect-mb-1.5 ect-block">Note <span class="ect-normal-case ect-tracking-normal ect-font-normal ect-text-charcoal/35">(emailed on rejection)</span></span>
              <textarea
                v-model="note"
                rows="3"
                maxlength="500"
                placeholder="Why this was approved or rejected…"
                class="ect-w-full ect-px-3.5 ect-py-3 ect-bg-cream ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-bg-white ect-transition-all"
              ></textarea>
            </label>

            <div class="ect-flex ect-flex-wrap ect-gap-3">
              <button
                type="button"
                :disabled="deciding"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-bg-charcoal ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-white hover:ect-bg-noir ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                @click="decide('approve')"
              >
                {{ deciding ? 'Working…' : 'Approve request' }}
              </button>
              <button
                type="button"
                :disabled="deciding"
                class="ect-inline-flex ect-items-center ect-justify-center ect-rounded-full ect-border ect-border-charcoal/15 ect-px-5 ect-py-2.5 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal/70 hover:ect-border-red-400 hover:ect-text-red-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
                @click="decide('reject')"
              >
                Reject
              </button>
            </div>
          </template>

          <p v-else-if="isPending" class="ect-font-body ect-text-sm ect-text-charcoal/55">
            This request is awaiting approval. Only a Full Admin can approve or reject it.
          </p>

          <dl v-else class="ect-space-y-4">
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Outcome</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mt-1 ect-capitalize">{{ request.status }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Reviewed</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1">
                {{ formatDate(request.reviewedAt) }}
                <span v-if="request.reviewedBy" class="ect-block ect-text-xs ect-text-charcoal/40">by {{ request.reviewedBy }}</span>
              </dd>
            </div>
            <div v-if="request.reviewNote">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Note</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1">{{ request.reviewNote }}</dd>
            </div>
            <div v-if="request.approvedUserId">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Account</dt>
              <dd class="ect-font-body ect-text-sm ect-mt-1">
                <RouterLink :to="`/internal/users/${request.approvedUserId}`" class="ect-font-semibold ect-text-gold-700 hover:ect-underline">Open the created user</RouterLink>
              </dd>
            </div>
          </dl>

          <p v-if="decisionMessage" class="ect-font-body ect-text-sm ect-text-emerald-700 ect-mt-4">{{ decisionMessage }}</p>
          <p v-if="decisionError" class="ect-font-body ect-text-sm ect-text-red-600 ect-mt-4">{{ decisionError }}</p>
        </article>
      </section>

      <section v-else-if="loadError" class="ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-5">
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55">{{ loadError }}</p>
      </section>

      <section v-else-if="showNotFound" class="ect-bg-white ect-border ect-border-sand ect-rounded-lg ect-p-5">
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55">This sign-up request could not be found.</p>
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'approvals' } }"
          class="ect-inline-block ect-mt-4 ect-font-body ect-text-sm ect-font-semibold ect-text-gold-700 hover:ect-text-gold-800"
        >
          Back to approvals
        </RouterLink>
      </section>
    </div>
  </section>
</template>
