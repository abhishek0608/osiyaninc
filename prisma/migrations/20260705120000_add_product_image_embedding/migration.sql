-- Per-photo IMAGE embeddings (Bedrock Titan multimodal, 1024 dims).
-- Product.embedding (1536, text space) stays for chat/text search; this table
-- powers Google-Lens-style visual search by comparing photos to photos.
CREATE TABLE IF NOT EXISTS "ProductImageEmbedding" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImageEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductImageEmbedding_productId_imageKey_key"
  ON "ProductImageEmbedding"("productId", "imageKey");

ALTER TABLE "ProductImageEmbedding"
  ADD CONSTRAINT "ProductImageEmbedding_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- IVFFlat cosine index; lists = 10 is fine for < 1000 products (matches the
-- Product.embedding index convention).
CREATE INDEX IF NOT EXISTS "product_image_embedding_cosine_idx"
  ON "ProductImageEmbedding" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 10);
