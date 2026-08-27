<script setup lang="ts">
// A duplicate of osiyaninc.com/contact-us: the purple "Get in Touch" band with
// the ring photo and the white form card straddling its bottom edge, then the
// "Contact Details" grid on white. Measurements below are taken from the live
// page's 980px canvas and expressed as percentages of it, so the overlap holds
// as the page scales — same approach as AboutView.vue.
//
// The live form is a Wix form and posts to Wix (including its reCAPTCHA). There
// is no equivalent endpoint here yet, so submitting only swaps in the sent
// state; the reCAPTCHA block is omitted rather than faked.
import { ref } from 'vue'

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const message = ref('')
const submitted = ref(false)

function handleSubmit() {
  submitted.value = true
}
</script>

<template>
  <div class="contact-page">
    <section class="contact-hero">
      <h1>Get in Touch</h1>

      <div class="hero-body">
        <figure class="hero-photo">
          <img src="/osiyan-contact-ring.jpg" alt="An Osiyan colorstone cocktail ring worn on the hand" />
        </figure>

        <div class="form-card">
          <form v-if="!submitted" @submit.prevent="handleSubmit">
            <div class="field-row">
              <label class="field">
                <span>First Name</span>
                <input v-model="firstName" type="text" name="first-name" />
              </label>
              <label class="field">
                <span>Last Name</span>
                <input v-model="lastName" type="text" name="last-name" />
              </label>
            </div>

            <label class="field">
              <span>Email <em>*</em></span>
              <input v-model="email" type="email" name="email" required />
            </label>

            <label class="field">
              <span>Message</span>
              <textarea v-model="message" name="message" />
            </label>

            <div class="form-actions">
              <button type="submit">Send</button>
            </div>
          </form>

          <div v-else class="form-sent">
            <p class="sent-title">Thanks for getting in touch.</p>
            <p class="sent-note">We'll get back to you shortly.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="contact-details">
      <h2>Contact<br />Details</h2>

      <div class="detail">
        <h3>Address</h3>
        <p>580 5th Avenue, Suite 802</p>
        <p>New York, NY 10036</p>
      </div>

      <div class="detail">
        <h3>Phone</h3>
        <p>+1 (917) 407-4075</p>
      </div>

      <div class="detail">
        <h3>Email</h3>
        <p><a href="mailto:info@osiyaninc.com">info@osiyaninc.com</a></p>
      </div>

      <div class="detail detail-social">
        <h3>Social Media</h3>
        <p>
          <a href="https://www.instagram.com/osiyanjewels" target="_blank" rel="noopener" aria-label="Osiyan on Instagram">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
              <circle cx="12" cy="12" r="4.2" />
              <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
            </svg>
          </a>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.contact-page { background: #fff; color: #000; }

/* ---- Purple band -------------------------------------------------------- */
/* The band is a backdrop rather than the section's own background so the form
   card can hang past its bottom edge (63px on the live page) without stretching
   it. Section height is driven by the card, so 100% - 63px lands the edge. */
.contact-hero { position: relative; padding-top: 84px; }
.contact-hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  /* The live strip is inset 60px each side but never narrows past the 980px
     canvas, so it sits centred with white gutters on wide screens. */
  width: max(980px, calc(100% - 120px));
  height: calc(100% - 63px);
  background: #5d4a62;
}
/* Below the canvas width the live page just overflows; go full-bleed instead
   of forcing a horizontal scrollbar. */
@media (max-width: 1000px) {
  .contact-hero::before { width: 100%; }
}

.contact-hero h1 {
  position: relative;
  margin: 0 0 7px;
  padding: 0 24px;
  color: #fff;
  font-family: var(--font-body);
  font-size: clamp(34px, 5.7vw, 56px);
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
}

/* Photo and card share one grid cell; the card's margins place it against the
   live page's 980px canvas (left 457, top 240 below the photo). */
