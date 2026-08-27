<script setup lang="ts">
// A duplicate of osiyaninc.com/terms-conditions: the purple-to-peach gradient
// banner, then the terms on white. Copy is verbatim from the live page, so this
// view is deliberately static — see AboutView.vue for the same approach.
//
// Measurements come from the live page's 980px canvas: 18px/1.8em body copy,
// one blank line between paragraphs, and a 32.4px text indent on the list. The
// live page also leaves ~590px of empty Wix canvas below the closing line; this
// uses ordinary bottom padding instead.
const intro = [
  'These Terms and Conditions, along with privacy policy or other terms (“Terms”) constitute a binding agreement by and between GRACE JEWELS PRIVATE LIMITED, ( “Website Owner” or “we” or “us” or “our”) and you (“you” or “your”) and relate to your use of our website, goods (as applicable) or services (as applicable) (collectively, “Services”).',
  'By using our website and availing the Services, you agree that you have read and accepted these Terms (including the Privacy Policy). We reserve the right to modify these Terms at any time and without assigning any reason. It is your responsibility to periodically review these Terms to stay informed of updates.',
  'The use of this website or availing of our Services is subject to the following terms of use:',
]

const terms = [
  'To access and use the Services, you agree to provide true, accurate and complete information to us during and after registration, and you shall be responsible for all acts done through the use of your registered account.',
  'Neither we nor any third parties provide any warranty or guarantee as to the accuracy, timeliness, performance, completeness or suitability of the information and materials offered on this website or through the Services, for any specific purpose. You acknowledge that such information and materials may contain inaccuracies or errors and we expressly exclude liability for any such inaccuracies or errors to the fullest extent permitted by law.',
  'Your use of our Services and the website is solely at your own risk and discretion. You are required to independently assess and ensure that the Services meet your requirements.',
  'The contents of the Website and the Services are proprietary to Us and you will not have any authority to claim any intellectual property rights, title, or interest in its contents.',
  'You acknowledge that unauthorized use of the Website or the Services may lead to action against you as per these Terms or applicable laws.',
  'You agree to pay us the charges associated with availing the Services.',
  'You agree not to use the website and/ or Services for any purpose that is unlawful, illegal or forbidden by these Terms, or Indian or local laws that might apply to you.',
  'You agree and acknowledge that website and the Services may contain links to other third party websites. On accessing these links, you will be governed by the terms of use, privacy policy and such other policies of such third party websites. You understand that upon initiating a transaction for availing the Services you are entering into a legally binding and enforceable contract with the us for the Services.',
  'You shall be entitled to claim a refund of the payment made by you in case we are not able to provide the Service. The timelines for such return and refund will be according to the specific Service you have availed or within the time period provided in our policies (as applicable). In case you do not raise a refund claim within the stipulated time, than this would make you ineligible for a refund.',
  'Notwithstanding anything contained in these Terms, the parties shall not be liable for any failure to perform an obligation under these Terms if performance is prevented or delayed by a force majeure event.',
  'These Terms and any dispute or claim relating to it, or its enforceability, shall be governed by and construed in accordance with the laws of India.',
  'All disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts in MUMBAI, Maharashtra',
  'All concerns or communications relating to these Terms must be communicated to us using the contact information provided on this website.',
]
</script>

<template>
  <article class="terms-page">
    <header class="terms-banner">
      <h1>Terms &amp; Conditions</h1>
    </header>

    <section class="terms-copy">
      <p v-for="(paragraph, i) in intro" :key="i">{{ paragraph }}</p>

      <ul>
        <li v-for="(term, i) in terms" :key="i">{{ term }}</li>
      </ul>

      <div class="terms-closing">
        <p>
          For any questions or concerns regarding our Terms &amp; Conditions, please contact our customer
          service team at <a href="mailto:rg@gracejewels.in">rg@gracejewels.in</a>
        </p>
        <p>
          We appreciate your trust in Osiyan, and we are committed to ensuring your satisfaction with our
          products and services.
        </p>
        <p>Thank you for choosing us for your jewelry needs!</p>
      </div>
    </section>
  </article>
</template>

<style scoped>
.terms-page { background: #fff; color: #000; }

/* Banner — the live page's 90deg aubergine-to-blush gradient, 69px above the
   title and 70px below it. The live title sits in a fixed 567px Wix box that
   leaves it 20px left of centre; centring it instead survives narrow viewports
   and reads the same. */
.terms-banner {
  padding: 69px 24px 70px;
  background: linear-gradient(90deg, #6b5569 0%, #f9c5b4 100%);
  text-align: center;
}
.terms-banner h1 {
  margin: 0;
  color: #fff;
  font-family: 'Cormorant Garamond', Garamond, 'Times New Roman', Times, serif;
  font-size: clamp(34px, 5.5vw, 59px);
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0.05em;
}

/* The width carries the 24px gutter on top of the live page's 980px text
   column, so the copy still measures 980px at full size. */
.terms-copy {
  max-width: 1028px;
  margin: 0 auto;
  padding: 42px 24px 90px;
  font-family: var(--font-body);
  font-size: 18px;
  line-height: 1.8;
}
.terms-copy p { margin: 0 0 32.4px; text-align: justify; }

/* The live list sits 9px in with a further 23.4px on each item; folding both
   into the padding puts the text at the same 32.4px and keeps the markers
   inside the box. */
.terms-copy ul { margin: 0 0 32.4px; padding-left: 32.4px; list-style: disc; }
.terms-copy li { margin: 0; }

.terms-closing { text-align: left; }
.terms-closing p { margin: 0; text-align: left; }
.terms-closing a { color: inherit; text-decoration: none; }
.terms-closing a:hover { text-decoration: underline; }

@media (max-width: 760px) {
  .terms-banner { padding: 44px 24px 46px; }
  .terms-copy { padding: 36px 24px 56px; font-size: 16px; }
  .terms-copy p, .terms-copy ul { margin-bottom: 26px; }
  /* Justifying a ~40-character line opens rivers, so narrow screens set ragged
     right instead. The live page never faces this — its canvas is 980px wide. */
  .terms-copy p { text-align: left; }
}
</style>
