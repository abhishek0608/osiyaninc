<script setup lang="ts">
// A duplicate of osiyaninc.com/privacy-policy: the purple-to-peach gradient
// banner, then the policy on white. Copy is verbatim from the live page, so
// this view is deliberately static — see TermsView.vue for the sibling page
// built the same way.
//
// Measurements come from the live page's 980px canvas: 18px/1.8em body copy,
// 20px bold section headings, and a 32.4px text indent on the lists. The live
// page has no margins at all — its rhythm comes from blank Wix lines, one 36px
// line above each heading and one 32.4px line below it — which the collapsing
// margins below reproduce.
//
// Two deliberate differences from the live page, both measured rather than
// assumed: body copy here is left-aligned (the live privacy page is, even
// though the live terms page justifies), and the ~107px of blank Wix lines
// trailing the closing sentence is ordinary bottom padding instead.
type PolicyItem = string | { before: string; email: string; after: string }
type PolicySection = { heading: string; items: PolicyItem[] }

const intro =
  'At Osiyan, we are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy outlines how we collect, use, disclose, and safeguard your data when you use our website or engage with our services. By accessing Osiyan\'s website or using our services, you agree to the terms outlined in this Privacy Policy. These Terms and Conditions, along with privacy policy or other terms (“Terms”) constitute a binding agreement by and between GRACE JEWELS PRIVATE LIMITED, ( “Website Owner” or “we” or “us” or “our”) and you (“you” or “your”) and relate to your use of our website, goods (as applicable) or services (as applicable) (collectively, “Services”).'

const sections: PolicySection[] = [
  {
    heading: 'Information We Collect',
    items: [
      'We collect personal information that you provide to us, including but not limited to your name, contact details, billing and shipping addresses, and payment information.',
      'We also collect non-personal information such as your IP address for analytical purposes to enhance our website and services and diagnose any technical issue that may arise.',
      'We may also analyze demographic and profile data to better understand user activity on our website.',
    ],
  },
  {
    heading: 'How We Use Your Information',
    items: [
      'Order Processing: We use your personal information to process and fulfill your orders, communicate order updates, and provide customer support.',
      'Marketing and Communication: With your consent, we may send you promotional materials, newsletters, and updates about our products and services. You can opt-out of these communications at any time.',
      'Analytics: We utilize non-personal information for statistical analysis, website improvement, and to enhance the user experience.',
    ],
  },
  {
    heading: 'Information Sharing',
    items: [
      'We may share your information with trusted third-party service providers for purposes such as payment processing, shipping, maintenance, analysis, audit, marketing, and development. These providers are obligated to protect your information and are granted limited access to your information solely for the purpose of carrying out tasks on discretion of Osiyan.',
      'When using our application, you will be required to acknowledge and accept the third-party developer user agreement as well as the Osiyan\'s privacy policy',
      'Legal Compliance: We may disclose your information if required by law, legal process, or governmental request to comply with legal requirements, respond to mandatory legal processes, verify, or enforce compliance with our service policies, or safeguard the rights, property, or safety of Osiyan, our affiliates, business partners, or customers. These disclosures are made in accordance with applicable laws and regulations, with the utmost priority given to protecting your privacy.',
      'Business Transfers: In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity.',
    ],
  },
  {
    heading: 'Data Security',
    items: [
      'We implement industry-standard security measures to protect your information from unauthorized access, disclosure, alteration, and destruction.',
    ],
  },
  {
    heading: 'Cookies and Tracking Technologies',
    items: [
      'We use cookies and similar technologies to enhance your browsing experience, analyze website traffic, and personalize content. You can manage your cookie preferences through your browser settings.',
    ],
  },
  {
    heading: 'Your Choices',
    items: [
      {
        before:
          'You have the right to access, update, or delete your personal information. You can also opt-out of marketing communications. Contact us at [',
        email: 'support@osiyanjewels.com',
        after: '] for assistance.',
      },
    ],
  },
  {
    heading: 'Changes to the Privacy Policy',
    items: [
      'We reserve the right to update and modify this Privacy Policy. Any changes will be effective immediately upon posting the revised policy on our website.',
    ],
  },
  {
    heading: 'Contact Us',
    items: [
      {
        before:
          'If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us at ',
        email: 'rg@gracejewels.in',
        after: '',
      },
    ],
  },
]

const closing =
  'By using our website and services, you acknowledge that you have read and understood this Privacy Policy and agree to its terms.'
</script>

<template>
  <article class="policy-page">
    <header class="policy-banner">
      <h1>Privacy Policy</h1>
    </header>

    <section class="policy-copy">
      <p>{{ intro }}</p>

      <template v-for="section in sections" :key="section.heading">
        <h2>{{ section.heading }}</h2>
        <ul>
          <li v-for="(item, i) in section.items" :key="i">
            <template v-if="typeof item === 'string'">{{ item }}</template>
            <template v-else
              >{{ item.before }}<a :href="`mailto:${item.email}`">{{ item.email }}</a
              >{{ item.after }}</template
            >
          </li>
        </ul>
      </template>

      <p>{{ closing }}</p>
    </section>
  </article>
</template>

<style scoped>
.policy-page { background: #fff; color: #000; }

/* Banner — the live page's 90deg aubergine-to-blush gradient, 69px above the
   title and 70px below it. Matches TermsView.vue. */
.policy-banner {
  padding: 69px 24px 70px;
  background: linear-gradient(90deg, #6b5569 0%, #f9c5b4 100%);
  text-align: center;
}
.policy-banner h1 {
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
.policy-copy {
  max-width: 1028px;
  margin: 0 auto;
  padding: 42px 24px 90px;
  font-family: var(--font-body);
  font-size: 18px;
  line-height: 1.8;
}
.policy-copy p { margin: 0 0 32px; }
.policy-copy p:last-child { margin-bottom: 0; }

/* Headings carry the taller of the two live gaps as a top margin so it
   collapses with the preceding block's 32px and lands on the live page's 36px
   above each heading, 32px below it. */
.policy-copy h2 {
  margin: 36px 0 32px;
  font-family: inherit;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.8;
}

/* The live list sits 9px in with a further 23.4px on each item; folding both
   into the padding puts the text at the same 32.4px and keeps the markers
   inside the box. */
.policy-copy ul { margin: 0 0 32px; padding-left: 32.4px; list-style: disc; }
.policy-copy li { margin: 0; }

.policy-copy a { color: inherit; text-decoration: none; }
.policy-copy a:hover { text-decoration: underline; }

@media (max-width: 760px) {
  .policy-banner { padding: 44px 24px 46px; }
  .policy-copy { padding: 36px 24px 56px; font-size: 16px; }
  .policy-copy p, .policy-copy ul { margin-bottom: 26px; }
  .policy-copy h2 { margin: 30px 0 26px; font-size: 18px; }
}
</style>
