-- Sign-ups are US-only: the form no longer asks for a country and the API
-- stores 'US', so the column default follows. Existing rows are left alone —
-- there are none in production yet, and any that exist record what was entered.
ALTER TABLE "public"."SignupRequest" ALTER COLUMN "country" SET DEFAULT 'US';
