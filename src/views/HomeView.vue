<script setup lang="ts">
import { ref } from 'vue'

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

    <section class="jewelry-mosaic" aria-label="High Jewelry details">
      <div class="mosaic-column">
        <img src="/osiyan-luxury-1.jpeg" alt="Osiyan high jewelry piece" loading="lazy" />
        <img src="/osiyan-luxury-2.jpg" alt="Osiyan fine jewelry piece" loading="lazy" />
      </div>
      <div class="mosaic-green"><span>OSIYAN</span></div>
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
.jewelry-mosaic { display: grid; grid-template-columns: 1fr 1fr; min-height: 592px; background: #fff; }
.mosaic-column { padding: 0 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center; }
.mosaic-column img { width: 100%; aspect-ratio: 1; object-fit: cover; }
.mosaic-green { display: grid; place-items: center; background: #3f7652; color: rgba(255,255,255,.9); }
.mosaic-green span { font-family: var(--font-display); font-size: clamp(52px, 8vw, 106px); letter-spacing: .26em; padding-left: .26em; font-weight: 300; }
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
  .jewelry-mosaic { grid-template-columns: 1fr; }
  .mosaic-column { padding: 26px; }
  .mosaic-green { min-height: 360px; }
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
  .mosaic-column { grid-template-columns: 1fr; }
  .mosaic-green span { font-size: 45px; }
}
</style>
