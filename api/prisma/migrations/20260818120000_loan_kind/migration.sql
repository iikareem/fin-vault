-- CreateEnum
CREATE TYPE "LoanKind" AS ENUM ('TRACK_ONLY', 'CASH');

-- AlterTable
ALTER TABLE "PeerLoan" ADD COLUMN "kind" "LoanKind" NOT NULL DEFAULT 'TRACK_ONLY';

-- Existing loans were all recorded with personal cash movement.
UPDATE "PeerLoan" SET "kind" = 'CASH';
