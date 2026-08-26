<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatProductPrice, type Material, type Product } from '../data/products'
import { useCart, isCustomizedCartItem } from '../composables/useCart'
import { useWishlist } from '../composables/useWishlist'
import { useAuth } from '../composables/useAuth'
import CertifiedBadge from './CertifiedBadge.vue'
import ImageWatermark from './ImageWatermark.vue'
import QuantityStepper from './QuantityStepper.vue'

const props = defineProps<{
  slug: string
  title: string
  category: string
  material: Material
  price: string
  images?: string[]
  product?: Product
}>()

const emit = defineEmits<{ addToCart: [] }>()
const { addToCart, updateQty, items } = useCart()
const { isWishlisted, toggle: toggleWishlist } = useWishlist()
const { isLoggedIn } = useAuth()
const cartLoading = ref(false)

const wishlisted = computed(() => props.product ? isWishlisted(props.product.slug) : false)

// The card drives the standard (non-customized) cart line only: customized
// pieces are configured and quoted from the product page and live on their own
// cart rows, so stepping them from a catalog tile would be ambiguous.
const cartLine = computed(() => {
  if (!props.product) return null
  return items.find((i) => i.product.slug === props.product!.slug && !isCustomizedCartItem(i)) ?? null
})

const cartQty = computed(() => cartLine.value?.qty ?? 0)
const inCart = computed(() => cartQty.value > 0)

// Search and chat hits arrive with either the formatted string or the numeric
// value, so the tile resolves both through the shared catalog rule.
const priceFields = computed(() => ({ price: props.price, priceValue: props.product?.priceValue }))
const priceLabel = computed(() => formatProductPrice(priceFields.value))

function suppressNavigation(e: Event) {
  e.preventDefault()
  e.stopPropagation()
}

async function runCartAction(action: () => Promise<unknown>) {
  if (cartLoading.value) return
  cartLoading.value = true
  try {
    await action()
  } catch (err) {
    console.error('Cart update failed:', err)
  } finally {
    cartLoading.value = false
  }
}

async function handleAddToCart(e: Event) {
  suppressNavigation(e)
  if (!props.product) return
  await runCartAction(async () => {
    await addToCart(props.product!)
    emit('addToCart')
  })
}

// B2B buyers routinely order several units of the same piece, so the stepper
// sets an absolute quantity rather than toggling the item off; removal is
// quantity 0, which `updateQty` turns into a delete.
async function handleQtyChange(qty: number) {
  const line = cartLine.value
  if (!line) return
  await runCartAction(() => updateQty(line.id, qty, props.product!.slug))
}

function handleWishlist(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  if (props.product) toggleWishlist(props.product)
}

// Luxury presentation favours a single, quiet neutral so the jewellery —
// not a rainbow of category colours — is the focus of every card.
const PLACEHOLDER_GRADIENT = 'ect-from-champagne ect-to-cream'

</script>

