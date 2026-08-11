-- Add site-wide volume (quantity) discount configuration to SiteConfig.
ALTER TABLE "SiteConfig" ADD COLUMN "volumeDiscountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteConfig" ADD COLUMN "volumeDiscountTiers" JSONB;
