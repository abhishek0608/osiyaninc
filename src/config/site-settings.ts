/**
 * Site-wide toggles (e.g. B2B vs consumer). Flip flags when you launch reviews/offers.
 */
export const SITE_SETTINGS = {
  /** Ratings, review counts, testimonial blocks, and product review lists */
  enableReviews: false,
  /** Promo offers, coupons, offer hero banner, and “Available offers” on PDP */
  enableOffers: false,
} as const
