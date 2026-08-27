<script setup lang="ts">
import { ref } from 'vue'

// A slash gets a zero-width space after it, so "Bangles/Bracelets" wraps there
// — and only there — on tiles too narrow to hold it on one line.
const breakable = (name: string) => name.replace('/', '/\u200B')

// Home-page category collage. Each tile deep-links to its collection page and
// only names itself on hover. The photos are separate /osiyan-category-*.jpg
// files so swapping one is a file drop, not an edit here.
const CATEGORY_TILES = [
  { slug: 'earrings', name: 'Earrings', image: '/osiyan-category-earrings.jpg', alt: 'Diamond drop earring worn on the ear' },
  { slug: 'rings', name: 'Rings', image: '/osiyan-category-rings.jpg', alt: 'Emerald and diamond halo ring worn on the hand' },
  { slug: 'bracelets', name: 'Bangles/Bracelets', image: '/osiyan-category-bracelets.jpg', alt: 'Gold Osiyan bangles set with emeralds and diamonds' },
  { slug: 'necklaces', name: 'Necklaces', image: '/osiyan-category-necklaces.jpg', alt: 'Emerald pendant necklace worn at the collarbone' },
]

const email = ref('')
const subscribed = ref(false)

function subscribe() {
  if (!email.value.trim()) return
  subscribed.value = true
  email.value = ''
}
</script>

