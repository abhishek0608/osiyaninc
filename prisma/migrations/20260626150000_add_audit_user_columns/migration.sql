-- Track which user created / last modified each internal record.
-- Nullable so existing rows remain valid; populated going forward by the APIs.
ALTER TABLE "public"."Product" ADD COLUMN "createdById" TEXT;
ALTER TABLE "public"."Product" ADD COLUMN "updatedById" TEXT;

ALTER TABLE "public"."HomepageSlide" ADD COLUMN "createdById" TEXT;
ALTER TABLE "public"."HomepageSlide" ADD COLUMN "updatedById" TEXT;

ALTER TABLE "public"."Order" ADD COLUMN "createdById" TEXT;
ALTER TABLE "public"."Order" ADD COLUMN "updatedById" TEXT;

ALTER TABLE "public"."User" ADD COLUMN "createdById" TEXT;
ALTER TABLE "public"."User" ADD COLUMN "updatedById" TEXT;

ALTER TABLE "public"."Quote" ADD COLUMN "createdById" TEXT;
ALTER TABLE "public"."Quote" ADD COLUMN "updatedById" TEXT;
