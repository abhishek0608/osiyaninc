<template>
  <section class="ect-min-h-[70vh] ect-flex ect-items-center ect-justify-center ect-px-6 ect-py-32">
    <div class="ect-max-w-xl ect-text-center">
      <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.22em] ect-text-gold-700">
        Error 404
      </p>
      <h1 class="ect-mt-4 ect-font-display ect-text-4xl sm:ect-text-5xl ect-font-light ect-text-charcoal">
        This page could not be found
      </h1>
      <p class="ect-mt-5 ect-font-body ect-text-sm ect-leading-relaxed ect-text-charcoal/60">
        The page may have moved or the address may be incorrect. Explore our collections to find
        handcrafted Kiana jewellery.
      </p>
      <RouterLink
        to="/collections"
        class="ect-mt-8 ect-inline-flex ect-items-center ect-justify-center ect-bg-charcoal ect-px-7 ect-py-3.5 ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.16em] ect-text-white hover:ect-bg-noir ect-transition-colors"
      >
        Explore collections
      </RouterLink>
    </div>
  </section>
</template>
