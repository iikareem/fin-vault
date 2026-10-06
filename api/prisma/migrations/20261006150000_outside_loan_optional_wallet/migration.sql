-- Allow outside loans / collections without a wallet transaction (track-only).
ALTER TABLE "OutsideLoan" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "OutsideLoan" ALTER COLUMN "lendTxId" DROP NOT NULL;

ALTER TABLE "OutsideLoanCollection" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "OutsideLoanCollection" ALTER COLUMN "collectTxId" DROP NOT NULL;
