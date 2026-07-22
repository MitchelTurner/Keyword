-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "productAngle" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "monetizationModel" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "wedge" TEXT;

-- CreateTable
CREATE TABLE "RejectedSeed" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectedSeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RejectedSeed_term_key" ON "RejectedSeed"("term");

-- CreateIndex
CREATE INDEX "RejectedSeed_createdAt_idx" ON "RejectedSeed"("createdAt");
