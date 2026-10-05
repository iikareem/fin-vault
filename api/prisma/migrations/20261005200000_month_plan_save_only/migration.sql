-- Month plan: save target only (personal spend ceiling removed).
ALTER TABLE "MonthSoftLimit" DROP COLUMN IF EXISTS "personalAmount";
