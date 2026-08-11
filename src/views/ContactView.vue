<script setup lang="ts">
import { ref } from 'vue'

const name = ref('')
const email = ref('')
const message = ref('')
const submitted = ref(false)

function handleSubmit() {
  submitted.value = true
}
</script>

<template>
  <section class="ect-min-h-screen ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream ect-pt-28 sm:ect-pt-36 ect-pb-24 ect-px-6">
    <article class="ect-max-w-5xl ect-mx-auto">
      <header class="ect-text-center ect-mb-14 sm:ect-mb-20">
        <p class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-4">
          <span class="ect-w-6 ect-h-px ect-bg-gold-400" /> Get in Touch
        </p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-mb-6 ect-tracking-wide">Contact Us</h1>
        <p class="ect-font-body ect-text-base ect-text-charcoal/70 ect-max-w-xl ect-mx-auto">We'd love to hear from you. Whether it's a question, custom order, or just to say hello.</p>
      </header>

      <section class="ect-grid ect-grid-cols-1 lg:ect-grid-cols-2 ect-gap-10 lg:ect-gap-16">
        <!-- Contact info cards -->
        <section class="ect-space-y-6">
          <article class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-sand ect-shadow-sm ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-12 ect-h-12 ect-rounded-xl ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-5 ect-h-5 ect-text-gold-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </span>
            <span>
              <h2 class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-mb-1">Visit us</h2>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/60 ect-leading-relaxed">SEZ-2, Sitapura Industrial Area<br />Jaipur, Rajasthan 302022, India</p>
            </span>
          </article>
          <article class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-sand ect-shadow-sm ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-12 ect-h-12 ect-rounded-xl ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-5 ect-h-5 ect-text-gold-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </span>
            <span>
              <h2 class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-mb-1">Email</h2>
              <a href="mailto:sales@kianajewels.in" class="ect-font-body ect-text-sm ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors">sales@kianajewels.in</a>
            </span>
          </article>
          <article class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-sand ect-shadow-sm ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-12 ect-h-12 ect-rounded-xl ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-5 ect-h-5 ect-text-gold-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a11.285 11.285 0 01-3.256-3.137c-.111-.184-.006-.418.19-.6l1.13-.936c.32-.266.475-.714.407-1.146l-.382-2.26a1.125 1.125 0 00-1.09-.932H2.25z" />
              </svg>
            </span>
            <span>
              <h2 class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-mb-1">Phone</h2>
              <a href="tel:+919216399116" class="ect-font-body ect-text-sm ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors">+91 92163 99116</a>
            </span>
          </article>
        </section>

        <!-- Contact form -->
        <section v-if="!submitted" class="ect-bg-white ect-rounded-2xl ect-p-8 sm:ect-p-10 ect-border ect-border-sand ect-shadow-sm">
          <h2 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-text-charcoal ect-mb-6">Send a message</h2>
          <form @submit.prevent="handleSubmit" class="ect-space-y-5">
            <label class="ect-block">
              <span class="ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-text-charcoal/70 ect-mb-2 ect-block">Name</span>
              <input
                v-model="name"
                type="text"
                required
                placeholder="Your name"
                class="ect-w-full ect-px-4 ect-py-3 ect-bg-cream/50 ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 ect-transition-all"
              />
            </label>
            <label class="ect-block">
              <span class="ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-text-charcoal/70 ect-mb-2 ect-block">Email</span>
              <input
                v-model="email"
                type="email"
                required
                placeholder="you@example.com"
                class="ect-w-full ect-px-4 ect-py-3 ect-bg-cream/50 ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 ect-transition-all"
              />
            </label>
            <label class="ect-block">
              <span class="ect-font-body ect-text-sm ect-font-semibold ect-uppercase ect-tracking-[0.15em] ect-text-charcoal/70 ect-mb-2 ect-block">Message</span>
              <textarea
                v-model="message"
                required
                rows="5"
                placeholder="How can we help?"
                class="ect-w-full ect-px-4 ect-py-3 ect-bg-cream/50 ect-border ect-border-sand ect-rounded-xl ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-outline-none focus:ect-border-gold-400 focus:ect-ring-2 focus:ect-ring-gold-400/25 ect-transition-all ect-resize-none"
              />
            </label>
            <button
              type="submit"
              class="ect-w-full ect-py-3.5 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-full hover:ect-bg-noir focus:ect-outline-none focus:ect-ring-2 focus:ect-ring-gold-400 focus:ect-ring-offset-2 focus:ect-ring-offset-white ect-transition-colors"
            >Send message</button>
          </form>
        </section>

        <section v-else class="ect-bg-white ect-rounded-2xl ect-p-12 ect-border ect-border-sand ect-shadow-sm ect-flex ect-flex-col ect-items-center ect-justify-center ect-text-center ect-min-h-[320px]">
          <span class="ect-w-20 ect-h-20 ect-rounded-full ect-bg-champagne/50 ect-flex ect-items-center ect-justify-center ect-mb-6">
            <svg class="ect-w-10 ect-h-10 ect-text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Thank you!</h2>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/60">We'll get back to you shortly.</p>
        </section>
      </section>
    </article>
  </section>
</template>
