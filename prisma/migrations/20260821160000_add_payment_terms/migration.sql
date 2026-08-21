-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "canPayTerms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsLimitPaise" INTEGER,
ADD COLUMN     "termsDays" INTEGER NOT NULL DEFAULT 30;
