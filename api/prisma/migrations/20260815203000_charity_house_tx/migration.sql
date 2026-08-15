ALTER TABLE "CharityGift" ADD COLUMN "houseTxId" TEXT;

CREATE UNIQUE INDEX "CharityGift_houseTxId_key" ON "CharityGift"("houseTxId");

ALTER TABLE "CharityGift" ADD CONSTRAINT "CharityGift_houseTxId_fkey" FOREIGN KEY ("houseTxId") REFERENCES "Transaction"("id") ON UPDATE CASCADE;