<template>
  <div class="osiyan-home">
    <section class="home-hero" aria-label="Osiyan craftsmanship">
      <img src="/osiyan-hero.jpg" alt="Jeweller hand-setting a diamond bracelet" fetchpriority="high" />
    </section>

    <section class="unseen-section">
      <article class="unseen-copy">
        <h1>Unseen Hours</h1>
        <div class="unseen-body">
          <p>Every piece begins quietly—just an idea, a sketch, a spark of inspiration. What follows is a journey shaped by patience, precision, and countless unseen hours.</p>
          <p>From selecting each stone to refining every curve, every detail is considered, revisited, and perfected. It’s not rushed—it evolves.</p>
          <p>Because true craftsmanship isn’t just about what you see… it’s about everything that went into it long before.</p>
        </div>
      </article>
      <img class="unseen-image" src="/osiyan-unseen-hours.jpg" alt="Unseen Hours — hand-finishing a piece of jewellery" loading="lazy" />
    </section>

    <section class="yoga-section">
      <article>
        <h2>Yoga<br />Bangles</h2>
        <a class="catalog-button" href="https://www.osiyaninc.com/_files/ugd/18704b_4e15cbc41f5c40a7a4f1d48d75820a7b.pdf" target="_blank" rel="noreferrer">Catalog</a>
      </article>
      <div class="yoga-image-wrap">
        <img src="/osiyan-yoga-bangles.jpg" alt="Osiyan Yoga Bangles" loading="lazy" />
      </div>
    </section>

    <section class="high-section">
      <div class="high-image-wrap">
        <img src="/osiyan-high-jewelry.jpg" alt="Emerald and diamond High Jewelry earrings" loading="lazy" />
      </div>
      <article>
        <h2>High Jewelry</h2>
        <p class="high-intro">For those who appreciate the finer things in life.</p>
        <p>Unveil a spectrum of meticulously chosen gemstones, from rare diamonds to vivid gemstones, each sourced and selected with the utmost care.</p>
        <p>Our commitment to quality ensures that every piece emanates an aura of exclusivity and prestige, making each acquisition a testament to discerning taste.</p>
        <RouterLink to="/collections" class="explore-button">Explore</RouterLink>
      </article>
    </section>

    <section class="category-section" aria-labelledby="shop-by-category">
      <div class="category-grid">
        <h2 id="shop-by-category" class="category-caption">
          <span>Shop</span><span>by</span><span>Category</span>
        </h2>
        <RouterLink
          v-for="tile in CATEGORY_TILES"
          :key="tile.slug"
          class="category-tile"
          :class="`tile-${tile.slug}`"
          :to="`/collections/${tile.slug}`"
        >
          <img :src="tile.image" :alt="tile.alt" loading="lazy" />
          <span class="category-name">{{ breakable(tile.name) }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="little-section">
      <article>
        <h2>Little<br />Luxuries</h2>
        <RouterLink to="/collections" class="shop-button">SHOP</RouterLink>
      </article>
      <img src="/osiyan-little-luxuries.png" alt="Model wearing Osiyan emerald jewelry" loading="lazy" />
    </section>

    <section class="world-section">
      <img src="/osiyan-birthstone.jpg" alt="Birthstone necklace on a green background" loading="lazy" />
      <form class="world-form" @submit.prevent="subscribe">
        <h2>Osiyan World</h2>
        <p>Subscribe to our newsletter to receive news and updates.</p>
        <label for="world-email">Enter your email here *</label>
        <input id="world-email" v-model="email" type="email" required />
        <button type="submit">Sign Up</button>
        <p v-if="subscribed" class="success-message">Thank you for subscribing.</p>
      </form>
    </section>
  </div>
</template>

<style scoped>
.osiyan-home { background: #fff; color: #000; }
.home-hero { width: 100%; height: clamp(630px, 77.2vw, 988px); overflow: hidden; }
.home-hero img { width: 100%; height: 100%; object-fit: cover; object-position: center; }
.unseen-section { display: grid; grid-template-columns: 1fr 1fr; height: 1008px; }
.unseen-copy { padding: 102px clamp(42px, 6vw, 78px) 80px; }
.unseen-copy h1 { margin: 0; font-family: var(--font-display); font-size: clamp(48px, 4.4vw, 56px); line-height: 1.22; font-weight: 300; letter-spacing: .01em; }
.unseen-body { width: 368px; max-width: 100%; margin: 126px auto 0; }
.unseen-body p { margin: 0 0 35px; font-size: 24px; line-height: 1.44; }
.unseen-image { width: 100%; height: 1008px; object-fit: cover; }
.yoga-section { display: grid; grid-template-columns: 1fr 1fr; min-height: 912px; background: #3f7652; }
.yoga-section article { padding: 142px clamp(36px, 5.5vw, 70px); display: flex; flex-direction: column; align-items: flex-start; }
.yoga-section h2, .little-section h2 { margin: 0; font-family: var(--font-display); font-size: clamp(94px, 10.8vw, 138px); line-height: .85; letter-spacing: -.015em; font-weight: 300; }
.catalog-button { margin-top: 96px; margin-left: auto; width: 188px; height: 73px; display: grid; place-items: center; background: #000; color: #fff; text-decoration: none; font-family: var(--font-display); font-size: 22px; letter-spacing: .04em; }
.yoga-image-wrap { background: #fff; display: grid; place-items: center; overflow: hidden; }
.yoga-image-wrap img { width: 100%; height: 100%; object-fit: contain; }
.high-section { display: grid; grid-template-columns: 2fr 1.18fr; min-height: 867px; }
.high-image-wrap { display: grid; place-items: center; background: #fff; overflow: hidden; }
.high-image-wrap img { width: 100%; height: 100%; object-fit: contain; }
.high-section article { padding: 68px clamp(32px, 4.7vw, 60px); display: flex; flex-direction: column; justify-content: center; }
.high-section h2 { margin: 0 0 12px; font-family: var(--font-accent); font-style: italic; font-size: 49px; line-height: 1.25; font-weight: 400; letter-spacing: .04em; }
.high-section p { margin: 0 0 28px; font-size: 23px; line-height: 1.5; }
.high-section .high-intro { margin-bottom: 33px; font-size: 16px; line-height: 1.4; }
.explore-button { align-self: center; width: 142px; height: 40px; margin-top: 50px; display: grid; place-items: center; border: 1px solid #000; color: #000; text-decoration: none; font-size: 16px; }
.explore-button:hover { background: #000; color: #fff; }
/* Shop by Category — four category tiles that each link to their collection
   page and only name themselves on hover. Gutters, gaps and the caption are the
   live site's fixed pixel values; the tiles scale with the page. */
.category-section { background: #fff; padding: 5px 40px; }
.category-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.category-caption { grid-area: 2 / 4; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 68px; line-height: 1.2; color: #5d4a62; }
.category-tile { position: relative; overflow: hidden; aspect-ratio: 1; display: grid; place-items: center; text-decoration: none; }
.tile-earrings { grid-area: 1 / 1; }
.tile-rings { grid-area: 2 / 1; }
.tile-bracelets { grid-area: 1 / 2 / 3 / 4; }
.tile-necklaces { grid-area: 1 / 4; }
.category-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .7s cubic-bezier(.2, .7, .2, 1); }
.category-tile:hover img, .category-tile:focus-visible img { transform: scale(1.05); }
/* Scrim under the name — barely there on dark photos, enough to hold white
   type on pale ones. */
.category-tile::after { content: ''; position: absolute; inset: 0; background: rgba(20, 17, 15, .22); opacity: 0; transition: opacity .35s ease; }
.category-tile:hover::after, .category-tile:focus-visible::after { opacity: 1; }
/* Revealed with opacity rather than display so the name still names the link
   for screen readers, and is always on where there is no hover to trigger it. */
.category-name { position: relative; z-index: 1; max-width: 100%; overflow-wrap: anywhere; padding: 0 3%; text-align: center; font-family: var(--font-body); font-weight: 700; font-size: clamp(18px, 3.6vw, 72px); line-height: 1.04; letter-spacing: -.01em; color: #fff; text-shadow: 0 2px 18px rgba(20, 17, 15, .45); opacity: 0; transition: opacity .35s ease; }
.category-tile:hover .category-name, .category-tile:focus-visible .category-name { opacity: 1; }
.category-tile:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
@media (hover: none) { .category-name, .category-tile::after { opacity: 1; } }
.little-section { display: grid; grid-template-columns: 1fr 1fr; min-height: 905px; background: #fff; }
.little-section article { padding: 185px clamp(36px, 6.2vw, 79px) 80px; }
.shop-button { margin-top: 96px; width: 142px; height: 45px; display: grid; place-items: center; background: #3f7652; color: #000; text-decoration: none; font-size: 16px; }
.little-section > img { width: 100%; height: 905px; object-fit: cover; }
.world-section { display: grid; grid-template-columns: 2fr 1fr; min-height: 490px; background: #fff; }
.world-section > img { width: 100%; height: 482px; object-fit: cover; }
.world-form { padding: 68px clamp(32px, 5.2vw, 66px) 40px; }
.world-form h2 { margin: 0 0 16px; font-family: var(--font-display); font-size: 34px; line-height: 1.2; font-weight: 400; letter-spacing: .01em; }
.world-form > p { margin: 0 0 31px; font-size: 16px; line-height: 1.8; }
.world-form label { display: block; margin-bottom: 8px; font-size: 14px; }
.world-form input { width: 100%; height: 36px; border: 0; border-bottom: 1px solid #000; border-radius: 0; outline: 0; font-size: 16px; }
.world-form button { width: 100%; height: 40px; margin-top: 18px; border: 1px solid #000; background: #fff; font-size: 16px; cursor: pointer; }
.world-form button:hover { background: #000; color: #fff; }
.world-form .success-message { margin-top: 12px; font-size: 13px; }

@media (max-width: 800px) {
  .home-hero { height: 66vw; min-height: 360px; }
  .unseen-section, .yoga-section, .high-section, .little-section, .world-section { grid-template-columns: 1fr; }
  .unseen-section { height: auto; min-height: 0; }
  .unseen-copy { padding: 70px 28px; }
  .unseen-body { width: 100%; margin-top: 55px; }
  .unseen-body p { font-size: 20px; }
  .unseen-image { height: 100vw; min-height: 100vw; }
  .yoga-section { min-height: 0; }
  .yoga-section article { min-height: 600px; padding: 75px 28px; }
  .yoga-image-wrap { min-height: 100vw; }
  .catalog-button { margin: 75px 0 0; }
  .high-section { min-height: 0; }
  .high-image-wrap { min-height: 110vw; }
  .high-section article { padding: 70px 28px 90px; }
  .category-section { padding: 5px 16px 14px; }
  .category-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  .tile-earrings, .tile-rings, .tile-bracelets, .tile-necklaces { grid-area: auto; }
  .category-caption { grid-area: auto; grid-column: 1 / -1; flex-direction: row; gap: .3em; padding-bottom: 6px; font-size: clamp(26px, 7.4vw, 48px); }
  .category-name { font-size: clamp(15px, 5.4vw, 34px); }
  .little-section article { min-height: 590px; padding: 90px 28px; }
  .little-section > img { height: auto; min-height: 120vw; object-fit: cover; }
  .world-section > img { height: 75vw; }
  .world-form { padding: 65px 28px 75px; }
}

@media (max-width: 480px) {
  .home-hero { height: 76vw; min-height: 300px; }
  .unseen-copy h1 { font-size: 44px; }
  .yoga-section h2, .little-section h2 { font-size: 76px; }
  .high-section h2 { font-size: 42px; }
  .high-section p { font-size: 19px; }
}
</style>
