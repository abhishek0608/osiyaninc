<script setup lang="ts">
// A duplicate of osiyaninc.com/about-us: the full-bleed "Our Story" banner,
// the eight-paragraph story, and the closing bench band. Copy and imagery are
// taken verbatim from the live page, so this view is deliberately static —
// see AppFooter.vue for the same approach on the site footer.
const story = [
  'In the heart of a bustling metropolis, where innovation meets tradition, a vision was born—a vision that transcends the ordinary and embraces the extraordinary. This is the genesis of Osiyan, where every piece is meticulously crafted with the passion of colorstone and diamond.',
  'At our core lies a commitment to excellence and a relentless pursuit of beauty. Inspired by the kaleidoscope of hues found in the most exquisite colorstones and the timeless brilliance of diamonds, our artisans weave a tale of sophistication and elegance with every creation.',
  'Our journey begins with a reverence for nature’s palette, as we source the most rare and vibrant colorstones from around the globe. Each gem is handpicked, with a discerning eye for quality and a passion for the unique stories they hold. From the intense blues of sapphires to the fiery reds of rubies, every colorstone is a chapter in the narrative of our jewelry.',
  'But it is the dance between colorstones and diamonds that defines our brand. Like a symphony of light and shadow, our designers carefully orchestrate these precious gems into breathtaking jewelry. The result is a harmonious blend of vivid colors and timeless sparkle—a celebration of the union between earth’s treasures and the brilliance of the finest diamonds.',
  'Behind every piece lies the soul of an artisan, devoted to transforming raw materials into wearable works of art. Our ateliers are hives of creativity, where tradition and innovation coalesce. Each design is brought to life through a fusion of time-honored craftsmanship and cutting-edge techniques, ensuring that every piece is a testament to our unwavering commitment to quality.',
  'In a world where trends come and go, our jewelry stands as a testament to enduring style. We believe in creating pieces that transcend time, becoming heirlooms that tell stories for generations to come. The passion for colorstone and diamond is not just a design philosophy; it’s a promise to our discerning clientele—a promise of unparalleled beauty, quality, and craftsmanship.',
  'As you embark on a journey with our jewelry, you become part of a narrative that celebrates the extraordinary. Our pieces are not just accessories; they are expressions of individuality, symbols of timeless elegance that capture the essence of the wearer.',
  'Welcome to a world where colorstone and diamond come together in a passionate dance—a world where each piece tells a story of artistry, sophistication, and enduring beauty. This is more than jewelry; this is a legacy of passion and craftsmanship—a legacy we invite you to be a part of.',
]
</script>

<template>
  <article class="story-page">
    <figure class="story-banner">
      <img src="/osiyan-story-hero.jpg" alt="An Osiyan artisan setting stones at the bench" />
      <figcaption><h1>Our Story</h1></figcaption>
    </figure>

    <section class="story-copy">
      <p v-for="(paragraph, i) in story" :key="i">{{ paragraph }}</p>
    </section>

    <figure class="story-band">
      <img src="/osiyan-story-band.jpg" alt="Colorstone and diamond jewelry by Osiyan" loading="lazy" />
    </figure>
  </article>
</template>

<style scoped>
.story-page { background: #fff; color: #000; padding-bottom: 90px; }

/* Banner — full-bleed, with the title held at the live page's 34% mark rather
   than dead centre. */
.story-banner { position: relative; margin: 0; }
.story-banner img { display: block; width: 100%; aspect-ratio: 2530 / 1294; object-fit: cover; object-position: top; }
.story-banner figcaption {
  position: absolute;
  top: 34%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  padding: 0 24px;
  text-align: center;
}
.story-banner h1 {
  margin: 0;
  color: #fff;
  font-family: 'Times New Roman', Times, serif;
  font-size: clamp(34px, 5.5vw, 70px);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: 0.1em;
}

/* Widths carry the 24px gutter on top of the live page's measurements, so the
   text column still measures 757px and the band 1105px at full size. */
.story-copy { max-width: 805px; margin: 0 auto; padding: 151px 24px 0; }
.story-copy p {
  margin: 0 0 22px;
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.4;
  text-align: justify;
}
.story-copy p:last-child { margin-bottom: 0; }

.story-band { max-width: 1153px; margin: 82px auto 0; padding: 0 24px; }
.story-band img { display: block; width: 100%; aspect-ratio: 2210 / 630; object-fit: cover; }

@media (max-width: 760px) {
  .story-copy { padding-top: 64px; }
  .story-band { margin-top: 48px; }
  .story-page { padding-bottom: 56px; }
}
</style>
