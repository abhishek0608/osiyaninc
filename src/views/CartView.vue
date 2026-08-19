<script setup lang="ts">
import { computed, ref } from 'vue'

import { useCart, type CartItem, isCustomizedCartItem } from '../composables/useCart'
import VolumeDiscountInfo from '../components/VolumeDiscountInfo.vue'
import QuantityStepper from '../components/QuantityStepper.vue'

const {
  items,
  loading,
  totalItems,
  formattedTotal,
  volumeDiscountTier,
  nextVolumeDiscountTier,
  discountPercent,
  formattedDiscount,
  formattedDiscountedTotal,
  updateQty,
  removeFromCart,
  clearCart,
} = useCart()
const rowLoading = ref<Record<string, boolean>>({})

function isRowLoading(id: string) {
  return Boolean(rowLoading.value[id])
}

async function handleUpdateQty(itemId: string, nextQty: number, slug: string) {
  if (!itemId || isRowLoading(itemId)) return
  rowLoading.value = { ...rowLoading.value, [itemId]: true }
  try {
    await updateQty(itemId, nextQty, slug)
  } catch (err) {
    console.error('Update quantity failed:', err)
  } finally {
    rowLoading.value = { ...rowLoading.value, [itemId]: false }
  }
}

async function handleRemove(itemId: string, slug: string) {
  if (!itemId || isRowLoading(itemId)) return
  rowLoading.value = { ...rowLoading.value, [itemId]: true }
  try {
    await removeFromCart(itemId, slug)
  } catch (err) {
    console.error('Remove cart item failed:', err)
  } finally {
    rowLoading.value = { ...rowLoading.value, [itemId]: false }
  }
}

function isItemCustomized(item: CartItem) {
  return isCustomizedCartItem(item)
}

const hasCustomItems = computed(() => items.some(isItemCustomized))

const quoteNote = computed(() => (hasCustomItems.value ? '+ quote for custom items' : ''))

function itemSubtotal(item: CartItem) {
  if (isItemCustomized(item)) return null
  return '$' + (item.product.priceValue * item.qty).toLocaleString('en-US')
}

function customizationEntries(item: CartItem) {
  if (!item.customization) return []

  const labels: Record<string, string> = {
    isCustomized: 'Customized',
    diamondQuality: 'Diamond Quality',
    metalColor: 'Metal Color',
    metalPurity: 'Metal Purity',
    centerShape: 'Center Shape',
    centerStoneSize: 'Center Stone Size',
    stoneType: 'Stone Type',
    ringSize: 'Ring Size',
    bangleSize: 'Bangle Size',
    necklaceSize: 'Necklace Size',
    additionalRemarks: 'Remarks',
  }

  return Object.entries(item.customization)
    .filter(([key, value]) => (key === 'isCustomized' ? value === true : Boolean(String(value || '').trim())))
    .map(([key, value]) => ({
      label: labels[key] || key,
      value: key === 'isCustomized' ? 'Yes' : String(value).trim(),
    }))
}
</script>

