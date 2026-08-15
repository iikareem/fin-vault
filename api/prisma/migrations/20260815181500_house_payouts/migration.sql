-- CreateTable
CREATE TABLE "HousePayout" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "houseTxId" TEXT NOT NULL,
    "personalTxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HousePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HousePayout_houseTxId_key" ON "HousePayout"("houseTxId");

-- CreateIndex
CREATE UNIQUE INDEX "HousePayout_personalTxId_key" ON "HousePayout"("personalTxId");

-- CreateIndex
CREATE INDEX "HousePayout_householdId_occurredOn_idx" ON "HousePayout"("householdId", "occurredOn");

-- AddForeignKey
ALTER TABLE "HousePayout" ADD CONSTRAINT "HousePayout_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HousePayout" ADD CONSTRAINT "HousePayout_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON UPDATE CASCADE;

ALTER TABLE "HousePayout" ADD CONSTRAINT "HousePayout_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON UPDATE CASCADE;

ALTER TABLE "HousePayout" ADD CONSTRAINT "HousePayout_houseTxId_fkey" FOREIGN KEY ("houseTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;

ALTER TABLE "HousePayout" ADD CONSTRAINT "HousePayout_personalTxId_fkey" FOREIGN KEY ("personalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;
