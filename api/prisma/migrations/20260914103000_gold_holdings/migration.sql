-- CreateEnum
CREATE TYPE "GoldKarat" AS ENUM ('K18', 'K21', 'K24');

-- CreateTable
CREATE TABLE "GoldHolding" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grams" DECIMAL(14,3) NOT NULL,
    "karat" "GoldKarat" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "acquiredOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldHolding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoldHolding_householdId_idx" ON "GoldHolding"("householdId");

-- CreateIndex
CREATE INDEX "GoldHolding_userId_idx" ON "GoldHolding"("userId");

-- AddForeignKey
ALTER TABLE "GoldHolding" ADD CONSTRAINT "GoldHolding_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldHolding" ADD CONSTRAINT "GoldHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
