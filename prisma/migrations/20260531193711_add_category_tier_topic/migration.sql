-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "MatchGroup" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE INDEX "Market_category_idx" ON "Market"("category");
