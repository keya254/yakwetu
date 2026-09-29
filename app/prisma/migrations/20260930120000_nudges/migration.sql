-- CreateTable
CREATE TABLE "nudge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'first',
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "movieIds" TEXT[],
    "orderId" TEXT,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "revenueKes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nudge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nudge_userId_createdAt_idx" ON "nudge"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "nudge_orderId_idx" ON "nudge"("orderId");