.hero-body {
  position: relative;
  display: grid;
  max-width: 1028px;
  margin: 0 auto;
  padding: 0 24px;
}
.hero-photo,
.form-card { grid-area: 1 / 1; align-self: start; }

.hero-photo { width: 51.12%; margin: 0 0 0 12.96%; }
.hero-photo img { display: block; width: 100%; aspect-ratio: 501 / 397; object-fit: cover; }

/* ---- Form card ---------------------------------------------------------- */
.form-card {
  width: 47.14%;
  margin-left: 46.63%;
  margin-top: 24.49%;
  padding: 41px 41px 63px;
  background: #fff;
}

.field { display: block; }
/* Row spacing only between stacked fields — not the two inside .field-row. */
form > .field + .field,
.field-row + .field { margin-top: 20px; }
.field > span {
  display: block;
  margin-bottom: 9px;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 300;
  line-height: 1;
}
.field em { font-style: normal; }

.field input,
.field textarea {
  display: block;
  width: 100%;
  border: 1px solid #000;
  border-radius: 0;
  background: #fff;
  color: #000;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 300;
}
.field input { height: 37px; padding: 3px 3px 3px 10px; }
.field textarea { height: 86px; padding: 10px; resize: vertical; }
.field input:focus,
.field textarea:focus { outline: 1px solid #000; outline-offset: -2px; }

.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

.form-actions { margin-top: 24px; text-align: right; }
.form-actions button {
  width: 139px;
  height: 36px;
  border: 0;
  border-radius: 0;
  background: #0057e1;
  color: #fff;
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}
.form-actions button:hover { background: #0049bd; }

.form-sent { padding: 24px 0; text-align: center; }
.sent-title { margin: 0 0 8px; font-family: var(--font-body); font-size: 20px; line-height: 1.4; }
.sent-note { margin: 0; font-family: var(--font-body); font-size: 16px; color: #555; }

/* ---- Contact details ---------------------------------------------------- */
/* Columns mirror the live canvas: a 37px indent, the heading to 333, then the
   two content columns at 333 and 693. */
.contact-details {
  display: grid;
  grid-template-columns: 3.78% 30.2% 36.73% 23.47%;
  column-gap: 0;
  row-gap: 52px;
  max-width: 1028px;
  margin: 0 auto;
  padding: 87px 24px 90px;
}
.detail:nth-of-type(odd) { grid-column: 3; }
.detail:nth-of-type(even) { grid-column: 4; }
.contact-details h2 {
  grid-column: 2;
  grid-row: 1 / span 2;
  /* The live page sets the heading 12px above the first row's cap line. */
  margin: -12px 0 0;
  font-family: var(--font-body);
  font-size: clamp(30px, 3.9vw, 38px);
  font-weight: 700;
  line-height: 1.4;
}
.detail h3 {
  margin: 0 0 10px;
  font-family: var(--font-body);
  font-size: 20px;
  font-weight: 400;
  line-height: 1.4;
}
.detail p {
  margin: 0;
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.8125;
}
.detail a { color: #000; text-decoration: underline; }
.detail a:hover { color: #555; }

.detail-social a { display: inline-block; margin-left: -5px; text-decoration: none; }
.detail-social svg { display: block; width: 23px; height: 23px; }

/* ---- Narrow ------------------------------------------------------------- */
@media (max-width: 760px) {
  .contact-hero { padding-top: 56px; }
  .contact-hero::before { height: calc(100% - 40px); }

  .hero-body { display: block; }
  .hero-photo { width: 100%; margin: 0; }
  .form-card { width: 100%; margin: 24px 0 0; padding: 28px 24px 40px; }

  .field-row { grid-template-columns: 1fr; }

  .contact-details { grid-template-columns: 1fr; row-gap: 36px; padding: 48px 24px 56px; }
  .contact-details h2 { grid-column: 1; grid-row: auto; margin: 0; }
  .detail:nth-of-type(odd),
  .detail:nth-of-type(even) { grid-column: 1; }
}
</style>
