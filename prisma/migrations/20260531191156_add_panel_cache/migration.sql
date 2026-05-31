-- CreateTable
CREATE TABLE "PanelCache" (
    "key" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelCache_pkey" PRIMARY KEY ("key")
);