<template>
  <section class="ect-pt-6 sm:ect-pt-14 ect-pb-28 ect-px-4 sm:ect-px-6 ect-bg-cream ect-min-h-screen">
    <article class="ect-max-w-6xl ect-mx-auto">

      <!-- Page heading -->
      <header class="ect-mb-8 sm:ect-mb-10">
        <p class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-2">
          <span class="ect-w-5 ect-h-px ect-bg-gold-400" /> Shopping
        </p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">Your Cart
          <span v-if="items.length" class="ect-font-body ect-text-base ect-font-normal ect-text-charcoal/40 ect-ml-2">({{ totalItems }} item{{ totalItems !== 1 ? 's' : '' }})</span>
        </h1>
      </header>

      <!-- ── Empty state ── -->
      <section v-if="loading && !items.length" class="ect-space-y-4">
        <section
          v-for="n in 3"
          :key="`cart-skeleton-${n}`"
          class="ect-flex ect-gap-4 sm:ect-gap-5 ect-bg-white ect-rounded-2xl ect-p-4 sm:ect-p-5 ect-shadow-sm ect-border ect-border-sand ect-animate-pulse"
        >
          <span class="ect-shrink-0 ect-w-24 ect-h-24 sm:ect-w-28 sm:ect-h-28 ect-rounded-xl ect-bg-sand" />
          <section class="ect-flex-1 ect-space-y-3">
            <span class="ect-block ect-h-4 ect-w-2/3 ect-rounded ect-bg-sand" />
            <span class="ect-block ect-h-3 ect-w-1/3 ect-rounded ect-bg-sand/80" />
            <span class="ect-block ect-h-8 ect-w-28 ect-rounded-full ect-bg-sand/80" />
          </section>
        </section>
      </section>

      <section v-else-if="!items.length" class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-py-28 ect-text-center">
        <span class="ect-w-24 ect-h-24 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-mb-6">
          <svg class="ect-w-10 ect-h-10 ect-text-gold-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </span>
        <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Your cart is empty</h2>
        <p class="ect-font-body ect-text-base ect-text-charcoal/50 ect-mb-8 ect-max-w-xs">Discover our handcrafted jewellery and find pieces that speak to you.</p>
        <RouterLink to="/#collections" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-7 ect-py-3.5 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-full hover:ect-bg-noir ect-transition-colors ect-shadow-sm">
          <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          Browse Collections
        </RouterLink>
      </section>

      <!-- ── Cart items + summary ── -->
      <template v-else>
        <section class="ect-grid ect-grid-cols-1 lg:ect-grid-cols-3 ect-gap-8 lg:ect-gap-10">

          <!-- Left: Items list -->
          <section class="lg:ect-col-span-2 ect-space-y-4">
            <header class="ect-flex ect-items-center ect-justify-between ect-mb-1">
              <h2 class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/50">Items</h2>
              <button type="button" @click="clearCart" class="ect-font-body ect-text-xs ect-text-charcoal/40 hover:ect-text-red-500 ect-transition-colors ect-flex ect-items-center ect-gap-1">
                <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                Clear all
              </button>
            </header>

            <li
              v-for="item in items"
              :key="item.id"
              class="ect-flex ect-gap-4 sm:ect-gap-5 ect-bg-white ect-rounded-2xl ect-p-4 sm:ect-p-5 ect-shadow-card ect-border ect-border-sand ect-list-none ect-transition-shadow hover:ect-shadow-card-hover"
            >
              <!-- Product image -->
              <RouterLink :to="`/product/${item.product.slug}`" class="ect-shrink-0 ect-w-24 ect-h-24 sm:ect-w-28 sm:ect-h-28 ect-rounded-xl ect-overflow-hidden ect-bg-champagne/50">
                <img
                  v-if="item.product.images?.length"
                  :src="item.product.images[0]"
                  :alt="item.product.title"
                  loading="lazy"
                  decoding="async"
                  class="ect-w-full ect-h-full ect-object-cover"
                />
                <span v-else class="ect-w-full ect-h-full ect-flex ect-items-center ect-justify-center">
                  <svg class="ect-w-8 ect-h-8 ect-text-gold-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </span>
              </RouterLink>

              <!-- Info + controls -->
              <section class="ect-flex-1 ect-flex ect-flex-col ect-justify-between ect-min-w-0">
                <section class="ect-flex ect-items-start ect-justify-between ect-gap-2">
                  <section>
                    <RouterLink :to="`/product/${item.product.slug}`" class="ect-font-display ect-text-base sm:ect-text-lg ect-font-medium ect-text-charcoal hover:ect-text-gold-700 ect-transition-colors ect-leading-snug ect-block">{{ item.product.title }}</RouterLink>
                    <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-0.5 ect-capitalize">{{ item.product.category }} · {{ item.product.material }}</p>
                    <dl v-if="customizationEntries(item).length" class="ect-mt-2 ect-grid ect-gap-1">
                      <div v-for="entry in customizationEntries(item)" :key="`${item.id}-${entry.label}`" class="ect-flex ect-flex-wrap ect-gap-1.5 ect-font-body ect-text-[11px] ect-text-charcoal/55">
                        <dt class="ect-font-semibold ect-text-charcoal/65">{{ entry.label }}:</dt>
                        <dd class="ect-m-0">{{ entry.value }}</dd>
                      </div>
                    </dl>
                  </section>
                  <!-- Price (desktop) -->
                  <p v-if="isItemCustomized(item)" class="ect-font-body ect-text-sm ect-text-gold-700 ect-font-medium ect-hidden sm:ect-block">Quote</p>
                  <p v-else class="ect-font-display ect-text-base sm:ect-text-lg ect-font-medium ect-text-charcoal ect-whitespace-nowrap ect-hidden sm:ect-block">{{ itemSubtotal(item) }}</p>
                </section>

                <section class="ect-flex ect-items-center ect-justify-between ect-mt-3 ect-gap-3">
                  <!-- Qty stepper — the count is typeable, so a bulk figure is
                       one edit rather than a run of clicks. The row's own
                       Remove button covers deletion, so quantity 1 keeps the
                       minus icon rather than switching to a second bin. -->
                  <QuantityStepper
                    :qty="item.qty"
                    :busy="isRowLoading(item.id)"
                    variant="quiet"
                    :remove-icon-at-one="false"
                    @change="(qty: number) => handleUpdateQty(item.id, qty, item.product.slug)"
                  />

                  <section class="ect-flex ect-items-center ect-gap-3">
                    <!-- Price (mobile) -->
                    <p v-if="isItemCustomized(item)" class="ect-font-body ect-text-sm ect-text-gold-700 ect-font-medium sm:ect-hidden">Quote</p>
                    <p v-else class="ect-font-display ect-text-base ect-font-medium ect-text-charcoal sm:ect-hidden">{{ itemSubtotal(item) }}</p>
                    <svg
                      v-if="isRowLoading(item.id)"
                      class="ect-w-4 ect-h-4 ect-text-gold-600 ect-animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle class="ect-opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3.5" />
                      <path class="ect-opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                    </svg>
                    <!-- Remove -->
                    <button
                      @click="handleRemove(item.id, item.product.slug)"
                      :disabled="isRowLoading(item.id)"
                      class="ect-p-1.5 ect-rounded-full ect-text-charcoal/30 hover:ect-bg-red-50 hover:ect-text-red-500 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-wait"
                      aria-label="Remove item"
                    >
                      <svg class="ect-w-4.5 ect-h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </section>
                </section>

                <!-- Price breakup tooltip -->
                <span v-if="!isItemCustomized(item)" class="ect-relative ect-inline-block ect-group/tip ect-mt-2 ect-self-start">
                  <span class="ect-font-body ect-text-[11px] ect-text-gold-600 ect-cursor-default ect-border-b ect-border-dashed ect-border-gold-400/60">View price breakup</span>
                  <span class="ect-absolute ect-left-0 ect-bottom-full ect-mb-2 ect-w-56 ect-bg-white ect-rounded-xl ect-shadow-xl ect-shadow-charcoal/10 ect-ring-1 ect-ring-charcoal/[0.06] ect-p-3 ect-opacity-0 ect-invisible group-hover/tip:ect-opacity-100 group-hover/tip:ect-visible ect-transition-all ect-duration-200 ect-z-10">
                    <span class="ect-font-body ect-text-[10px] ect-font-semibold ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-block ect-mb-2">Price Breakup</span>
                    <span class="ect-flex ect-justify-between ect-py-1 ect-border-b ect-border-charcoal/[0.04]"><span class="ect-font-body ect-text-xs ect-text-charcoal/60">Gold ({{ item.product.breakup.goldWeight }})</span><span class="ect-font-body ect-text-xs ect-text-charcoal">{{ item.product.breakup.goldValue }}</span></span>
                    <span class="ect-flex ect-justify-between ect-py-1 ect-border-b ect-border-charcoal/[0.04]"><span class="ect-font-body ect-text-xs ect-text-charcoal/60">Stone ({{ item.product.breakup.stoneWeight }})</span><span class="ect-font-body ect-text-xs ect-text-charcoal">{{ item.product.breakup.stoneValue }}</span></span>
                    <span class="ect-flex ect-justify-between ect-py-1 ect-border-b ect-border-charcoal/[0.04]"><span class="ect-font-body ect-text-xs ect-text-charcoal/60">Making &amp; Labour</span><span class="ect-font-body ect-text-xs ect-text-charcoal">{{ item.product.breakup.labour }}</span></span>
                    <span class="ect-flex ect-justify-between ect-pt-1.5"><span class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal">Total</span><span class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal">{{ item.product.breakup.total }}</span></span>
                  </span>
                </span>
              </section>
            </li>

            <!-- Continue shopping -->
            <RouterLink to="/#collections" class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors ect-mt-2">
              <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
              Continue Shopping
            </RouterLink>
          </section>

          <!-- Right: Summary sidebar -->
          <aside class="lg:ect-col-span-1 lg:ect-sticky lg:ect-top-36 ect-h-fit ect-space-y-4">

            <!-- Order summary card -->
            <section class="ect-bg-white ect-rounded-2xl ect-p-5 sm:ect-p-6 ect-border ect-border-sand ect-shadow-card">
              <div class="ect-flex ect-items-center ect-justify-between ect-gap-2 ect-mb-5">
                <h2 class="ect-font-display ect-text-xl ect-font-medium ect-text-charcoal">Order Summary</h2>
                <VolumeDiscountInfo :current-qty="totalItems" align="right" />
              </div>

              <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3 ect-mb-5">
                <li v-for="item in items" :key="item.id" class="ect-flex ect-items-center ect-gap-3">
                  <span class="ect-w-10 ect-h-10 ect-rounded-lg ect-overflow-hidden ect-bg-champagne/50 ect-shrink-0">
                    <img v-if="item.product.images?.length" :src="item.product.images[0]" :alt="item.product.title" loading="lazy" decoding="async" class="ect-w-full ect-h-full ect-object-cover" />
                    <span v-else class="ect-w-full ect-h-full ect-flex ect-items-center ect-justify-center">
                      <svg class="ect-w-4 ect-h-4 ect-text-gold-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                    </span>
                  </span>
                  <section class="ect-flex-1 ect-min-w-0">
                    <p class="ect-font-body ect-text-sm ect-text-charcoal ect-truncate">{{ item.product.title }} <span class="ect-text-charcoal/40">× {{ item.qty }}</span></p>
                    <p class="ect-font-body ect-text-xs ect-text-charcoal/50">{{ item.product.category }}</p>
                  </section>
                  <span v-if="isItemCustomized(item)" class="ect-font-body ect-text-sm ect-text-gold-700 ect-font-medium ect-whitespace-nowrap">Quote</span>
                  <span v-else class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal ect-whitespace-nowrap">{{ itemSubtotal(item) }}</span>
                </li>
              </ul>

              <hr class="ect-border-sand ect-mb-4" />

              <section class="ect-space-y-2 ect-mb-4">
                <article class="ect-flex ect-justify-between">
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/60">Subtotal ({{ totalItems }} item{{ totalItems !== 1 ? 's' : '' }})</span>
                  <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ formattedTotal }}</span>
                </article>
                <article v-if="volumeDiscountTier" class="ect-flex ect-justify-between">
                  <span class="ect-font-body ect-text-sm ect-text-gold-600 ect-flex ect-items-center ect-gap-1.5">
                    Volume discount ({{ discountPercent }}% · {{ volumeDiscountTier.minQty }}+ items)
                  </span>
                  <span class="ect-font-body ect-text-sm ect-font-semibold ect-text-gold-600">− {{ formattedDiscount }}</span>
                </article>
                <article v-else-if="nextVolumeDiscountTier" class="ect-flex">
                  <span class="ect-font-body ect-text-[11px] ect-text-charcoal/45">
                    Add {{ nextVolumeDiscountTier.minQty - totalItems }} more item{{ nextVolumeDiscountTier.minQty - totalItems !== 1 ? 's' : '' }} to save {{ nextVolumeDiscountTier.percent }}%
                  </span>
                </article>
                <article v-if="hasCustomItems" class="ect-flex ect-justify-between">
                  <span class="ect-font-body ect-text-sm ect-text-gold-700">Custom items</span>
                  <span class="ect-font-body ect-text-sm ect-text-gold-700 ect-font-medium">Quoted separately</span>
                </article>
                <article class="ect-flex ect-justify-between">
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/60">Shipping</span>
                  <span class="ect-font-body ect-text-sm ect-text-gold-600 ect-font-medium">Calculated at checkout</span>
                </article>
                <article class="ect-flex ect-justify-between">
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/60">GST</span>
                  <span class="ect-font-body ect-text-sm ect-text-charcoal/60">Included</span>
                </article>
              </section>

              <hr class="ect-border-sand ect-mb-4" />

              <article class="ect-flex ect-justify-between ect-items-baseline ect-mb-5">
                <span class="ect-font-display ect-text-lg ect-text-charcoal">Total</span>
                <section class="ect-text-right">
                  <span class="ect-font-display ect-text-2xl ect-text-charcoal ect-block">{{ volumeDiscountTier ? formattedDiscountedTotal : formattedTotal }}</span>
                  <span v-if="volumeDiscountTier" class="ect-font-body ect-text-[11px] ect-text-gold-600">You save {{ formattedDiscount }} ({{ discountPercent }}%)</span>
                  <span v-if="quoteNote" class="ect-font-body ect-text-[11px] ect-text-gold-600 ect-block">{{ quoteNote }}</span>
                </section>
              </article>

              <RouterLink to="/checkout" class="ect-flex ect-items-center ect-justify-center ect-gap-2 ect-w-full ect-py-4 ect-bg-charcoal ect-text-white ect-font-body ect-text-base ect-font-semibold ect-rounded-xl hover:ect-bg-noir ect-transition-colors ect-shadow-luxe-sm">
                Proceed to Checkout
                <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </RouterLink>
            </section>

            <!-- Trust badges -->
            <section class="ect-bg-white ect-rounded-2xl ect-p-5 ect-border ect-border-sand ect-shadow-card">
              <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
                <li class="ect-flex ect-items-center ect-gap-3">
                  <span class="ect-w-8 ect-h-8 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                    <svg class="ect-w-4 ect-h-4 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                  </span>
                  <section>
                    <p class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal">100% Secure Checkout</p>
                    <p class="ect-font-body ect-text-[11px] ect-text-charcoal/50">SSL encrypted checkout</p>
                  </section>
                </li>
                <li class="ect-flex ect-items-center ect-gap-3">
                  <span class="ect-w-8 ect-h-8 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                    <svg class="ect-w-4 ect-h-4 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                  </span>
                  <section>
                    <p class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal">Free Insured Shipping</p>
                    <p class="ect-font-body ect-text-[11px] ect-text-charcoal/50">On all orders above $5,000</p>
                  </section>
                </li>
                <li class="ect-flex ect-items-center ect-gap-3">
                  <span class="ect-w-8 ect-h-8 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                    <svg class="ect-w-4 ect-h-4 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  </span>
                  <section>
                    <p class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal">Easy 7-Day Returns</p>
                    <p class="ect-font-body ect-text-[11px] ect-text-charcoal/50">Hassle-free exchange policy</p>
                  </section>
                </li>
                <li class="ect-flex ect-items-center ect-gap-3">
                  <span class="ect-w-8 ect-h-8 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
                    <svg class="ect-w-4 ect-h-4 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                  </span>
                  <section>
                    <p class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal">BIS Hallmarked</p>
                    <p class="ect-font-body ect-text-[11px] ect-text-charcoal/50">Certified purity guaranteed</p>
                  </section>
                </li>
              </ul>
            </section>

          </aside>
        </section>
      </template>
    </article>
  </section>
</template>
