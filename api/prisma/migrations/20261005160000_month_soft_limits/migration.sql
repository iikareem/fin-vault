-- Soft spending limits per personal budget period (never blocks spend).
CREATE TYPE "SoftLimitMode" AS ENUM ('PERSONAL', 'ALL');

CREATE TABLE "MonthSoftLimit" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "SoftLimitMode" NOT NULL DEFAULT 'PERSONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthSoftLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthSoftLimit_householdId_periodKey_key" ON "MonthSoftLimit"("householdId", "periodKey");

CREATE INDEX "MonthSoftLimit_householdId_idx" ON "MonthSoftLimit"("householdId");

ALTER TABLE "MonthSoftLimit" ADD CONSTRAINT "MonthSoftLimit_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
