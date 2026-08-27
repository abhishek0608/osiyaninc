-- A memo can be bought in instalments: the customer keeps two pieces now and
-- three next month, and each buyback bills its own order. Memo.orderId could
-- only ever hold the first of those, so the link moves to Order, where every
-- converted order carries the memo it came from.
ALTER TABLE "Order" ADD COLUMN "memoId" TEXT;

-- Existing links move across before the old column goes.
UPDATE "Order" AS o SET "memoId" = m."id" FROM "Memo" AS m WHERE m."orderId" = o."id";

ALTER TABLE "Memo" DROP CONSTRAINT IF EXISTS "Memo_orderId_fkey";
DROP INDEX IF EXISTS "Memo_orderId_key";
ALTER TABLE "Memo" DROP COLUMN "orderId";

CREATE INDEX "Order_memoId_idx" ON "Order"("memoId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
