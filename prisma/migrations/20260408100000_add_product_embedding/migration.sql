-- Enable pgvector extension (Supabase has this available)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dims = text-embedding-3-small)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- IVFFlat index for fast cosine similarity search
-- lists = 10 is fine for < 1000 products; increase to 100 when catalog grows past 10k
CREATE INDEX IF NOT EXISTS "product_embedding_cosine_idx"
  ON "Product" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 10);
