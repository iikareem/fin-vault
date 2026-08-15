-- CreateTable
CREATE TABLE "CharityType" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0f766e',
    "monthlyGoal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CharityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharityGift" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "personalTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharityGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharityType_householdId_name_key" ON "CharityType"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CharityGift_personalTxId_key" ON "CharityGift"("personalTxId");

-- CreateIndex
CREATE INDEX "CharityGift_householdId_occurredOn_idx" ON "CharityGift"("householdId", "occurredOn");

-- CreateIndex
CREATE INDEX "CharityGift_typeId_idx" ON "CharityGift"("typeId");

-- AddForeignKey
ALTER TABLE "CharityType" ADD CONSTRAINT "CharityType_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharityGift" ADD CONSTRAINT "CharityGift_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CharityGift" ADD CONSTRAINT "CharityGift_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "CharityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CharityGift" ADD CONSTRAINT "CharityGift_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON UPDATE CASCADE;

ALTER TABLE "CharityGift" ADD CONSTRAINT "CharityGift_personalTxId_fkey" FOREIGN KEY ("personalTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;
