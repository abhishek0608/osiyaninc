-- Supabase exposes the public schema through its Data API. The application
-- accesses these tables only through server-side Prisma, so enable RLS without
-- public policies to deny direct anon/authenticated access by default.
ALTER TABLE "public"."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProductImageEmbedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."HomepageSlide" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StoneSize" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SiteConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PriceBook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PriceBookItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WishlistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CompanyAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CompanyUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Shipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Quote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."QuoteItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ServiceRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
