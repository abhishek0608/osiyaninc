-- Add password reset token fields to User
ALTER TABLE "public"."User" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "public"."User" ADD COLUMN "resetTokenExpiry" TIMESTAMP(3);
