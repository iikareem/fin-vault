-- AlterTable
ALTER TABLE "PeerLoan" ADD COLUMN "recordedByUserId" TEXT;

-- Backfill: treat the lender as the recorder for old rows
UPDATE "PeerLoan" SET "recordedByUserId" = "fromUserId" WHERE "recordedByUserId" IS NULL;

-- AddForeignKey
ALTER TABLE "PeerLoan" ADD CONSTRAINT "PeerLoan_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
