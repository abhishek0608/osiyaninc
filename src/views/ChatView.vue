<script setup lang="ts">
import { computed, nextTick, onMounted, provide } from 'vue'
import ChatPanel from '../components/ChatPanel.vue'
import ProductCard from '../components/ProductCard.vue'
import { useChat } from '../composables/useChat'
import { useProductsApi } from '../composables/useProductsApi'
import { useHeaderOffset } from '../composables/useHeaderOffset'

const { headerOffset } = useHeaderOffset()

const chat = useChat()
provide('chat', chat)
const { products, ensureProductsLoaded } = useProductsApi()

const { messages, scrollToBottom, suggestedFilters, suggestedProducts, clearChat } = chat

function formatUsdFromNumber(value: number) {
  if (!Number.isFinite(value) || value < 0) return ''
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function normalizeResultForCard(result: any, full: any) {
  const merged = { ...(result || {}), ...(full || {}) }
  const rawPrice = merged?.price
  if (typeof rawPrice === 'string' && rawPrice.trim()) return { ...merged, price: rawPrice }
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) return { ...merged, price: formatUsdFromNumber(rawPrice) }
  if (typeof merged?.priceValue === 'number' && Number.isFinite(merged.priceValue)) return { ...merged, price: formatUsdFromNumber(merged.priceValue) }
  return { ...merged, price: '' }
}

const aiResults = computed(() => {
  if (Array.isArray(suggestedProducts.value) && suggestedProducts.value.length) {
    return suggestedProducts.value.map((result) => {
      const full = products.value.find((p) => p.slug === result.slug)
      return normalizeResultForCard(result, full)
    })
  }
  const filters = suggestedFilters.value
  if (
    filters &&
    (filters.categories?.length || filters.materials?.length || filters.stoneTags?.length)
  ) {
    return products.value
      .filter((p) => {
        const matchCat = !filters.categories?.length || filters.categories.includes(p.category)
        const matchMat = !filters.materials?.length || filters.materials.includes(p.material)
        const pStones = (p.stoneTags || []).map((t) => String(t).toLowerCase())
        const matchStone =
          !filters.stoneTags?.length ||
          filters.stoneTags.every((tag) => pStones.includes(String(tag).toLowerCase()))
        return matchCat && matchMat && matchStone
      })
      .map((p) => normalizeResultForCard(null, p))
  }
  return []
})

const hasConversation = computed(() => messages.value.length > 0)

onMounted(async () => {
  await ensureProductsLoaded()
  await nextTick()
  scrollToBottom()
})
</script>

