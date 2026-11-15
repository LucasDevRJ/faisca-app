-- CreateEnum
CREATE TYPE "TaskResponseStatus" AS ENUM ('RESPONDIDA', 'NAO_CONSEGUI', 'NAO_FAZ_SENTIDO');

-- AlterEnum
ALTER TYPE "SharedArea" ADD VALUE 'TASKS';

-- AlterTable
ALTER TABLE "ReadMark" ADD COLUMN     "taskId" UUID;

-- CreateTable
CREATE TABLE "HomeworkTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "agreedLinkId" UUID,
    "responseStatus" "TaskResponseStatus",
    "responseText" TEXT,
    "respondedAt" TIMESTAMP(3),
    "responseDeadlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeworkTask_userId_createdAt_idx" ON "HomeworkTask"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReadMark_therapistId_taskId_key" ON "ReadMark"("therapistId", "taskId");

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HomeworkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkTask" ADD CONSTRAINT "HomeworkTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkTask" ADD CONSTRAINT "HomeworkTask_agreedLinkId_fkey" FOREIGN KEY ("agreedLinkId") REFERENCES "TherapistLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Segunda linha de defesa dos limites do Zod (DEC-103).
ALTER TABLE "HomeworkTask" ADD CONSTRAINT "HomeworkTask_text_check" CHECK (
  ("title" IS NULL OR char_length(btrim("title")) BETWEEN 1 AND 120)
  AND char_length(btrim("description")) BETWEEN 1 AND 5000
  AND ("responseText" IS NULL OR char_length(btrim("responseText")) BETWEEN 1 AND 10000)
);
ALTER TABLE "HomeworkTask" ADD CONSTRAINT "HomeworkTask_response_check" CHECK (
  ("responseStatus" IS NULL AND "respondedAt" IS NULL AND "responseText" IS NULL AND "responseDeadlineAt" IS NULL)
  OR ("responseStatus" IS NOT NULL AND "respondedAt" IS NOT NULL
      AND ("responseStatus" <> 'RESPONDIDA' OR "responseText" IS NOT NULL))
);
ALTER TABLE "ReadMark" DROP CONSTRAINT "ReadMark_one_record_check";
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_one_record_check" CHECK (
  num_nonnulls("thoughtRecordId", "tensionEpisodeId", "actionId", "aboutId", "planEntryId", "taskId") = 1
);
