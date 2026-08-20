-- CreateEnum
CREATE TYPE "public"."MemoStatus" AS ENUM ('ISSUED', 'PARTIAL', 'CONVERTED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MemoItemStatus" AS ENUM ('OUT', 'RETURNED', 'CONVERTED');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "canMemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "memoLimitPaise" INTEGER,
ADD COLUMN     "memoDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "public"."Memo" (
    "id" TEXT NOT NULL,
    "memoNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "public"."MemoStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "subtotalPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "shipTo" JSONB,
    "notes" TEXT,
    "orderId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemoItem" (
    "id" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "convertedQty" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."MemoItemStatus" NOT NULL DEFAULT 'OUT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Memo_memoNo_key" ON "public"."Memo"("memoNo");

-- CreateIndex
CREATE UNIQUE INDEX "Memo_orderId_key" ON "public"."Memo"("orderId");

-- CreateIndex
CREATE INDEX "Memo_customerId_status_idx" ON "public"."Memo"("customerId", "status");

-- CreateIndex
CREATE INDEX "Memo_status_dueDate_idx" ON "public"."Memo"("status", "dueDate");

-- CreateIndex
CREATE INDEX "MemoItem_memoId_idx" ON "public"."MemoItem"("memoId");

-- AddForeignKey
ALTER TABLE "public"."Memo" ADD CONSTRAINT "Memo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Memo" ADD CONSTRAINT "Memo_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemoItem" ADD CONSTRAINT "MemoItem_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "public"."Memo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemoItem" ADD CONSTRAINT "MemoItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The app reaches these tables only through server-side Prisma; deny direct
-- anon/authenticated access through the Supabase Data API (see
-- 20260812153000_enable_rls_public_tables).
ALTER TABLE "public"."Memo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MemoItem" ENABLE ROW LEVEL SECURITY;
