-- CreateTable
CREATE TABLE "OutsideLoan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "occurredOn" DATE NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'OPEN',
    "accountId" TEXT NOT NULL,
    "lendTxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutsideLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutsideLoanCollection" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "accountId" TEXT NOT NULL,
    "collectTxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutsideLoanCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutsideLoan_lendTxId_key" ON "OutsideLoan"("lendTxId");

-- CreateIndex
CREATE INDEX "OutsideLoan_householdId_status_idx" ON "OutsideLoan"("householdId", "status");

-- CreateIndex
CREATE INDEX "OutsideLoan_userId_idx" ON "OutsideLoan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OutsideLoanCollection_collectTxId_key" ON "OutsideLoanCollection"("collectTxId");

-- CreateIndex
CREATE INDEX "OutsideLoanCollection_loanId_idx" ON "OutsideLoanCollection"("loanId");

-- AddForeignKey
ALTER TABLE "OutsideLoan" ADD CONSTRAINT "OutsideLoan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideLoan" ADD CONSTRAINT "OutsideLoan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideLoan" ADD CONSTRAINT "OutsideLoan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideLoan" ADD CONSTRAINT "OutsideLoan_lendTxId_fkey" FOREIGN KEY ("lendTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideLoanCollection" ADD CONSTRAINT "OutsideLoanCollection_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "OutsideLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideLoanCollection" ADD CONSTRAINT "OutsideLoanCollection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideLoanCollection" ADD CONSTRAINT "OutsideLoanCollection_collectTxId_fkey" FOREIGN KEY ("collectTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;