<template>
  <article class="ect-group ect-relative ect-flex ect-h-full ect-min-h-0 ect-flex-col">
    <RouterLink :to="`/product/${slug}`" class="ect-flex ect-min-h-0 ect-flex-1 ect-flex-col">

      <!-- Image / placeholder box -->
      <figure
        class="ect-relative ect-shrink-0 ect-aspect-square ect-rounded-2xl ect-overflow-hidden ect-mb-3.5 ect-bg-gradient-to-br ect-border ect-border-sand/70 ect-transition-all ect-duration-500 group-hover:ect-shadow-card-hover group-hover:-ect-translate-y-1"
        :class="[PLACEHOLDER_GRADIENT, !images?.length && 'ect-flex ect-items-center ect-justify-center']"
      >
        <img
          v-if="images?.length"
          :src="images[0]"
          :alt="title"
          loading="lazy"
          decoding="async"
          class="ect-w-full ect-h-full ect-object-cover ect-transition-transform ect-duration-[900ms] ect-ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:ect-scale-[1.06]"
        />
        <ImageWatermark v-if="images?.length" :opacity="0.55" :scale="0.15" />
        <svg v-else class="ect-w-12 ect-h-12 ect-text-charcoal/15 ect-transition-transform ect-duration-300 group-hover:ect-scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>

        <!-- Hover overlay -->
        <span class="ect-absolute ect-inset-0 ect-bg-charcoal/0 group-hover:ect-bg-charcoal/[0.04] ect-transition-colors ect-duration-300 ect-rounded-2xl" />

        <!-- NEW badge (top-left) -->
        <span v-if="product?.isNewArrival" class="ect-absolute ect-top-3 ect-left-3 ect-inline-flex ect-items-center ect-px-2.5 ect-py-1 ect-rounded-md ect-font-body ect-text-[9px] ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-bg-rose-900 ect-text-white">
          New
        </span>

        <!-- Certification tag (bottom-left) — only on pieces we certify -->
        <CertifiedBadge v-if="images?.length" :certification="product?.certification" size="sm" />

        <!-- Wishlist button (top-right) — always visible -->
        <button
          type="button"
          @click="handleWishlist"
          class="ect-absolute ect-top-3 ect-right-3 ect-w-8 ect-h-8 ect-rounded-lg ect-border ect-border-gold-400 ect-bg-white/95 ect-backdrop-blur-sm ect-flex ect-items-center ect-justify-center ect-shadow-sm ect-transition-all ect-duration-200 hover:ect-bg-gold-50"
          :aria-label="wishlisted ? 'Remove from wishlist' : 'Add to wishlist'"
        >
          <svg class="ect-w-4 ect-h-4 ect-text-[var(--brand)]" :fill="wishlisted ? 'currentColor' : 'none'" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </button>
      </figure>

      <h3
        class="ect-font-display ect-text-base sm:ect-text-[17px] ect-font-medium ect-text-charcoal group-hover:ect-text-gold-700 ect-transition-colors ect-leading-snug ect-line-clamp-2"
      >
        {{ title }}
      </h3>
    </RouterLink>

    <!-- The price takes its own line and the action spans the tile: at wide tile
         widths a shared row left the two drifting apart with a gap in between,
         and the full-width bar gives the label room at every breakpoint instead
         of collapsing to an unlabelled icon on phones. `mt-auto` keeps the block
         pinned to the bottom so tiles with a two-line title stay aligned. -->
    <section class="ect-mt-auto ect-pt-2.5 ect-flex ect-flex-col ect-gap-2.5">
      <p
        v-if="isLoggedIn"
        class="ect-font-body ect-text-base ect-font-medium ect-tracking-[0.03em] ect-text-charcoal ect-tabular-nums ect-whitespace-nowrap"
      >
        {{ priceLabel }}
      </p>
      <RouterLink
        v-else
        to="/login"
        class="ect-font-body ect-text-sm ect-font-medium ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors ect-whitespace-nowrap"
      >
        Sign in to view price
      </RouterLink>

      <!-- In the bag: an editable quantity control, so the running count is
           visible on the catalog and buyers can type a bulk figure, adjust it,
           or drop the line without opening the cart. -->
      <QuantityStepper
        v-if="product && inCart"
        :qty="cartQty"
        :busy="cartLoading"
        @change="handleQtyChange"
      />

      <button
        v-else-if="product"
        type="button"
        @click="handleAddToCart"
        :aria-label="cartLoading ? 'Adding to cart' : 'Add to cart'"
        :disabled="cartLoading"
        class="ect-w-full ect-h-10 ect-rounded-lg ect-border ect-border-gold-400 ect-flex ect-items-center ect-justify-center ect-gap-2 ect-font-body ect-text-[11px] ect-font-medium ect-uppercase ect-tracking-[0.16em] ect-transition-colors ect-duration-200 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400 focus:ect-ring-offset-1"
        :class="cartLoading
          ? 'ect-bg-[var(--brand)] ect-opacity-70 ect-text-cream ect-cursor-wait'
          : 'ect-bg-[var(--brand)] ect-text-cream hover:ect-bg-[var(--brand-ink)]'"
      >
        <svg v-if="cartLoading" class="ect-w-4 ect-h-4 ect-shrink-0 ect-animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="ect-opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3.5" />
          <path class="ect-opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
        <svg v-else class="ect-w-4 ect-h-4 ect-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
        </svg>
        <span>{{ cartLoading ? 'Adding…' : 'Add to Bag' }}</span>
      </button>
    </section>
  </article>
</template>
