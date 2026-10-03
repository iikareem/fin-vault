-- Allow closing a travel early without rewriting its planned end date
ALTER TABLE "Travel" ADD COLUMN "endedAt" TIMESTAMP(3);