<template>
  <section
    class="ect-relative ect-overflow-hidden ect-w-full ect-min-h-screen ect-bg-[radial-gradient(110%_130%_at_50%_-8%,#fff7f2_0%,#f7ece8_56%,#f1e5e0_100%)]"
    :style="{ paddingTop: headerOffset + 'px' }"
  >
    <!-- Background blobs -->
    <span class="ect-pointer-events-none ect-absolute ect--top-28 ect-left-1/2 ect--translate-x-1/2 ect-w-[58rem] ect-h-[24rem] ect-rounded-full ect-bg-gold-200/30 ect-blur-3xl" />
    <span class="ect-pointer-events-none ect-absolute ect-bottom-6 ect-left-8 ect-w-56 ect-h-56 ect-rounded-full ect-bg-amber-100/40 ect-blur-3xl" />

    <article
      class="ect-relative ect-w-full ect-flex ect-flex-col ect-shadow-[0_28px_70px_rgba(31,18,15,0.14)] ect-ring-1 ect-ring-sand ect-bg-[#f7efeb] lg:ect-h-[calc(100svh-var(--header-offset))] lg:ect-overflow-hidden"
      :style="{ minHeight: 'calc(100svh - ' + headerOffset + 'px)', '--header-offset': headerOffset + 'px' }"
    >

      <!-- Page header -->
      <header class="ect-px-5 sm:ect-px-8 ect-py-4 ect-border-b ect-border-sand ect-bg-[linear-gradient(90deg,rgba(255,255,255,0.55),rgba(255,255,255,0.1))] ect-flex ect-items-start ect-justify-between">
        <div>
          <h1 class="ect-font-display ect-text-[2rem] sm:ect-text-[2.25rem] ect-font-light ect-text-charcoal ect-leading-tight ect-tracking-[0.01em]">AI Assistant</h1>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-mt-0.5">Ask about collections, materials, budgets, or upload a jewellery photo to see matching pieces.</p>
        </div>
        <!-- New chat button -->
        <Transition
          enter-active-class="ect-transition ect-duration-200"
          enter-from-class="ect-opacity-0 ect-scale-95"
          enter-to-class="ect-opacity-100 ect-scale-100"
        >
          <button
            v-if="hasConversation"
            type="button"
            class="ect-shrink-0 ect-mt-1 ect-inline-flex ect-items-center ect-gap-1.5 ect-px-3.5 ect-py-2 ect-rounded-full ect-border ect-border-sand ect-bg-white/70 ect-font-body ect-text-xs ect-text-charcoal/60 hover:ect-bg-white hover:ect-text-gold-700 hover:ect-border-gold-300 ect-transition-all ect-duration-200"
            @click="clearChat"
          >
            <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            New chat
          </button>
        </Transition>
      </header>

      <!-- Main content: chat + results -->
      <section class="ect-flex-1 ect-min-h-0 ect-grid lg:ect-grid-cols-[0.93fr_1.45fr] ect-bg-[#f6efec]">

        <!-- Left: Chat panel -->
        <section class="ect-flex ect-flex-col ect-min-w-0 ect-min-h-[62dvh] sm:ect-min-h-[58dvh] lg:ect-min-h-0 ect-border-b lg:ect-border-b-0 lg:ect-border-r ect-border-sand ect-bg-white/75">
          <!-- Chat header -->
          <header class="ect-flex ect-items-center ect-justify-between ect-px-5 sm:ect-px-6 ect-py-3.5 ect-bg-white/85 ect-border-b ect-border-sand ect-shrink-0">
            <span class="ect-flex ect-items-center ect-gap-3">
              <span class="ect-relative ect-w-9 ect-h-9 ect-rounded-xl ect-bg-champagne ect-flex ect-items-center ect-justify-center ect-shrink-0 ect-shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <svg class="ect-w-4.5 ect-h-4.5 ect-text-gold-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <!-- Online dot -->
                <span class="ect-absolute -ect-top-0.5 -ect-right-0.5 ect-w-2.5 ect-h-2.5 ect-rounded-full ect-bg-emerald-400 ect-ring-2 ect-ring-white">
                  <span class="ect-absolute ect-inset-0 ect-rounded-full ect-bg-emerald-400 ect-animate-ping ect-opacity-75" />
                </span>
              </span>
              <span>
                <h2 class="ect-font-display ect-text-base sm:ect-text-lg ect-font-medium ect-text-charcoal ect-leading-tight">Jewels</h2>
                <p class="ect-font-body ect-text-[11px] ect-tracking-[0.04em] ect-text-emerald-600 ect-font-medium">● Online</p>
              </span>
            </span>
          </header>

          <ChatPanel class="ect-flex-1 ect-min-h-0 ect-h-full" />
        </section>

        <!-- Right: AI results panel -->
        <section class="ect-flex ect-flex-col ect-min-w-0 ect-min-h-[58dvh] lg:ect-min-h-0 ect-bg-[#f2e5e1]">
          <!-- Results header -->
          <header class="ect-flex ect-items-center ect-justify-between ect-px-5 ect-py-3.5 ect-bg-white/40 ect-border-b ect-border-sand ect-shrink-0">
            <span class="ect-flex ect-items-center ect-gap-2">
              <svg class="ect-w-4 ect-h-4 ect-text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/50">Matched Pieces</span>
            </span>
            <Transition
              enter-active-class="ect-transition ect-duration-300"
              enter-from-class="ect-opacity-0 ect-scale-75"
              enter-to-class="ect-opacity-100 ect-scale-100"
            >
              <span
                v-if="aiResults.length"
                class="ect-inline-flex ect-items-center ect-justify-center ect-min-w-[22px] ect-h-[22px] ect-px-1.5 ect-rounded-full ect-bg-champagne/500 ect-text-white ect-font-body ect-text-[11px] ect-font-bold"
              >{{ aiResults.length }}</span>
            </Transition>
          </header>

          <div class="ect-flex-1 ect-w-full ect-overflow-y-auto ect-p-4 sm:ect-p-5">
            <!-- No conversation yet -->
            <template v-if="!hasConversation">
              <section class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-min-h-[280px] ect-rounded-2xl ect-bg-white/65 ect-shadow-[0_10px_24px_rgba(38,24,20,0.05)] ect-ring-1 ect-ring-white/75 ect-text-center ect-px-6">
                <span class="ect-w-14 ect-h-14 ect-rounded-2xl ect-bg-champagne ect-flex ect-items-center ect-justify-center ect-mb-4">
                  <svg class="ect-w-7 ect-h-7 ect-text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </span>
                <p class="ect-font-display ect-text-xl ect-font-light ect-text-charcoal ect-mb-2">Discover as you chat</p>
                <p class="ect-font-body ect-text-sm ect-leading-relaxed ect-text-charcoal/55 ect-max-w-xs ect-mb-5">Mention rings, necklaces, earrings, gold, or silver — or upload an inspiration photo and matching pieces appear here.</p>
                <p class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/35">Try: "Gold rings under $1,500" or upload a photo</p>
              </section>
            </template>

            <!-- Results grid -->
            <template v-else-if="aiResults.length">
              <TransitionGroup
                name="results"
                tag="ul"
                class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-3 ect-gap-3 ect-list-none ect-m-0 ect-p-0"
              >
                <li v-for="piece in aiResults" :key="piece.slug" class="ect-h-full">
                  <ProductCard
                    :slug="piece.slug"
                    :title="piece.title"
                    :category="piece.category"
                    :material="piece.material"
                    :price="piece.price"
                    :images="piece.images"
                    :product="piece"
                  />
                </li>
              </TransitionGroup>
            </template>

            <!-- No results yet for current query -->
            <template v-else>
              <section class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-min-h-[280px] ect-rounded-2xl ect-bg-white/65 ect-shadow-[0_10px_24px_rgba(38,24,20,0.05)] ect-ring-1 ect-ring-white/75 ect-text-center ect-px-6">
                <span class="ect-w-12 ect-h-12 ect-rounded-xl ect-bg-charcoal/5 ect-flex ect-items-center ect-justify-center ect-mb-3">
                  <svg class="ect-w-5 ect-h-5 ect-text-charcoal/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </span>
                <p class="ect-font-display ect-text-lg ect-font-light ect-text-charcoal ect-mb-1">No matches yet</p>
                <p class="ect-font-body ect-text-sm ect-text-charcoal/45">Try asking for rings, earrings, necklaces, or bracelets.</p>
              </section>
            </template>
          </div>
        </section>
      </section>
    </article>
  </section>
</template>

<style scoped>
.results-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.results-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}
.results-leave-active {
  transition: all 0.2s ease-in;
  position: absolute;
}
.results-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
