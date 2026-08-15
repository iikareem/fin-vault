-- AlterTable
ALTER TABLE "HouseClaim" ADD COLUMN "personalTxId" TEXT;

-- AlterTable
ALTER TABLE "Reimbursement" ADD COLUMN "personalTxId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "HouseClaim_personalTxId_key" ON "HouseClaim"("personalTxId");

-- CreateIndex
CREATE UNIQUE INDEX "Reimbursement_personalTxId_key" ON "Reimbursement"("personalTxId");

-- AddForeignKey
ALTER TABLE "HouseClaim" ADD CONSTRAINT "HouseClaim_personalTxId_fkey" FOREIGN KEY ("personalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;

ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_personalTxId_fkey" FOREIGN KEY ("personalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;
