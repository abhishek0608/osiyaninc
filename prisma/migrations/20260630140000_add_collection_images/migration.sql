-- Add per-collection tile images for the homepage "Shop by Collection" grid.
-- Stored as a JSON map of collection slug -> image URL.
ALTER TABLE "SiteConfig" ADD COLUMN "collectionImages" JSONB;
