-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "serpSnapshot" JSONB,
ADD COLUMN     "serpQuery" TEXT,
ADD COLUMN     "serpFetchedAt" TIMESTAMP(3),
ADD COLUMN     "organicSoftness" DOUBLE PRECISION;
