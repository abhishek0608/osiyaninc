-- Company name and tax ID are no longer asked for as required on the sign-up
-- form, so blanks are stored as NULL. NULL keeps them out of the tax-ID match
-- that links an approved user to an existing CompanyAccount, which an empty
-- string would otherwise collide on.
ALTER TABLE "public"."SignupRequest" ALTER COLUMN "companyName" DROP NOT NULL;
ALTER TABLE "public"."SignupRequest" ALTER COLUMN "taxId" DROP NOT NULL;
