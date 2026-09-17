-- The packing list's COLLECTION column ("Jewel Garden", "Jade Forest", ...) used
-- to be folded into styleTags, which the storefront reads as a style facet
-- (bridal, minimal, ...). It gets its own column so the high-jewelry suite pages
-- can list every piece in a collection by name.
ALTER TABLE "Product" ADD COLUMN "collection" TEXT;

CREATE INDEX "Product_collection_idx" ON "Product"("collection");
