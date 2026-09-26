-- CreateEnum
CREATE TYPE "SubscriptionKind" AS ENUM ('SUBSCRIPTION', 'INSTALLMENT', 'CHARITY', 'OTHER');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "kind" "SubscriptionKind" NOT NULL DEFAULT 'SUBSCRIPTION';
ALTER TABLE "Subscription" ADD COLUMN "totalInstallments" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "installmentsPaid" INTEGER NOT NULL DEFAULT 0;
