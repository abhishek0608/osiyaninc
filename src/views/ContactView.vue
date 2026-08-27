<script setup lang="ts">
// Contact lived as a second tab on the About page until that page became a
// duplicate of osiyaninc.com/about-us, which is story-only. The live site keeps
// contact on its own /contact-us page, so it moves here and the footer's
// "Contact Us" link points at it.
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
  <div class="ect-min-h-screen ect-bg-pearl">
    <section class="ect-relative ect-overflow-hidden ect-bg-noir ect-text-cream ect-py-20 sm:ect-py-24 ect-px-6 ect-text-center">
      <span class="ect-absolute ect-inset-0 ect-bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(201,162,39,0.13),transparent)]" />
      <div class="ect-relative">
        <p class="ect-font-display ect-italic ect-text-lg ect-text-gold-300 ect-mb-4">Get in touch</p>
        <h1 class="ect-font-display ect-font-light ect-text-4xl sm:ect-text-6xl ect-tracking-display-tight">Let's talk.</h1>
      </div>
    </section>

    <section class="ect-max-w-6xl ect-mx-auto ect-px-6 ect-py-16 sm:ect-py-20">
      <section class="ect-grid ect-grid-cols-1 lg:ect-grid-cols-[1fr_1.4fr] ect-gap-10">
        <!-- Info -->
        <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-3">
          <li class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-charcoal/[0.06] ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-10 ect-h-10 ect-rounded-xl ect-bg-charcoal ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-4 ect-h-4 ect-text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
            </span>
            <div>
              <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-mb-1">Visit us</p>
              <p class="ect-font-body ect-text-sm ect-text-charcoal ect-leading-relaxed">580 5th Avenue Suite 802<br />New York, NY 10036</p>
            </div>
          </li>
          <li class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-charcoal/[0.06] ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-10 ect-h-10 ect-rounded-xl ect-bg-charcoal ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-4 ect-h-4 ect-text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
            </span>
            <div>
              <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-mb-1">Email</p>
              <a href="mailto:info@osiyaninc.com" class="ect-font-body ect-text-sm ect-text-charcoal hover:ect-text-gold-700 ect-transition-colors">info@osiyaninc.com</a>
            </div>
          </li>
          <li class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-charcoal/[0.06] ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-10 ect-h-10 ect-rounded-xl ect-bg-charcoal ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-4 ect-h-4 ect-text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a11.285 11.285 0 01-3.256-3.137c-.111-.184-.006-.418.19-.6l1.13-.936c.32-.266.475-.714.407-1.146l-.382-2.26a1.125 1.125 0 00-1.09-.932H2.25z"/></svg>
            </span>
            <div>
              <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-mb-1">Call or WhatsApp</p>
              <a href="tel:+19174074075" class="ect-font-body ect-text-sm ect-text-charcoal hover:ect-text-gold-700 ect-transition-colors">+1 (917) 407-4075</a>
            </div>
          </li>
          <li class="ect-bg-white ect-rounded-2xl ect-p-6 ect-border ect-border-charcoal/[0.06] ect-flex ect-items-start ect-gap-4">
            <span class="ect-w-10 ect-h-10 ect-rounded-xl ect-bg-charcoal ect-flex ect-items-center ect-justify-center ect-shrink-0">
              <svg class="ect-w-4 ect-h-4 ect-text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </span>
            <div>
              <p class="ect-font-body ect-text-xs ect-uppercase ect-tracking-widest ect-text-charcoal/40 ect-mb-1">24x7 enquiry support</p>
              <a href="tel:+918779395590" class="ect-font-body ect-text-sm ect-text-charcoal hover:ect-text-gold-700 ect-transition-colors">+91 877-939-5590</a>
            </div>
          </li>
        </ul>

        <!-- Form -->
        <div class="ect-bg-white ect-rounded-3xl ect-p-8 sm:ect-p-10 ect-border ect-border-charcoal/[0.06] ect-shadow-sm">
          <template v-if="!submitted">
            <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-7">Send a message</h2>
            <form @submit.prevent="handleSubmit" class="ect-space-y-5">
              <label class="ect-block">
                <span class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.15em] ect-font-semibold ect-text-charcoal/40 ect-block ect-mb-2">Name</span>
                <input v-model="name" type="text" required placeholder="Your full name"
                  class="ect-w-full ect-px-4 ect-py-3.5 ect-rounded-xl ect-bg-cream/60 ect-border ect-border-charcoal/[0.08] ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/25 focus:ect-outline-none focus:ect-border-charcoal/30 focus:ect-ring-2 focus:ect-ring-charcoal/[0.06] ect-transition-all" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.15em] ect-font-semibold ect-text-charcoal/40 ect-block ect-mb-2">Email</span>
                <input v-model="email" type="email" required placeholder="you@example.com"
                  class="ect-w-full ect-px-4 ect-py-3.5 ect-rounded-xl ect-bg-cream/60 ect-border ect-border-charcoal/[0.08] ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/25 focus:ect-outline-none focus:ect-border-charcoal/30 focus:ect-ring-2 focus:ect-ring-charcoal/[0.06] ect-transition-all" />
              </label>
              <label class="ect-block">
                <span class="ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.15em] ect-font-semibold ect-text-charcoal/40 ect-block ect-mb-2">Message</span>
                <textarea v-model="message" required rows="5" placeholder="How can we help?"
                  class="ect-w-full ect-px-4 ect-py-3.5 ect-rounded-xl ect-bg-cream/60 ect-border ect-border-charcoal/[0.08] ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/25 focus:ect-outline-none focus:ect-border-charcoal/30 focus:ect-ring-2 focus:ect-ring-charcoal/[0.06] ect-transition-all ect-resize-none" />
              </label>
              <button type="submit"
                class="ect-w-full ect-py-4 ect-rounded-xl ect-bg-charcoal ect-text-cream ect-font-body ect-text-sm ect-font-semibold ect-tracking-wide hover:ect-bg-noir ect-transition-colors">
                Send message →
              </button>
            </form>
          </template>
          <template v-else>
            <div class="ect-flex ect-flex-col ect-items-center ect-justify-center ect-min-h-[320px] ect-text-center">
              <span class="ect-w-16 ect-h-16 ect-rounded-2xl ect-bg-emerald-50 ect-flex ect-items-center ect-justify-center ect-mb-5">
                <svg class="ect-w-7 ect-h-7 ect-text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </span>
              <h2 class="ect-font-display ect-text-2xl ect-font-light ect-text-charcoal ect-mb-2">Message sent!</h2>
              <p class="ect-font-body ect-text-sm ect-text-charcoal/50">We'll get back to you within 24 hours.</p>
            </div>
          </template>
        </div>
      </section>
    </section>
  </div>
</template>
