<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWishlist } from '../composables/useWishlist'
import ProductCard from '../components/ProductCard.vue'
import UiSelect from '../components/UiSelect.vue'
import type { Product } from '../data/products'

const { items, groups, groupOf, createGroup, setGroup, renameGroup, deleteGroup } = useWishlist()

const newGroupOpen = ref(false)
const newGroupName = ref('')
const newGroupInput = ref<HTMLInputElement | null>(null)

const renamingGroup = ref<string | null>(null)
const renameValue = ref('')

const groupedSections = computed(() =>
  groups.value.map((name) => ({
    name,
    products: items.value.filter((p) => groupOf(p.slug) === name),
  }))
)

const ungrouped = computed(() => items.value.filter((p) => !groupOf(p.slug)))

const groupOptions = computed(() => [
  { value: '', label: 'No group' },
  ...groups.value.map((g) => ({ value: g, label: g })),
])

async function openNewGroup() {
  newGroupOpen.value = true
  await Promise.resolve()
  newGroupInput.value?.focus()
}

function submitNewGroup() {
  if (createGroup(newGroupName.value)) {
    newGroupName.value = ''
    newGroupOpen.value = false
  }
}

function startRename(name: string) {
  renamingGroup.value = name
  renameValue.value = name
}

function submitRename() {
  const from = renamingGroup.value
  renamingGroup.value = null
  if (from && renameValue.value.trim() && renameValue.value.trim() !== from) {
    renameGroup(from, renameValue.value)
  }
}

function onCardGroupChange(product: Product, value: string) {
  setGroup(product.slug, value || null)
}
</script>

