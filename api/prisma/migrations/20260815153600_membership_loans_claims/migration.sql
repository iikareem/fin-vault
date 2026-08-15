-- CreateEnum
CREATE TYPE "HouseholdKind" AS ENUM ('PERSONAL', 'HOUSE');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('OPEN', 'SETTLED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'PARTIAL', 'REIMBURSED');

-- AlterEnum
ALTER TYPE "CategoryKind" ADD VALUE 'PEER';
ALTER TYPE "TxType" ADD VALUE 'REIMBURSEMENT';

-- AlterTable
ALTER TABLE "Household" ADD COLUMN "kind" "HouseholdKind" NOT NULL DEFAULT 'HOUSE';

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- Backfill house memberships from current users
INSERT INTO "Membership" ("id", "userId", "householdId", "role", "createdAt")
SELECT "id" || '_m', "id", "householdId", "role", "createdAt" FROM "User";

-- Personal household per user
INSERT INTO "Household" ("id", "name", "currency", "kind", "createdAt")
SELECT "id" || '_p', "name" || '''s money', 'USD', 'PERSONAL', CURRENT_TIMESTAMP FROM "User";

INSERT INTO "Membership" ("id", "userId", "householdId", "role", "createdAt")
SELECT "id" || '_pm', "id", "id" || '_p', 'ADMIN', CURRENT_TIMESTAMP FROM "User";

INSERT INTO "Account" ("id", "householdId", "name", "type", "openingBalance", "archived")
SELECT "id" || '_ac', "id" || '_p', 'Cash', 'CASH', 0, false FROM "User";

INSERT INTO "Category" ("id", "householdId", "name", "kind", "color")
SELECT "id" || '_cs', "id" || '_p', 'Salary', 'INCOME', '#15803d' FROM "User";

INSERT INTO "Category" ("id", "householdId", "name", "kind", "color")
SELECT "id" || '_co', "id" || '_p', 'Other', 'EXPENSE', '#64748b' FROM "User";

-- Drop old user household link
ALTER TABLE "User" DROP CONSTRAINT "User_householdId_fkey";
DROP INDEX IF EXISTS "User_email_key";
ALTER TABLE "User" DROP COLUMN "householdId";
ALTER TABLE "User" DROP COLUMN "role";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_householdId_key" ON "Membership"("userId", "householdId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PeerLoan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "occurredOn" DATE NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerLoan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseClaim" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reimbursement" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reimbursement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Reimbursement_transactionId_key" ON "Reimbursement"("transactionId");

ALTER TABLE "PeerLoan" ADD CONSTRAINT "PeerLoan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeerLoan" ADD CONSTRAINT "PeerLoan_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeerLoan" ADD CONSTRAINT "PeerLoan_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeerLoan" ADD CONSTRAINT "PeerLoan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "PeerLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HouseClaim" ADD CONSTRAINT "HouseClaim_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HouseClaim" ADD CONSTRAINT "HouseClaim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HouseClaim" ADD CONSTRAINT "HouseClaim_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "HouseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Category" ("id", "householdId", "name", "kind", "color")
SELECT "id" || '_payback', "id", 'Member payback', 'EXPENSE', '#44403c'
FROM "Household" WHERE "kind" = 'HOUSE'
ON CONFLICT ("householdId", "name", "kind") DO NOTHING;
