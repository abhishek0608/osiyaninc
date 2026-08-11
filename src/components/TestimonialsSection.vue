<script setup lang="ts">
const reviews = [
  { name: 'Priya S.', location: 'Mumbai', text: 'The craftsmanship is stunning. My Étoile ring looks even more beautiful in person than in the photos.', rating: 5 },
  { name: 'Ananya M.', location: 'Delhi', text: 'Ordered a Lune pendant for my anniversary. The packaging, quality, and delivery — everything was perfect.', rating: 5 },
  { name: 'Rhea K.', location: 'Bangalore', text: 'Finally, a brand that combines traditional Rajasthani artistry with designs I actually want to wear every day.', rating: 5 },
]
</script>

<template>
  <section class="ect-py-16 sm:ect-py-24 ect-px-6 ect-bg-pearl">
    <article class="ect-max-w-7xl ect-mx-auto">
      <header class="ect-text-center ect-mb-12">
        <p class="ect-inline-flex ect-items-center ect-gap-2.5 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.22em] ect-text-gold-700 ect-mb-3">
          <span class="ect-w-8 ect-h-px ect-bg-gold-400" />
          Testimonials
          <span class="ect-w-8 ect-h-px ect-bg-gold-400" />
        </p>
        <h2 class="ect-font-display ect-text-3xl sm:ect-text-4xl ect-font-light ect-text-charcoal">Loved by our clients</h2>
      </header>

      <ul class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-3 ect-gap-6 ect-list-none ect-m-0 ect-p-0">
        <li
          v-for="review in reviews"
          :key="review.name"
          class="ect-relative ect-bg-white ect-p-7 ect-rounded-2xl ect-border ect-border-sand ect-transition-all ect-duration-300 hover:ect-shadow-luxe-sm hover:ect-border-gold-300/60"
        >
          <span class="ect-font-display ect-text-5xl ect-leading-none ect-text-gold-300 ect-select-none" aria-hidden="true">&ldquo;</span>
          <p class="ect-font-body ect-text-base ect-text-charcoal/75 ect-leading-relaxed ect-mt-1 ect-mb-5">{{ review.text }}</p>
          <p class="ect-text-sm ect-text-gold-400 ect-tracking-[0.15em] ect-mb-3">{{ '★'.repeat(review.rating) }}</p>
          <footer class="ect-pt-4 ect-border-t ect-border-sand">
            <p class="ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal">{{ review.name }}</p>
            <p class="ect-font-body ect-text-xs ect-text-charcoal/45 ect-mt-0.5">{{ review.location }}</p>
          </footer>
        </li>
      </ul>
    </article>
  </section>
</template>
