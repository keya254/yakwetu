-- CreateTable
CREATE TABLE "event_outbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_outbox_publishedAt_createdAt_idx" ON "event_outbox"("publishedAt", "createdAt");
