-- CreateTable
CREATE TABLE "public"."StoneSize" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoneSize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoneSize_value_key" ON "public"."StoneSize"("value");

-- CreateIndex
CREATE INDEX "StoneSize_active_sortOrder_idx" ON "public"."StoneSize"("active", "sortOrder");
