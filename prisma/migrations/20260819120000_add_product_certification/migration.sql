ALTER TABLE "public"."Product"
ADD COLUMN "certLab" TEXT,
ADD COLUMN "certNumber" TEXT,
ADD COLUMN "certFileUrl" TEXT,
ADD COLUMN "certFileKey" TEXT,
ADD COLUMN "certifiedAt" TIMESTAMP(3);
