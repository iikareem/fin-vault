-- Dual month ceilings: personal (day-to-day) + total (incl. commitments).
ALTER TABLE "MonthSoftLimit" ADD COLUMN "personalAmount" DECIMAL(14,2);
ALTER TABLE "MonthSoftLimit" ADD COLUMN "totalAmount" DECIMAL(14,2);

UPDATE "MonthSoftLimit"
SET "personalAmount" = "amount"
WHERE "mode" = 'PERSONAL';

UPDATE "MonthSoftLimit"
SET "totalAmount" = "amount"
WHERE "mode" = 'ALL';

ALTER TABLE "MonthSoftLimit" DROP COLUMN "amount";
ALTER TABLE "MonthSoftLimit" DROP COLUMN "mode";

DROP TYPE "SoftLimitMode";
