-- CreateTable
CREATE TABLE "DfsPull" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT 'dfs_pull.py',
    "keywords" JSONB NOT NULL,
    "groups" JSONB NOT NULL,
    "markets" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DfsPull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DfsPull_createdAt_idx" ON "DfsPull"("createdAt");
