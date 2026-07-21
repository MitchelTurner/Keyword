-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'none';

-- CreateIndex
CREATE INDEX "Keyword_term_idx" ON "Keyword"("term");

-- CreateIndex
CREATE INDEX "Opportunity_pinned_idx" ON "Opportunity"("pinned");
