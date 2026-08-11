-- Editable About Us page content (hero copy, journey milestones with images,
-- founders/team portraits), managed from the internal workspace.
ALTER TABLE "SiteConfig" ADD COLUMN "aboutContent" JSONB;
