-- One-shot start-of-month sweep flag (stop mid-month Current drains).
ALTER TABLE "MonthSoftLimit" ADD COLUMN IF NOT EXISTS "autoSweepDone" BOOLEAN NOT NULL DEFAULT false;

-- Any plan that already auto-moved money is considered done (no further top-ups).
UPDATE "MonthSoftLimit" SET "autoSweepDone" = true WHERE "autoSweptAmount" > 0;
