-- CreateEnum
CREATE TYPE "public"."ServiceRequestStatus" AS ENUM ('NEW', 'REVIEWING', 'QUOTED');

-- CreateTable
CREATE TABLE "public"."ServiceRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceTitle" TEXT NOT NULL,
    "serviceNo" TEXT,
    "status" "public"."ServiceRequestStatus" NOT NULL DEFAULT 'NEW',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "rows" JSONB,
    "inspirationImageUrl" TEXT,
    "cadFileUrl" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_reference_key" ON "public"."ServiceRequest"("reference");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_createdAt_idx" ON "public"."ServiceRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_customerEmail_idx" ON "public"."ServiceRequest"("customerEmail");
