<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InternalWorkspaceTabs from '../components/InternalWorkspaceTabs.vue'
import { API_BASE } from '../config-api'
import { useAuth } from '../composables/useAuth'
import { useOrders, type OrderItem } from '../composables/useOrders'

interface InternalOrder {
  id: string
  orderNo: string
  customerId?: string | null
  customer: string
  customerEmail: string
  status: string
  total: string
  itemCount: number
  createdAt: string
  items?: OrderItem[]
}

const route = useRoute()
const router = useRouter()
const { user, isInternalUser } = useAuth()
const { orders: localOrders } = useOrders()

const loading = ref(false)
const error = ref('')
const backendOrders = ref<InternalOrder[]>([])
const detailSkeletonRows = Array.from({ length: 6 }, (_, index) => index)

const displayOrders = computed<InternalOrder[]>(() => {
  if (backendOrders.value.length) return backendOrders.value
  return localOrders.value.map((order) => ({
    id: order.id,
    orderNo: order.id,
    customerId: null,
    customer: user.value?.name || 'Current customer',
    customerEmail: user.value?.email || '',
    status: order.status,
    total: order.formattedTotal,
    itemCount: order.itemCount,
    createdAt: order.createdAt,
    items: order.items,
  }))
})

const targetOrder = computed(
  () => displayOrders.value.find((order) => order.id === String(route.params.id || '')) || null,
)

const showNotFound = computed(
  () => !loading.value && !error.value && !targetOrder.value,
)

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

function customerDetailPath(order: InternalOrder) {
  return order.customerId ? `/internal/users/${order.customerId}` : null
}

async function loadOrders() {
  if (!isInternalUser.value || !user.value?.id) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${API_BASE}/api/internal?userId=${encodeURIComponent(user.value.id)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Unable to load internal order detail.')
    backendOrders.value = Array.isArray(data.orders) ? data.orders : []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load internal order detail.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!isInternalUser.value) {
    router.replace('/')
    return
  }
  void loadOrders()
})
</script>

<template>
  <section class="ect-min-h-screen ect-bg-[#f6efec] ect-pt-6 sm:ect-pt-14 ect-pb-16">
    <div class="ect-max-w-6xl ect-mx-auto ect-px-5">
      <InternalWorkspaceTabs />

      <header class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5 ect-mb-6">
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'orders' } }"
          class="ect-inline-flex ect-items-center ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline ect-mb-4"
        >
          Back to orders
        </RouterLink>
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-rose-600 ect-mb-2">Order record</p>
        <template v-if="loading && !targetOrder">
          <div class="ect-h-10 ect-w-56 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
          <div class="ect-mt-2 ect-h-4 ect-w-64 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
        </template>
        <template v-else>
          <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">{{ targetOrder?.orderNo || 'Order detail' }}</h1>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-1">{{ targetOrder?.customerEmail || '' }}</p>
        </template>
      </header>

      <p v-if="error" class="ect-font-body ect-text-sm ect-text-red-600 ect-mb-4">{{ error }}</p>

      <section v-if="loading && !targetOrder" class="ect-grid lg:ect-grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
          <div class="ect-h-3 ect-w-16 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-5"></div>
          <div class="ect-space-y-5">
            <div v-for="index in detailSkeletonRows" :key="index">
              <div class="ect-h-3 ect-w-20 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-2"></div>
              <div class="ect-h-4 ect-w-36 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
            </div>
          </div>
        </article>
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-overflow-hidden">
          <div class="ect-p-5 ect-border-b ect-border-rose-200/30">
            <div class="ect-h-3 ect-w-20 ect-rounded ect-bg-rose-100 ect-animate-pulse ect-mb-3"></div>
            <div class="ect-h-4 ect-w-40 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
            <div class="ect-mt-2 ect-h-3 ect-w-56 ect-rounded ect-bg-rose-100 ect-animate-pulse"></div>
          </div>
          <div class="ect-p-5 ect-space-y-3">
            <div v-for="index in 3" :key="index" class="ect-h-14 ect-rounded-lg ect-border ect-border-rose-100 ect-bg-rose-50/50 ect-animate-pulse"></div>
          </div>
        </article>
      </section>

      <section v-if="targetOrder" class="ect-grid lg:ect-grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ect-gap-5">
        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5">
          <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Order</p>
          <dl class="ect-space-y-4">
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Order No</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ targetOrder.orderNo }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Status</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal ect-capitalize">{{ targetOrder.status }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Total</dt>
              <dd class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ targetOrder.total }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Items</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ targetOrder.itemCount }}</dd>
            </div>
            <div>
              <dt class="ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Created</dt>
              <dd class="ect-font-body ect-text-sm ect-text-charcoal">{{ formatDate(targetOrder.createdAt) }}</dd>
            </div>
          </dl>
        </article>

        <article class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-overflow-hidden">
          <header class="ect-p-5 ect-border-b ect-border-rose-200/30">
            <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-rose-600 ect-mb-1">Customer</p>
            <h2 class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ targetOrder.customer }}</h2>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-1">{{ targetOrder.customerEmail || 'No email captured' }}</p>
          </header>
          <div class="ect-p-5">
            <RouterLink
              v-if="customerDetailPath(targetOrder)"
              :to="customerDetailPath(targetOrder)!"
              class="ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800 hover:ect-underline"
            >
              View customer profile
            </RouterLink>

            <div v-if="targetOrder.items?.length" class="ect-mt-5">
              <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.16em] ect-text-charcoal/40 ect-mb-3">Line items</p>
              <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
                <li v-for="item in targetOrder.items" :key="item.slug" class="ect-flex ect-items-center ect-justify-between ect-gap-3 ect-rounded-lg ect-border ect-border-rose-100 ect-p-3">
                  <div>
                    <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ item.title }}</p>
                    <p class="ect-font-body ect-text-xs ect-text-charcoal/45">Qty {{ item.qty }}</p>
                  </div>
                  <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ item.price }}</p>
                </li>
              </ul>
            </div>
            <p v-else class="ect-font-body ect-text-sm ect-text-charcoal/45">Line item details are not available for this order.</p>
          </div>
        </article>
      </section>

      <section
        v-else-if="showNotFound"
        class="ect-bg-white ect-border ect-border-rose-200/50 ect-rounded-lg ect-p-5"
      >
        <p class="ect-font-body ect-text-sm ect-text-charcoal/55">This order could not be found.</p>
        <RouterLink
          :to="{ path: '/internal', query: { tab: 'orders' } }"
          class="ect-inline-block ect-mt-4 ect-font-body ect-text-sm ect-font-semibold ect-text-rose-700 hover:ect-text-rose-800"
        >
          Back to orders list
        </RouterLink>
      </section>
    </div>
  </section>
</template>
