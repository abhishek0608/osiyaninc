<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import UiSelect from '../components/UiSelect.vue'
import { useAuth } from '../composables/useAuth'
import {
  SERVICE_REQUEST_STATUSES,
  fetchServiceRequest,
  updateServiceRequestStatus,
  type ServiceRequest,
  type ServiceRequestStatus,
} from '../composables/useServiceRequests'

const route = useRoute()
const router = useRouter()
const { user, isInternalUser } = useAuth()

const targetRequest = ref<ServiceRequest | null>(null)
const loading = ref(true)
const loadError = ref('')
const statusSaving = ref(false)
const statusMessage = ref('')
const detailSkeletonRows = Array.from({ length: 5 }, (_, index) => index)

const showNotFound = computed(() => !loading.value && !loadError.value && !targetRequest.value)

const statusOptions = SERVICE_REQUEST_STATUSES.map((status) => ({
  value: status,
  label: status.charAt(0).toUpperCase() + status.slice(1),
}))

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

async function onStatusChange(next: string) {
  const request = targetRequest.value
  const userId = user.value?.id
  if (!request || !userId || statusSaving.value) return
  if (next === request.status) return
  statusSaving.value = true
  statusMessage.value = ''
  try {
    targetRequest.value = await updateServiceRequestStatus(
      userId,
      request.reference,
      next as ServiceRequestStatus,
    )
    statusMessage.value = 'Status updated.'
  } catch (err) {
    statusMessage.value = err instanceof Error ? err.message : 'Could not update the status.'
  } finally {
    statusSaving.value = false
  }
}

onMounted(async () => {
  if (!isInternalUser.value || !user.value?.id) {
    router.replace('/')
    return
  }
  try {
    targetRequest.value = await fetchServiceRequest(
      user.value.id,
      String(route.params.reference || ''),
    )
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Could not load the service request.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-32 ect-pb-16">
    <div class="ect-max-w-6xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <header class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5 ect-mb-6">
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'services' } }"
          class="ect-inline-flex ect-items-center ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline ect-mb-4"
        >
          Back to services
        </RouterLink>
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-rose-600 ect-mb-2">Service request</p>
        <template v-if="loading && !targetRequest">
          <div class="ect-h-10 ect-w-56 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
          <div class="ect-mt-2 ect-h-4 ect-w-64 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
        </template>
        <template v-else>
          <div class="ect-flex ect-flex-col ect-gap-3 sm:ect-flex-row sm:ect-items-end sm:ect-justify-between">
            <div>
              <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">
                {{ targetRequest?.serviceTitle || 'Service detail' }}
              </h1>
              <p v-if="targetRequest?.serviceNo" class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">
                Stage {{ targetRequest.serviceNo }}
              </p>
            </div>
            <div class="ect-inline-flex ect-items-center ect-gap-2 ect-self-start ect-rounded-full ect-bg-rose-50 ect-border ect-border-rose-200 ect-px-3.5 ect-py-2">
              <span class="ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-text-rose-600">Ref</span>
              <span class="ect-font-body ect-text-sm ect-font-semibold ect-tracking-[0.08em] ect-text-charcoal">{{ targetRequest?.reference || 'Service detail' }}</span>
            </div>
          </div>
        </template>
      </header>

      <section v-if="loading && !targetRequest" class="ect-grid lg:ect-grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ect-gap-5">
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
            <div class="ect-h-3 ect-w-28 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-3"></div>
            <div class="ect-h-4 ect-w-40 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
            <div class="ect-mt-2 ect-h-3 ect-w-56 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
          </div>
          <div class="ect-grid sm:ect-grid-cols-2 ect-gap-3 ect-p-5">
            <div v-for="index in 4" :key="index" class="ect-h-16 ect-rounded-md ect-bg-rose-50/80 ect-animate-pulse"></div>
          </div>
        </article>
      </section>

      <section v-if="targetRequest" class="ect-grid lg:ect-grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Request</p>
          <dl class="ect-space-y-4">
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Reference</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ targetRequest.reference }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Service</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ targetRequest.serviceTitle || 'Service request' }}</dd>
            </div>
            <div v-if="targetRequest.serviceNo">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Service No</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ targetRequest.serviceNo }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Status</dt>
              <dd class="ect-mt-1">
                <UiSelect
                  :model-value="targetRequest.status"
                  :options="statusOptions"
                  @update:model-value="onStatusChange"
                />
                <p v-if="statusMessage" class="ect-font-body ect-text-xs ect-mt-1.5" :class="statusMessage === 'Status updated.' ? 'ect-text-emerald-700' : 'ect-text-amber-800'">{{ statusMessage }}</p>
              </dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Created</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ formatDate(targetRequest.createdAt) }}</dd>
            </div>
            <div v-if="targetRequest.inspirationImageUrl">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Inspiration Photo</dt>
              <dd class="ect-mt-1.5">
                <a :href="targetRequest.inspirationImageUrl" target="_blank" rel="noopener" class="ect-block ect-w-32 ect-rounded-lg ect-overflow-hidden ect-ring-1 ect-ring-rose-200 hover:ect-ring-rose-400 ect-transition-all">
                  <img :src="targetRequest.inspirationImageUrl" alt="Inspiration" class="ect-w-full ect-object-cover" />
                </a>
              </dd>
            </div>
            <div v-if="targetRequest.cadFileUrl">
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">CAD File</dt>
              <dd class="ect-font-body ect-text-sm ect-mt-1">
                <a :href="targetRequest.cadFileUrl" target="_blank" rel="noopener" class="ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline">Download CAD file</a>
              </dd>
            </div>
          </dl>
        </article>

        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-overflow-hidden">
          <header class="ect-p-5 ect-border-b ect-border-rose-200/30">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-rose-600 ect-mb-1">Customer details</p>
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ targetRequest.customerName }}</h2>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-1">{{ targetRequest.customerEmail }}</p>
          </header>
          <div class="ect-p-5">
            <dl class="ect-grid sm:ect-grid-cols-2 ect-gap-3">
              <div v-for="(row, index) in targetRequest.rows" :key="`${row.label}-${index}`" class="ect-rounded-md ect-bg-rose-50/60 ect-p-3">
                <dt class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">{{ row.label }}</dt>
                <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-mt-1 ect-break-words">
                  <a v-if="/^https?:\/\//.test(row.value)" :href="row.value" target="_blank" rel="noopener" class="ect-text-rose-700 hover:ect-underline">{{ row.value }}</a>
                  <template v-else>{{ row.value }}</template>
                </dd>
              </div>
            </dl>
            <p v-if="!targetRequest.rows.length" class="ect-font-body ect-text-sm ect-text-charcoal/45">No detail rows were captured for this service request.</p>
          </div>
        </article>
      </section>

      <section v-else-if="loadError" class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55">{{ loadError }}</p>
      </section>

      <section v-else-if="showNotFound" class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55">This service request could not be found.</p>
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'services' } }"
          class="ect-inline-block ect-mt-4 ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800"
        >
          Back to services list
        </RouterLink>
      </section>
    </div>
  </section>
</template>
