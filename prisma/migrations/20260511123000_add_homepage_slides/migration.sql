-- CreateTable
CREATE TABLE "public"."HomepageSlide" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "mobileImageUrl" TEXT,
    "headline" TEXT,
    "subheadline" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomepageSlide_active_sortOrder_idx" ON "public"."HomepageSlide"("active", "sortOrder");
