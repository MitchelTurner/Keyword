-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "keywordDifficulty" DOUBLE PRECISION,
ADD COLUMN     "strategyBrief" JSONB,
ADD COLUMN     "strategyGeneratedAt" TIMESTAMP(3);
