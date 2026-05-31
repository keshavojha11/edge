-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venue" TEXT NOT NULL,
    "venueMarketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcomesJson" TEXT NOT NULL,
    "closeTime" DATETIME,
    "liquidity" REAL,
    "isPlayMoney" BOOLEAN NOT NULL DEFAULT false,
    "snapshotAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Market" ("closeTime", "createdAt", "id", "liquidity", "outcomesJson", "snapshotAt", "title", "updatedAt", "url", "venue", "venueMarketId") SELECT "closeTime", "createdAt", "id", "liquidity", "outcomesJson", "snapshotAt", "title", "updatedAt", "url", "venue", "venueMarketId" FROM "Market";
DROP TABLE "Market";
ALTER TABLE "new_Market" RENAME TO "Market";
CREATE INDEX "Market_venue_idx" ON "Market"("venue");
CREATE INDEX "Market_snapshotAt_idx" ON "Market"("snapshotAt");
CREATE UNIQUE INDEX "Market_venue_venueMarketId_key" ON "Market"("venue", "venueMarketId");
CREATE TABLE "new_MatchGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "marketIds" TEXT NOT NULL,
    "matchConfidence" REAL NOT NULL,
    "notedDifferences" TEXT NOT NULL,
    "maxSpread" REAL NOT NULL,
    "realMoneySpread" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MatchGroup" ("createdAt", "id", "label", "marketIds", "matchConfidence", "maxSpread", "notedDifferences", "updatedAt") SELECT "createdAt", "id", "label", "marketIds", "matchConfidence", "maxSpread", "notedDifferences", "updatedAt" FROM "MatchGroup";
DROP TABLE "MatchGroup";
ALTER TABLE "new_MatchGroup" RENAME TO "MatchGroup";
CREATE INDEX "MatchGroup_realMoneySpread_idx" ON "MatchGroup"("realMoneySpread");
CREATE INDEX "MatchGroup_maxSpread_idx" ON "MatchGroup"("maxSpread");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
