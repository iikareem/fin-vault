-- CreateTable
CREATE TABLE "SubscriptionSkip" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionSkip_subscriptionId_idx" ON "SubscriptionSkip"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionSkip_subscriptionId_periodKey_key" ON "SubscriptionSkip"("subscriptionId", "periodKey");

-- AddForeignKey
ALTER TABLE "SubscriptionSkip" ADD CONSTRAINT "SubscriptionSkip_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
