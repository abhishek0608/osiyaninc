-- AlterTable
ALTER TABLE "public"."Memo" ADD COLUMN     "extensionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastExtendedAt" TIMESTAMP(3);
