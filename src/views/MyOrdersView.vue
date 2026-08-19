<script setup lang="ts">
import { useOrders } from '../composables/useOrders'

const { orders } = useOrders()

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <section class="ect-pt-6 ect-pb-24 ect-px-4 sm:ect-px-6 ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream ect-min-h-screen">
    <article class="ect-max-w-3xl ect-mx-auto">
      <header class="ect-mb-8">
        <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.2em] ect-text-gold-700 ect-mb-2">Account</p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">My Orders</h1>
        <p class="ect-font-body ect-text-sm ect-text-charcoal/60 ect-mt-1">View and track your orders</p>
      </header>

      <!-- Empty state -->
      <section v-if="!orders.length" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] ect-border ect-border-sand ect-p-8 sm:ect-p-10 ect-text-center">
        <span class="ect-w-16 ect-h-16 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-mx-auto ect-mb-6">
          <svg class="ect-w-8 ect-h-8 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
          </svg>
        </span>
        <h2 class="ect-font-display ect-text-xl sm:ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">No orders yet</h2>
        <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-mb-8 ect-max-w-sm ect-mx-auto">When you place an order, it will appear here. You can track shipment and view details.</p>
        <RouterLink to="/#collections" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors">
          Browse Collections
        </RouterLink>
      </section>

      <!-- Orders list -->
      <ul v-else class="ect-list-none ect-m-0 ect-p-0 ect-flex ect-flex-col ect-gap-4">
        <li v-for="order in orders" :key="order.id" class="ect-bg-white/90 ect-backdrop-blur-sm ect-rounded-2xl ect-border ect-border-sand ect-shadow-sm ect-overflow-hidden">
          <div class="ect-flex ect-gap-4 ect-p-5 sm:ect-p-6">
            <span class="ect-w-16 ect-h-16 sm:ect-w-20 sm:ect-h-20 ect-rounded-xl ect-bg-champagne/50 ect-shrink-0 ect-flex ect-items-center ect-justify-center ect-overflow-hidden">
              <img v-if="order.items[0]?.image" :src="order.items[0].image" :alt="order.items[0].title" class="ect-w-full ect-h-full ect-object-cover" />
              <svg v-else class="ect-w-8 ect-h-8 ect-text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </span>
            <span class="ect-flex-1 ect-min-w-0">
              <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-mb-0.5">{{ formatDate(order.createdAt) }}</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/60">{{ order.itemCount }} {{ order.itemCount === 1 ? 'item' : 'items' }}</p>
              <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-1 ect-truncate">{{ order.items.map((i) => i.title).join(', ') }}</p>
            </span>
            <span class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-shrink-0">{{ order.formattedTotal }}</span>
          </div>
          <section class="ect-px-5 sm:ect-px-6 ect-pb-5 sm:ect-pb-6 ect-pt-0">
            <span class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-2.5 ect-py-1 ect-rounded-full ect-bg-champagne ect-font-body ect-text-xs ect-font-medium ect-text-gold-800">{{ order.status }}</span>
          </section>
        </li>
      </ul>
    </article>
  </section>
</template>
