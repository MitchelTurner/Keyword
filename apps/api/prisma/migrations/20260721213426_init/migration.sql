-- CreateEnum
CREATE TYPE "NicheStatus" AS ENUM ('PENDING', 'EXPANDING', 'ENRICHING', 'CLASSIFYING', 'SCORING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Niche" (
    "id" TEXT NOT NULL,
    "seedTerm" TEXT NOT NULL,
    "status" "NicheStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "convRate" DOUBLE PRECISION NOT NULL DEFAULT 0.015,
    "ltvCacRatio" DOUBLE PRECISION NOT NULL DEFAULT 3.0,

    CONSTRAINT "Niche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "searchVolume" INTEGER,
    "cpc" DOUBLE PRECISION,
    "competition" DOUBLE PRECISION,
    "monthlyTrend" JSONB,
    "raw" JSONB,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "productDescription" TEXT NOT NULL,
    "buyerType" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "painSeverity" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "totalVolume" INTEGER NOT NULL,
    "avgCpc" DOUBLE PRECISION NOT NULL,
    "avgCompetition" DOUBLE PRECISION NOT NULL,
    "impliedCac" DOUBLE PRECISION NOT NULL,
    "annualPriceFloor" DOUBLE PRECISION NOT NULL,
    "monthlyPriceFloor" DOUBLE PRECISION NOT NULL,
    "demandScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCostLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "nicheId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCostLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Keyword_nicheId_idx" ON "Keyword"("nicheId");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_nicheId_term_key" ON "Keyword"("nicheId", "term");

-- CreateIndex
CREATE INDEX "Opportunity_nicheId_idx" ON "Opportunity"("nicheId");

-- CreateIndex
CREATE INDEX "ApiCostLog_nicheId_idx" ON "ApiCostLog"("nicheId");

-- CreateIndex
CREATE INDEX "ApiCostLog_createdAt_idx" ON "ApiCostLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;
