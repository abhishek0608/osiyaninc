-- CreateEnum
CREATE TYPE "public"."SignupRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "public"."SignupRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "public"."SignupRequestStatus" NOT NULL DEFAULT 'PENDING',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "passwordHash" TEXT NOT NULL,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupRequest_reference_key" ON "public"."SignupRequest"("reference");

-- CreateIndex
CREATE INDEX "SignupRequest_status_createdAt_idx" ON "public"."SignupRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SignupRequest_email_idx" ON "public"."SignupRequest"("email");

-- The app reaches this table only through server-side Prisma; deny direct
-- anon/authenticated access through the Supabase Data API (see
-- 20260812153000_enable_rls_public_tables).
ALTER TABLE "public"."SignupRequest" ENABLE ROW LEVEL SECURITY;
