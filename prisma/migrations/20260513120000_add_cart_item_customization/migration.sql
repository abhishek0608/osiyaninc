ALTER TABLE "public"."CartItem"
ADD COLUMN "customization" JSONB;

DROP INDEX IF EXISTS "public"."CartItem_cartId_variantId_key";

CREATE INDEX "CartItem_cartId_variantId_idx" ON "public"."CartItem"("cartId", "variantId");
