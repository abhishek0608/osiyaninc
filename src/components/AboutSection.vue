<script setup lang="ts">
// Refined line icons replace the previous emoji set — emoji read as casual,
// crisp gold-toned line marks read as a maison.
type IconName = 'gem' | 'inhouse' | 'quality' | 'global'

const features: { icon: IconName; title: string; text: string }[] = [
  { icon: 'gem', title: 'Semi-Mount Specialists', text: 'Precision-engineered semi mounts built for perfect stone fit, superior strength and brilliant aesthetics' },
  { icon: 'inhouse', title: 'Complete In-House Manufacturing', text: 'CAD design, casting, stone setting and finishing — every stage handled under one roof' },
  { icon: 'quality', title: 'Consistent Quality', text: 'Rigorous multi-level inspection ensures each piece meets the highest standards of quality and durability' },
  { icon: 'global', title: 'Global Export Expertise', text: 'Trusted by clients and brands worldwide, with flexible capacity for orders of any scale' },
]
</script>

<template>
  <section id="about" class="ect-py-16 sm:ect-py-24 ect-px-6">
    <article class="ect-max-w-7xl ect-mx-auto ect-grid ect-grid-cols-1 lg:ect-grid-cols-2 ect-gap-12 lg:ect-gap-16 ect-items-center">
      <section>
        <p class="ect-inline-flex ect-items-center ect-gap-2.5 ect-font-body ect-text-[11px] ect-uppercase ect-tracking-[0.22em] ect-text-gold-700 ect-mb-4">
          <span class="ect-w-8 ect-h-px ect-bg-gold-400" />
          Why Kiana
        </p>
        <h2 class="ect-font-display ect-text-3xl sm:ect-text-[2.75rem] ect-font-light ect-leading-[1.1] ect-text-charcoal ect-mb-5">Precision crafted,<br class="ect-hidden sm:ect-block" /> timeless trust</h2>
        <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-leading-relaxed ect-mb-5">Precision, technology and craftsmanship in every piece — designed, cast and finished in-house at our Jaipur facility, for clients and brands worldwide.</p>
        <p class="ect-font-body ect-text-base ect-text-charcoal/60 ect-leading-relaxed ect-mb-8">From CAD design and rapid prototyping to casting, stone setting and quality assurance, we turn creative ideas into exceptional collections.</p>
        <RouterLink to="/about" class="ect-group ect-inline-flex ect-items-center ect-gap-2.5 ect-px-7 ect-py-3.5 ect-bg-charcoal ect-text-white ect-font-body ect-text-[12px] ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-rounded-full hover:ect-bg-noir ect-transition-colors">
          Read Our Story
          <svg class="ect-w-4 ect-h-4 ect-transition-transform ect-duration-200 group-hover:ect-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </RouterLink>
      </section>

      <ul class="ect-grid ect-grid-cols-1 sm:ect-grid-cols-2 ect-gap-4 ect-list-none ect-m-0 ect-p-0">
        <li
          v-for="f in features"
          :key="f.title"
          class="ect-group ect-p-6 ect-bg-pearl ect-border ect-border-sand ect-rounded-2xl ect-transition-all ect-duration-300 hover:ect-shadow-luxe-sm hover:ect-border-gold-300/60 hover:-ect-translate-y-1"
        >
          <span class="ect-inline-flex ect-items-center ect-justify-center ect-w-11 ect-h-11 ect-rounded-full ect-bg-champagne ect-text-gold-700 ect-mb-4 ect-transition-colors group-hover:ect-bg-gold-400 group-hover:ect-text-white">
            <svg v-if="f.icon === 'gem'" class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M12 21L2.25 8.25 6 3.75h12l3.75 4.5L12 21zM8.25 8.25L12 3.75l3.75 4.5M12 21L8.25 8.25M12 21l3.75-12.75" />
            </svg>
            <svg v-else-if="f.icon === 'inhouse'" class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 21V9.349m15 11.651V9.349M3 9.349l9-5.599 9 5.599M8.25 21v-6.75h7.5V21M9 12h.008M15 12h.008" />
            </svg>
            <svg v-else-if="f.icon === 'quality'" class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg v-else class="ect-w-5 ect-h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 3.75-4.03 3.75-9S14.485 3 12 3 8.25 7.03 8.25 12 9.515 21 12 21zM3 12h18" />
            </svg>
          </span>
          <h3 class="ect-font-display ect-text-lg ect-font-medium ect-text-charcoal ect-mb-1.5">{{ f.title }}</h3>
          <p class="ect-font-body ect-text-sm ect-text-charcoal/55 ect-leading-relaxed">{{ f.text }}</p>
        </li>
      </ul>
    </article>
  </section>
</template>
