<script setup lang="ts">
// A duplicate of osiyaninc.com/high-jewelry: the "Art of Perfection" hero, the
// Arial Black banner, the "Precision-Picked" note set over the emerald still
// life, and the five alternating suite bands. Copy, imagery and every
// measurement below are read off the live page at a 1440px viewport, so this
// view is deliberately static — see AboutView.vue for the same approach on the
// story page.
//
// Section heights are fixed pixels because the live page's are: Wix sizes these
// strips in the editor and only the photograph widens with the viewport. For the
// same reason `titleTop` and `gap` are carried per band rather than derived —
// the strips are near enough centred to look like a rule, but the editor left
// every one of them nudged by a different amount.
//
// The live Explore buttons point at /jewel-garden, /jade-forest, /osiyanic-blues
// and /fiery — all four sit behind the Wix guest-area password — while the
// newest band, Hematita Zora, points at the contact page. Here every button
// opens the suite's collection page (/collections/<key>), which lists the
// pieces whose Product.collection carries that suite's name — the packing
// list's COLLECTION column. The live paths redirect there (see the router).
interface Suite {
  key: string
  /** Title, pre-split into the two lines the live page sets it on. */
  lines: [string, string]
  image: string
  alt: string
  /** Which half the photograph takes. */
  media: 'left' | 'right'
  /** Live band height in px. */
  height: number
  /** Live distance from the band's top edge to the title, in px. */
  titleTop: number
  /** Live gap from the title to the Explore button, in px. */
  gap: number
  /** object-position for the photograph's crop. */
  focus: string
}

const SUITES: Suite[] = [
  {
    key: 'jewel-garden',
    lines: ['Jewel', 'Garden'],
    image: '/osiyan-hj-jewel-garden.png',
    alt: 'Carved tourmaline butterfly pendant on a gold chain strung with emerald and pink tourmaline beads',
    media: 'right',
    height: 689,
    titleTop: 221,
    gap: 80,
    focus: '50% 100%',
  },
  {
    key: 'jade-forest',
    lines: ['Jade', 'Forest'],
    image: '/osiyan-hj-jade-forest.jpg',
    alt: 'Emerald and diamond drop earrings in white gold',
    media: 'left',
    height: 660,
    titleTop: 185,
    gap: 74,
    focus: '50% 50%',
  },
  {
    key: 'osiyanic-blues',
    lines: ['Osiyanic', 'Blues'],
    image: '/osiyan-hj-osiyanic-blues.jpg',
    alt: 'Aquamarine and diamond chandelier earrings in white gold',
    media: 'right',
    height: 713,
    titleTop: 221,
    gap: 49,
    focus: '50% 50%',
  },
  {
    key: 'fiery',
    lines: ['Fiery', 'Collection'],
    image: '/osiyan-hj-fiery.jpg',
    alt: 'Fire opal and diamond drop earrings in yellow gold',
    media: 'left',
    height: 747,
    titleTop: 221,
    gap: 90,
    focus: '50% 50%',
  },
  {
    key: 'hematita-zora',
    lines: ['Hematita', 'Zora'],
    image: '/osiyan-hj-hematita-zora.jpg',
    alt: 'Three yellow gold rings set with Brazilian alexandrite and diamonds',
    media: 'right',
    height: 747,
    titleTop: 281,
    gap: 49,
    focus: '50% 50%',
  },
]
</script>

