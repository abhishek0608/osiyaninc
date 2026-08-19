-- Supabase recommends keeping extensions outside the exposed public schema.
CREATE SCHEMA IF NOT EXISTS "extensions";
ALTER EXTENSION "vector" SET SCHEMA "extensions";
