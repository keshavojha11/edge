-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venue" TEXT NOT NULL,
    "venueMarketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcomesJson" TEXT NOT NULL,
    "closeTime" DATETIME,
    "liquidity" REAL,
    "snapshotAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MatchGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "marketIds" TEXT NOT NULL,
    "matchConfidence" REAL NOT NULL,
    "notedDifferences" TEXT NOT NULL,
    "maxSpread" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Watch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchGroupId" TEXT NOT NULL,
    "thresholdPct" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSpread" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Watch_matchGroupId_fkey" FOREIGN KEY ("matchGroupId") REFERENCES "MatchGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Market_venue_idx" ON "Market"("venue");

-- CreateIndex
CREATE INDEX "Market_snapshotAt_idx" ON "Market"("snapshotAt");

-- CreateIndex
CREATE UNIQUE INDEX "Market_venue_venueMarketId_key" ON "Market"("venue", "venueMarketId");

-- CreateIndex
CREATE INDEX "MatchGroup_maxSpread_idx" ON "MatchGroup"("maxSpread");

-- CreateIndex
CREATE INDEX "Watch_status_idx" ON "Watch"("status");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");
