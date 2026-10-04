-- AlterTable
ALTER TABLE "public"."MemoItem" ADD COLUMN     "returnRequestedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnRequestedAt" TIMESTAMP(3);
