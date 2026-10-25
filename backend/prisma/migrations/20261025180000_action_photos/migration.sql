-- AlterTable
ALTER TABLE "BehavioralAction" ADD COLUMN     "evaluatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActionPhoto" (
    "id" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "image" BYTEA NOT NULL,
    "thumbnail" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionPhoto_actionId_createdAt_idx" ON "ActionPhoto"("actionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActionPhoto" ADD CONSTRAINT "ActionPhoto_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "BehavioralAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Escrito à mão (DEC-064): as ações já avaliadas não guardavam quando. O updatedAt delas é a
-- melhor aproximação, porque avaliada é final e só mudava na avaliação.
UPDATE "BehavioralAction" SET "evaluatedAt" = "updatedAt" WHERE "status" = 'AVALIADA' AND "evaluatedAt" IS NULL;
