-- Track how much of this period's surplus was auto-moved Current → Savings.
ALTER TABLE "MonthSoftLimit" ADD COLUMN IF NOT EXISTS "autoSweptAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0;