<template>
  <div class="hj-page">
    <section class="hj-hero">
      <img
        src="/osiyan-hj-hero.jpg"
        alt="Annotated design drawing for an Osiyan tourmaline, emerald and gold necklace"
      />
      <div class="hj-hero-copy">
        <h1>Art of Perfection</h1>
        <p>A harmonious blend of nature's finest gemstones and diamonds curated to perfection.</p>
      </div>
    </section>

    <section class="hj-banner">
      <img
        src="/osiyan-hj-banner.jpg"
        alt="A model wearing an Osiyan pink tourmaline and aquamarine drop earring"
        loading="lazy"
      />
      <h2>High Jewelry</h2>
    </section>

    <section class="hj-precision">
      <img
        src="/osiyan-hj-precision.jpg"
        alt="Loose emeralds laid out beside fresh leaves"
        loading="lazy"
      />
      <div class="hj-precision-copy">
        <div>
          <h2>Precision-Picked</h2>
          <p>
            Our carefully selected stones reflect a commitment to craftsmanship, ensuring each
            piece is a unique and timeless expression of elegance.
          </p>
        </div>
      </div>
    </section>

    <section
      v-for="suite in SUITES"
      :key="suite.key"
      class="hj-suite"
      :class="`media-${suite.media}`"
      :style="{
        '--hj-band-height': `${suite.height}px`,
        '--hj-title-top': `${suite.titleTop}px`,
        '--hj-gap': `${suite.gap}px`,
      }"
    >
      <div class="hj-suite-media">
        <img :src="suite.image" :alt="suite.alt" :style="{ objectPosition: suite.focus }" loading="lazy" />
      </div>
      <div class="hj-suite-copy">
        <h2>{{ suite.lines[0] }}<br />{{ suite.lines[1] }}</h2>
        <RouterLink class="hj-explore" :to="`/collections/${suite.key}`">Explore</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hj-page { background: #fff; color: #000; }
.hj-page :where(h1, h2, p) { margin: 0; }

/* Cormorant Garamond carries the hero and the Precision-Picked note; the two
   weights are requested in index.html. */
.hj-hero h1,
.hj-hero p,
.hj-precision h2,
.hj-precision p { font-family: 'Cormorant Garamond', Cormorant, Garamond, serif; }

/* Hero — full-bleed, with the drawing held to its bottom edge as the live page
   does, and the title sitting at 506px of the 1130px band. */
.hj-hero { position: relative; height: 1130px; overflow: hidden; }
.hj-hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 100%; }
.hj-hero-copy { position: relative; padding: 506px 24px 0; text-align: center; color: #fff; }
.hj-hero h1 { font-size: 95px; font-weight: 600; line-height: 111px; letter-spacing: .03em; }
.hj-hero p { max-width: 688px; margin-inline: auto; font-size: 24px; font-weight: 300; line-height: 28.8px; }

/* Banner — the one place the site reaches for Arial Black. The 900 weight is
   there for platforms that have no Arial Black to fall back on. */
.hj-banner { position: relative; height: 913px; overflow: hidden; }
.hj-banner > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hj-banner h2 {
  position: relative;
  padding: 319px 24px 0;
  font-family: 'Arial Black', 'Arial Bold', Gadget, var(--font-body);
  font-size: 125px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -.03em;
  text-align: center;
  color: #fff;
}

/* Precision-Picked — the note is set in black over the white of the still life,
   437px into the live page's 980px content column. */
.hj-precision { position: relative; height: 1011px; overflow: hidden; }
.hj-precision > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hj-precision-copy { position: relative; max-width: 980px; margin-inline: auto; padding-top: 428px; }
.hj-precision-copy > div { width: 304px; margin-left: 437px; }
.hj-precision h2 { font-size: 40px; font-weight: 600; line-height: 49px; letter-spacing: .03em; }
.hj-precision p { margin-top: 46px; font-size: 25px; font-weight: 300; line-height: 30px; }

/* Suite bands — a photograph and a name, alternating sides. */
.hj-suite { display: grid; grid-template-columns: 1fr 1fr; height: var(--hj-band-height); }
.hj-suite-media { overflow: hidden; }
.hj-suite-media img { display: block; width: 100%; height: 100%; object-fit: cover; }
.media-left .hj-suite-media { grid-column: 1; }
.media-left .hj-suite-copy { grid-column: 2; }
.media-right .hj-suite-media { grid-column: 2; }
.media-right .hj-suite-copy { grid-column: 1; grid-row: 1; }
.hj-suite-copy { display: flex; flex-direction: column; align-items: center; padding: var(--hj-title-top) 24px 0; }
.hj-suite-copy h2 { font-family: var(--font-body); font-size: 56px; font-weight: 700; line-height: 67px; text-align: center; }
.hj-explore {
  margin-top: var(--hj-gap);
  display: grid;
  place-items: center;
  width: 142px;
  height: 42px;
  border-radius: 50px;
  background: #000;
  color: #fff;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 300;
  letter-spacing: 3.75px;
  text-decoration: none;
}
.hj-explore:hover { background: #333; }

/* Below the live site's desktop breakpoint the bands stack, matching the
   proportions and type sizes of its own mobile layout (a 320px design). */
@media (max-width: 800px) {
  .hj-hero { height: auto; aspect-ratio: 320 / 273; }
  .hj-hero-copy { padding: 6.25% 20px 0; }
  .hj-hero h1 { font-size: 41px; line-height: 1.2; letter-spacing: normal; }
  .hj-hero p { font-size: 18px; line-height: 21.6px; }

  .hj-banner { height: auto; aspect-ratio: 320 / 195; }
  .hj-banner h2 { padding: 18.75% 20px 0; font-size: 37px; line-height: 1.2; }

  .hj-precision { height: auto; aspect-ratio: 320 / 322; }
  .hj-precision-copy { padding: 50% 20px 0; }
  .hj-precision-copy > div { width: auto; margin-left: 0; }
  .hj-precision h2 { font-size: 22px; line-height: 1.2; }
  .hj-precision p { margin-top: 20px; font-size: 18px; line-height: 21.6px; }

  .hj-suite { grid-template-columns: 1fr; height: auto; }
  .hj-suite-media { aspect-ratio: 320 / 260; }
  .media-left .hj-suite-media,
  .media-right .hj-suite-media,
  .media-left .hj-suite-copy,
  .media-right .hj-suite-copy { grid-column: 1; grid-row: auto; }
  .hj-suite-copy { padding: 19px 20px 46px; }
  .hj-suite-copy h2 { font-size: 35px; line-height: 1.2; }
  .hj-explore { margin-top: 30px; width: 120px; height: 32px; }
}
</style>
