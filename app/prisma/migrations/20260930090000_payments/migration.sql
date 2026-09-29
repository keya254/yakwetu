-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieIds" TEXT[],
    "subtotalKes" INTEGER NOT NULL,
    "discountKes" INTEGER NOT NULL DEFAULT 0,
    "totalKes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "nudgeId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "reference" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountKes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "channel" TEXT,
    "gatewayResponse" TEXT,
    "failureReason" TEXT,
    "paystackId" TEXT,
    "accessCode" TEXT,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("reference")
);

-- CreateTable
CREATE TABLE "payment_webhook" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "reference" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "payment_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement" (
    "userId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_pkey" PRIMARY KEY ("userId","movieId")
);

-- CreateIndex
CREATE INDEX "order_userId_createdAt_idx" ON "order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_status_createdAt_idx" ON "payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payment_orderId_idx" ON "payment"("orderId");

-- CreateIndex
CREATE INDEX "payment_userId_createdAt_idx" ON "payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_webhook_processedAt_receivedAt_idx" ON "payment_webhook"("processedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "entitlement_reference_idx" ON "entitlement"("reference");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

