<script setup lang="ts">
const openings = [
  { title: 'Master Jeweller', type: 'Full-time', location: 'Jaipur', description: 'Join our atelier team to craft exquisite fine jewellery using traditional and modern techniques.' },
  { title: 'Design Associate', type: 'Full-time', location: 'Jaipur', description: 'Collaborate with our creative director to develop new collections that push the boundaries of contemporary jewellery.' },
  { title: 'E-Commerce Manager', type: 'Full-time', location: 'Remote', description: 'Lead our online presence, optimise the digital shopping experience, and drive growth across all channels.' },
  { title: 'Brand Stylist', type: 'Part-time', location: 'Jaipur', description: 'Style and art-direct photoshoots for campaigns, social media, and editorial features.' },
]
</script>

<template>
  <section class="ect-min-h-screen ect-bg-gradient-to-b ect-from-cream ect-via-champagne/40 ect-to-cream ect-pt-28 sm:ect-pt-36 ect-pb-24 ect-px-6">
    <article class="ect-max-w-4xl ect-mx-auto">
      <header class="ect-text-center ect-mb-14 sm:ect-mb-20">
        <p class="ect-inline-flex ect-items-center ect-gap-1.5 ect-font-body ect-text-sm ect-uppercase ect-tracking-[0.15em] ect-text-gold-700 ect-mb-4">
          <span class="ect-w-6 ect-h-px ect-bg-gold-400" /> Join Us
        </p>
        <h1 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-mb-6 ect-tracking-wide">Careers</h1>
        <p class="ect-font-body ect-text-base ect-text-charcoal/70 ect-leading-relaxed ect-max-w-2xl ect-mx-auto">We're looking for passionate people who share our love for craftsmanship, creativity, and excellence.</p>
      </header>

      <section class="ect-mb-20">
        <h2 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal ect-mb-8">Open positions</h2>
        <ul class="ect-list-none ect-m-0 ect-p-0 ect-space-y-4">
          <li v-for="job in openings" :key="job.title" class="ect-bg-white ect-rounded-2xl ect-p-6 sm:ect-p-8 ect-border ect-border-sand ect-shadow-sm hover:ect-shadow-md hover:ect-border-gold-300 ect-transition-all ect-duration-300">
            <header class="ect-flex ect-flex-col sm:ect-flex-row sm:ect-items-center sm:ect-justify-between ect-gap-3 ect-mb-4">
              <h3 class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal">{{ job.title }}</h3>
              <span class="ect-flex ect-flex-wrap ect-gap-2">
                <span class="ect-font-body ect-text-xs ect-px-3 ect-py-1.5 ect-bg-champagne ect-text-gold-800 ect-rounded-full ect-font-medium">{{ job.type }}</span>
                <span class="ect-font-body ect-text-xs ect-px-3 ect-py-1.5 ect-bg-charcoal/5 ect-text-charcoal/70 ect-rounded-full">{{ job.location }}</span>
              </span>
            </header>
            <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-leading-relaxed ect-mb-5">{{ job.description }}</p>
            <a href="mailto:careers@kianajewels.in" class="ect-inline-flex ect-items-center ect-gap-2 ect-font-body ect-text-sm ect-font-semibold ect-text-gold-700 hover:ect-text-gold-800 ect-transition-colors">
              Apply now
              <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
          </li>
        </ul>
      </section>

      <section class="ect-bg-gradient-to-br ect-from-champagne/60 ect-to-cream ect-rounded-2xl ect-p-10 sm:ect-p-12 ect-border ect-border-sand ect-shadow-sm ect-text-center">
        <h2 class="ect-font-display ect-text-2xl sm:ect-text-3xl ect-font-light ect-text-charcoal ect-mb-3">Don't see your role?</h2>
        <p class="ect-font-body ect-text-sm ect-text-charcoal/60 ect-mb-6 ect-max-w-md ect-mx-auto">We're always interested in meeting talented people. Send us your CV and tell us how you'd contribute.</p>
        <a href="mailto:careers@kianajewels.in" class="ect-inline-flex ect-items-center ect-gap-2 ect-px-6 ect-py-3 ect-bg-charcoal ect-text-white ect-font-body ect-text-sm ect-font-semibold ect-rounded-full hover:ect-bg-noir ect-transition-colors">
          Get in touch
          <svg class="ect-w-4 ect-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </a>
      </section>
    </article>
  </section>
</template>
