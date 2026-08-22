-- Storefront checkout writes real orders, so an Order now carries the same
-- ship-to snapshot a Memo does, plus the payment-terms details when the
-- customer settled on terms instead of paying at checkout.
ALTER TABLE "Order" ADD COLUMN "shipTo" JSONB;
ALTER TABLE "Order" ADD COLUMN "termsDays" INTEGER;
ALTER TABLE "Order" ADD COLUMN "termsDueDate" TIMESTAMP(3);

-- Payment webhooks are looked up by the gateway's own reference, and the same
-- event can be delivered repeatedly, so that lookup needs an index.
CREATE INDEX "Payment_provider_providerRef_idx" ON "Payment"("provider", "providerRef");
