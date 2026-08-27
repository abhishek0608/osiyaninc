<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="osiyan-footer">
    <section class="footer-about">
      <h2>About Us</h2>
      <RouterLink to="/about">Our Story</RouterLink>
      <RouterLink to="/contact">Contact Us</RouterLink>
      <RouterLink to="/terms-conditions">Terms &amp; Conditions</RouterLink>
      <RouterLink to="/about">Privacy Policy</RouterLink>
    </section>

    <RouterLink to="/" class="footer-logo" aria-label="Osiyan home">
      <img src="/osiyan-logo.png" alt="Osiyan" />
    </RouterLink>

    <section class="footer-contact">
      <h2>Contact</h2>
      <p>24x7 Enquiry support</p>
      <div class="contact-links">
        <a href="tel:+918779395590">Phone</a>
        <a href="mailto:info@osiyaninc.com?subject=Help!%20Assistance%20required">Mail</a>
        <a href="https://wa.me/+19174074075" target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
      <p>580 5th Avenue Suite 802<br />New York, NY 10036</p>
    </section>

    <p class="footer-copyright">© OSIYAN {{ year }}</p>
  </footer>
</template>

<style scoped>
.osiyan-footer { position: relative; min-height: 361px; padding: 62px clamp(35px, 7vw, 90px) 54px; display: grid; grid-template-columns: 1fr 1fr 1fr; background: #fff; color: #000; border-top: 1px solid #eee; }
.osiyan-footer section { display: flex; flex-direction: column; align-items: flex-start; }
.osiyan-footer h2 { margin: 0 0 21px; font-size: 23px; line-height: 1.25; font-weight: 700; }
.osiyan-footer a, .osiyan-footer p { color: inherit; text-decoration: none; font-size: 16px; line-height: 1.55; }
.footer-about a { margin-bottom: 7px; }
.footer-about a:hover, .footer-contact a:hover { color: #777; }
.footer-logo { align-self: start; justify-self: center; width: 90px; height: 90px; }
.footer-logo img { width: 100%; height: 100%; object-fit: contain; }
.footer-contact { justify-self: end; min-width: 285px; }
.footer-contact p { margin: 0 0 15px; }
.contact-links { display: flex; gap: 18px; margin-bottom: 17px; }
.footer-copyright { position: absolute; left: 50%; bottom: 28px; margin: 0; transform: translateX(-50%); font-size: 13px !important; }
@media (max-width: 760px) {
  .osiyan-footer { grid-template-columns: 1fr 1fr; gap: 50px 30px; padding: 55px 28px 85px; }
  .footer-logo { grid-column: 1 / -1; grid-row: 1; }
  .footer-contact { justify-self: start; min-width: 0; }
}
@media (max-width: 500px) {
  .osiyan-footer { grid-template-columns: 1fr; }
  .footer-logo { grid-column: 1; }
}
</style>
