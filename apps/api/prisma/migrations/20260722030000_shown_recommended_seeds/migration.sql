-- CreateTable
CREATE TABLE "ShownRecommendedSeed" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShownRecommendedSeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShownRecommendedSeed_term_key" ON "ShownRecommendedSeed"("term");

-- CreateIndex
CREATE INDEX "ShownRecommendedSeed_createdAt_idx" ON "ShownRecommendedSeed"("createdAt");
