-- AlterEnum
ALTER TYPE "SharedArea" ADD VALUE 'ACTIVITY_PHOTOS';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "photosDeadlineAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActivityPhoto" (
    "id" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "image" BYTEA NOT NULL,
    "thumbnail" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityPhoto_activityId_createdAt_idx" ON "ActivityPhoto"("activityId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityPhoto" ADD CONSTRAINT "ActivityPhoto_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (DEC-103): as atividades já concluídas não guardavam quando. O updatedAt delas é a
-- melhor aproximação, porque concluída é final e só mudava na conclusão (como na Ação, DEC-064).
UPDATE "Activity" SET "completedAt" = "updatedAt" WHERE "status" = 'CONCLUIDA' AND "completedAt" IS NULL;

-- Escrito à mão (o Prisma não gera CHECK): só a concluída tem data de conclusão.
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_completedAt_check" CHECK (
  "completedAt" IS NULL OR "status" = 'CONCLUIDA'
);
