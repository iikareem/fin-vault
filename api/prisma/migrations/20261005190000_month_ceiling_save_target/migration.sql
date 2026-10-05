-- Replace total-spend ceiling with a monthly save target.
ALTER TABLE "MonthSoftLimit" ADD COLUMN "saveTargetAmount" DECIMAL(14,2);

ALTER TABLE "MonthSoftLimit" DROP COLUMN IF EXISTS "totalAmount";
