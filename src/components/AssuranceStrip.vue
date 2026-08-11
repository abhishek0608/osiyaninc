<script setup lang="ts">
type IconName = 'shipping' | 'returns' | 'hallmark' | 'secure'

const items: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shipping', title: 'Free Insured Shipping', text: 'Delivered safely, anywhere in India' },
  { icon: 'returns', title: '15-Day Easy Returns', text: 'Shop with complete confidence' },
  { icon: 'hallmark', title: 'BIS Hallmarked', text: 'Certified purity, every piece' },
  { icon: 'secure', title: 'Secure Ordering', text: 'Encrypted, private checkout' },
]
</script>

<template>
  <section class="ect-border-y ect-border-sand ect-bg-pearl">
    <ul class="ect-max-w-7xl ect-mx-auto ect-px-6 ect-py-7 ect-grid ect-grid-cols-2 lg:ect-grid-cols-4 ect-gap-x-6 ect-gap-y-6 ect-list-none ect-m-0">
      <li
        v-for="(item, i) in items"
        :key="item.title"
        class="ect-flex ect-items-center ect-gap-3.5"
        :class="i < items.length - 1 ? 'lg:ect-border-r lg:ect-border-sand lg:ect-pr-6' : ''"
      >
        <span class="ect-shrink-0 ect-inline-flex ect-items-center ect-justify-center ect-w-10 ect-h-10 ect-rounded-full ect-bg-champagne ect-text-gold-700">
          <svg v-if="item.icon === 'shipping'" class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
          <svg v-else-if="item.icon === 'returns'" class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          <svg v-else-if="item.icon === 'hallmark'" class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <svg v-else class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </span>
        <span class="ect-min-w-0">
          <p class="ect-font-body ect-text-[13px] sm:ect-text-sm ect-font-semibold ect-text-charcoal ect-leading-tight">{{ item.title }}</p>
          <p class="ect-font-body ect-text-xs ect-text-charcoal/50 ect-mt-0.5 ect-leading-snug">{{ item.text }}</p>
        </span>
      </li>
    </ul>
  </section>
</template>
