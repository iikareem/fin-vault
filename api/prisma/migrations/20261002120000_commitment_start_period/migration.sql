-- First budget period (YYYY-MM) when the commitment becomes due.
ALTER TABLE "Subscription" ADD COLUMN "startPeriodKey" TEXT;

-- Backfill from createdAt calendar month (good enough for existing rows).
UPDATE "Subscription"
SET "startPeriodKey" = to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE "startPeriodKey" IS NULL;

ALTER TABLE "Subscription" ALTER COLUMN "startPeriodKey" SET NOT NULL;
