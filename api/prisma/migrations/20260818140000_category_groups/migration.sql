-- AlterTable
ALTER TABLE "Category" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Category_householdId_parentId_idx" ON "Category"("householdId", "parentId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;