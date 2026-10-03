-- AlterTable
ALTER TABLE "User" ADD COLUMN "nameAr" TEXT NOT NULL DEFAULT '';

-- Backfill known family members: keep Arabic in nameAr, set English in name.
UPDATE "User" SET "nameAr" = 'أشرف', "name" = 'Ashraf' WHERE "name" = 'أشرف' OR "email" = 'ashraf@family.local';
UPDATE "User" SET "nameAr" = 'توتي', "name" = 'Toty' WHERE "name" = 'توتي' OR "email" = 'toty@family.local';
UPDATE "User" SET "nameAr" = 'خالد', "name" = 'Khaled' WHERE "name" = 'خالد' OR "email" = 'khaled@family.local';
UPDATE "User" SET "nameAr" = 'كريم', "name" = 'Kareem' WHERE "name" = 'كريم' OR "email" = 'kareem@family.local';
UPDATE "User" SET "nameAr" = 'روان', "name" = 'Rawan' WHERE "name" = 'روان' OR "email" = 'rawan@family.local';
UPDATE "User" SET "nameAr" = 'نور', "name" = 'Noor' WHERE "name" = 'نور' OR "email" = 'noor@family.local';

-- Refresh personal book titles that embedded the old Arabic given name.
UPDATE "Household" SET "name" = 'فلوس Ashraf' WHERE "name" = 'فلوس أشرف' AND "kind" = 'PERSONAL';
UPDATE "Household" SET "name" = 'فلوس Toty' WHERE "name" = 'فلوس توتي' AND "kind" = 'PERSONAL';
UPDATE "Household" SET "name" = 'فلوس Khaled' WHERE "name" = 'فلوس خالد' AND "kind" = 'PERSONAL';
UPDATE "Household" SET "name" = 'فلوس Kareem' WHERE "name" = 'فلوس كريم' AND "kind" = 'PERSONAL';
UPDATE "Household" SET "name" = 'فلوس Rawan' WHERE "name" = 'فلوس روان' AND "kind" = 'PERSONAL';
UPDATE "Household" SET "name" = 'فلوس Noor' WHERE "name" = 'فلوس نور' AND "kind" = 'PERSONAL';
