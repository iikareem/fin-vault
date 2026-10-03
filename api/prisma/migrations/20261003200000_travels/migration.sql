-- Personal travel envelopes + optional link on transactions
CREATE TABLE "Travel" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "softLimit" DECIMAL(14,2),
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Travel_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Transaction" ADD COLUMN "travelId" TEXT;

CREATE INDEX "Travel_householdId_startsOn_endsOn_idx" ON "Travel"("householdId", "startsOn", "endsOn");

CREATE INDEX "Transaction_travelId_idx" ON "Transaction"("travelId");

ALTER TABLE "Travel" ADD CONSTRAINT "Travel_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_travelId_fkey" FOREIGN KEY ("travelId") REFERENCES "Travel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
