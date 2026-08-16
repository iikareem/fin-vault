-- CreateEnum
CREATE TYPE "CoverStatus" AS ENUM ('OPEN', 'PARTIAL', 'SETTLED');

-- CreateTable
CREATE TABLE "HouseCover" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "CoverStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "houseTxId" TEXT NOT NULL,

    CONSTRAINT "HouseCover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverRepayment" (
    "id" TEXT NOT NULL,
    "coverId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "accountId" TEXT NOT NULL,
    "houseTxId" TEXT,
    "personalTxId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseCover_houseTxId_key" ON "HouseCover"("houseTxId");

-- CreateIndex
CREATE INDEX "HouseCover_householdId_occurredOn_idx" ON "HouseCover"("householdId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "CoverRepayment_houseTxId_key" ON "CoverRepayment"("houseTxId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverRepayment_personalTxId_key" ON "CoverRepayment"("personalTxId");

-- AddForeignKey
ALTER TABLE "HouseCover" ADD CONSTRAINT "HouseCover_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseCover" ADD CONSTRAINT "HouseCover_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseCover" ADD CONSTRAINT "HouseCover_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseCover" ADD CONSTRAINT "HouseCover_houseTxId_fkey" FOREIGN KEY ("houseTxId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverRepayment" ADD CONSTRAINT "CoverRepayment_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "HouseCover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverRepayment" ADD CONSTRAINT "CoverRepayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverRepayment" ADD CONSTRAINT "CoverRepayment_houseTxId_fkey" FOREIGN KEY ("houseTxId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverRepayment" ADD CONSTRAINT "CoverRepayment_personalTxId_fkey" FOREIGN KEY ("personalTxId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverRepayment" ADD CONSTRAINT "CoverRepayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
