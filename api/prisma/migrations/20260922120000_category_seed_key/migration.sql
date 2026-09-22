-- AlterTable
ALTER TABLE "Category" ADD COLUMN "seedKey" TEXT;
ALTER TABLE "Category" ADD COLUMN "isUserManaged" BOOLEAN NOT NULL DEFAULT false;

-- Backfill seedKey for known English names (personal + house defaults).
UPDATE "Category"
SET "seedKey" = "name"
WHERE "seedKey" IS NULL;

-- Unique on seed identity (Postgres allows multiple NULLs).
CREATE UNIQUE INDEX "Category_householdId_seedKey_kind_key"
ON "Category"("householdId", "seedKey", "kind");
