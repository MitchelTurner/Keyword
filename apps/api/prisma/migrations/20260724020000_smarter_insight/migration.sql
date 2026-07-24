-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "decisionSnapshot" JSONB,
ADD COLUMN     "previousSnapshot" JSONB,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'none';

-- CreateIndex
CREATE INDEX "Opportunity_outcome_idx" ON "Opportunity"("outcome");