<template>
  <section class="ect-pt-28 sm:ect-pt-36 ect-pb-24 ect-px-6 ect-bg-cream ect-min-h-screen">
    <article class="ect-max-w-7xl ect-mx-auto">
      <header class="ect-mb-8 ect-flex ect-flex-wrap ect-items-end ect-justify-between ect-gap-4">
        <div>
          <p class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-xs ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-2">
            <span class="ect-w-5 ect-h-px ect-bg-gold-400" /> Saved
          </p>
          <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">Your Wishlist</h1>
          <p v-if="items.length" class="ect-font-body ect-text-sm ect-text-charcoal/50 ect-mt-1">{{ items.length }} {{ items.length === 1 ? 'piece' : 'pieces' }}</p>
        </div>

        <!-- New group control -->
        <div v-if="items.length" class="ect-flex ect-items-center ect-gap-2">
          <form v-if="newGroupOpen" class="ect-flex ect-items-center ect-gap-2" @submit.prevent="submitNewGroup">
            <input
              ref="newGroupInput"
              v-model="newGroupName"
              type="text"
              maxlength="60"
              placeholder="Group name — e.g. Wedding"
              class="ect-w-52 ect-px-4 ect-py-2.5 ect-rounded-xl ect-border ect-border-charcoal/20 ect-bg-white ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40 focus:ect-border-gold-400 ect-transition-all"
              @keydown.esc="newGroupOpen = false"
            />
            <button type="submit" class="ect-px-4 ect-py-2.5 ect-bg-charcoal ect-text-white ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.08em] ect-rounded-xl hover:ect-bg-noir ect-transition-colors">Create</button>
            <button type="button" class="ect-px-2 ect-py-2.5 ect-font-body ect-text-xs ect-text-charcoal/50 hover:ect-text-charcoal ect-transition-colors" @click="newGroupOpen = false">Cancel</button>
          </form>
          <button
            v-else
            type="button"
            class="ect-inline-flex ect-items-center ect-gap-1.5 ect-px-4 ect-py-2.5 ect-border ect-border-charcoal/25 ect-bg-white ect-text-charcoal ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.08em] ect-rounded-xl hover:ect-border-charcoal hover:ect-bg-charcoal hover:ect-text-white ect-transition-colors"
            @click="openNewGroup"
          >
            <svg class="ect-w-3.5 ect-h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Group
          </button>
        </div>
      </header>

      <!-- Empty state -->
      <section v-if="!items.length" class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-py-28 ect-text-center">
        <span class="ect-w-20 ect-h-20 ect-rounded-full ect-bg-rose-50 ect-flex ect-items-center ect-justify-center ect-mx-auto ect-mb-6">
          <svg class="ect-w-9 ect-h-9 ect-text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </span>
        <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Your wishlist is empty</h2>
        <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-mb-8">Save your favourite pieces and come back to them anytime.</p>
        <RouterLink to="/#collections" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-full hover:ect-bg-noir ect-transition-colors">
          Browse Collections
        </RouterLink>
      </section>

      <template v-else>
        <!-- Grouped sections -->
        <section v-for="section in groupedSections" :key="section.name" class="ect-mb-12">
          <header class="ect-flex ect-flex-wrap ect-items-baseline ect-gap-x-3 ect-gap-y-1 ect-mb-4 ect-pb-3 ect-border-b ect-border-gold-400/40">
            <form v-if="renamingGroup === section.name" class="ect-flex ect-items-center ect-gap-2" @submit.prevent="submitRename">
              <input
                v-model="renameValue"
                type="text"
                maxlength="60"
                class="ect-w-52 ect-px-3 ect-py-1.5 ect-rounded-lg ect-border ect-border-charcoal/20 ect-bg-white ect-font-display ect-text-xl ect-text-charcoal focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400/40 focus:ect-border-gold-400"
                @keydown.esc="renamingGroup = null"
              />
              <button type="submit" class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.08em] ect-text-gold-700 hover:ect-text-charcoal ect-transition-colors">Save</button>
            </form>
            <template v-else>
              <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal">{{ section.name }}</h2>
              <span class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ section.products.length }} {{ section.products.length === 1 ? 'piece' : 'pieces' }}</span>
              <span class="ect-flex-1" />
              <button type="button" class="ect-font-body ect-text-xs ect-text-charcoal/50 hover:ect-text-charcoal ect-transition-colors" @click="startRename(section.name)">Rename</button>
              <button type="button" class="ect-font-body ect-text-xs ect-text-charcoal/50 hover:ect-text-rose-700 ect-transition-colors" @click="deleteGroup(section.name)">Remove group</button>
            </template>
          </header>

          <p v-if="!section.products.length" class="ect-font-body ect-text-sm ect-text-charcoal/45 ect-py-6">
            No pieces yet — use the group selector on a saved piece to add it here.
          </p>
          <ul v-else class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0">
            <li v-for="product in section.products" :key="product.slug" class="ect-h-full ect-flex ect-flex-col ect-gap-2">
              <ProductCard
                :slug="product.slug"
                :title="product.title"
                :category="product.category"
                :material="product.material"
                :price="product.price"
                :images="product.images"
                :product="product"
              />
              <UiSelect
                :model-value="groupOf(product.slug) ?? ''"
                :options="groupOptions"
                @update:model-value="onCardGroupChange(product, $event)"
              />
            </li>
          </ul>
        </section>

        <!-- Ungrouped items -->
        <section v-if="ungrouped.length" :class="groups.length ? 'ect-mb-12' : ''">
          <header v-if="groups.length" class="ect-flex ect-items-baseline ect-gap-3 ect-mb-4 ect-pb-3 ect-border-b ect-border-charcoal/10">
            <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal/70">Ungrouped</h2>
            <span class="ect-font-body ect-text-xs ect-text-charcoal/45">{{ ungrouped.length }} {{ ungrouped.length === 1 ? 'piece' : 'pieces' }}</span>
          </header>
          <ul class="ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-4 sm:ect-gap-6 ect-list-none ect-m-0 ect-p-0">
            <li v-for="product in ungrouped" :key="product.slug" class="ect-h-full ect-flex ect-flex-col ect-gap-2">
              <ProductCard
                :slug="product.slug"
                :title="product.title"
                :category="product.category"
                :material="product.material"
                :price="product.price"
                :images="product.images"
                :product="product"
              />
              <UiSelect
                v-if="groups.length"
                :model-value="''"
                :options="groupOptions"
                @update:model-value="onCardGroupChange(product, $event)"
              />
            </li>
          </ul>
        </section>
      </template>
    </article>
  </section>
</template>
