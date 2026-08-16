-- AlterTable
ALTER TABLE "PeerLoan" ADD COLUMN "fromPersonalTxId" TEXT;
ALTER TABLE "PeerLoan" ADD COLUMN "toPersonalTxId" TEXT;

-- AlterTable
ALTER TABLE "LoanRepayment" ADD COLUMN "fromPersonalTxId" TEXT;
ALTER TABLE "LoanRepayment" ADD COLUMN "toPersonalTxId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PeerLoan_fromPersonalTxId_key" ON "PeerLoan"("fromPersonalTxId");
CREATE UNIQUE INDEX "PeerLoan_toPersonalTxId_key" ON "PeerLoan"("toPersonalTxId");
CREATE UNIQUE INDEX "LoanRepayment_fromPersonalTxId_key" ON "LoanRepayment"("fromPersonalTxId");
CREATE UNIQUE INDEX "LoanRepayment_toPersonalTxId_key" ON "LoanRepayment"("toPersonalTxId");

-- AddForeignKey
ALTER TABLE "PeerLoan" ADD CONSTRAINT "PeerLoan_fromPersonalTxId_fkey" FOREIGN KEY ("fromPersonalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "PeerLoan" ADD CONSTRAINT "PeerLoan_toPersonalTxId_fkey" FOREIGN KEY ("toPersonalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_fromPersonalTxId_fkey" FOREIGN KEY ("fromPersonalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_toPersonalTxId_fkey" FOREIGN KEY ("toPersonalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE ON DELETE SET NULL;
