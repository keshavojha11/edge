-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "venueMarketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcomesJson" TEXT NOT NULL,
    "closeTime" TIMESTAMP(3),
    "liquidity" DOUBLE PRECISION,
    "isPlayMoney" BOOLEAN NOT NULL DEFAULT false,
    "runId" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchGroup" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "marketIds" TEXT NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL,
    "notedDifferences" TEXT NOT NULL,
    "maxSpread" DOUBLE PRECISION NOT NULL,
    "realMoneySpread" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "runId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watch" (
    "id" TEXT NOT NULL,
    "matchGroupId" TEXT NOT NULL,
    "thresholdPct" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSpread" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestJob" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "wireJobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Market_venue_idx" ON "Market"("venue");

-- CreateIndex
CREATE INDEX "Market_snapshotAt_idx" ON "Market"("snapshotAt");

-- CreateIndex
CREATE INDEX "Market_runId_idx" ON "Market"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_venue_venueMarketId_key" ON "Market"("venue", "venueMarketId");

-- CreateIndex
CREATE INDEX "MatchGroup_realMoneySpread_idx" ON "MatchGroup"("realMoneySpread");

-- CreateIndex
CREATE INDEX "MatchGroup_maxSpread_idx" ON "MatchGroup"("maxSpread");

-- CreateIndex
CREATE INDEX "MatchGroup_runId_idx" ON "MatchGroup"("runId");

-- CreateIndex
CREATE INDEX "Watch_status_idx" ON "Watch"("status");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE INDEX "IngestJob_runId_idx" ON "IngestJob"("runId");

-- CreateIndex
CREATE INDEX "IngestJob_status_idx" ON "IngestJob"("status");

-- AddForeignKey
ALTER TABLE "Watch" ADD CONSTRAINT "Watch_matchGroupId_fkey" FOREIGN KEY ("matchGroupId") REFERENCES "MatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestJob" ADD CONSTRAINT "IngestJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
