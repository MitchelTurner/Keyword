-- CreateTable
CREATE TABLE "TrackedSite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedKeyword" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'tracking',
    "parentId" TEXT,
    "searchVolume" INTEGER,
    "cpc" DOUBLE PRECISION,
    "competition" DOUBLE PRECISION,
    "monthlyTrend" JSONB,
    "raw" JSONB,
    "notes" TEXT NOT NULL DEFAULT '',
    "lastEnrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackedSite_createdAt_idx" ON "TrackedSite"("createdAt");

-- CreateIndex
CREATE INDEX "TrackedKeyword_siteId_idx" ON "TrackedKeyword"("siteId");

-- CreateIndex
CREATE INDEX "TrackedKeyword_status_idx" ON "TrackedKeyword"("status");

-- CreateIndex
CREATE INDEX "TrackedKeyword_parentId_idx" ON "TrackedKeyword"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedKeyword_siteId_term_key" ON "TrackedKeyword"("siteId", "term");

-- AddForeignKey
ALTER TABLE "TrackedKeyword" ADD CONSTRAINT "TrackedKeyword_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "TrackedSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedKeyword" ADD CONSTRAINT "TrackedKeyword_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TrackedKeyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;
