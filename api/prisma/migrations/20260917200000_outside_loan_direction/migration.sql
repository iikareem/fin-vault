-- AlterEnum
CREATE TYPE "OutsideLoanDirection" AS ENUM ('LEND', 'BORROW');

-- AlterTable
ALTER TABLE "OutsideLoan" ADD COLUMN "direction" "OutsideLoanDirection" NOT NULL DEFAULT 'LEND';

-- CreateIndex
CREATE INDEX "OutsideLoan_householdId_direction_status_idx" ON "OutsideLoan"("householdId", "direction", "status");
