-- CreateEnum
CREATE TYPE "ActionCategory" AS ENUM ('PRAZER', 'CONEXAO', 'REALIZACAO');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANEJADA', 'AVALIADA', 'NAO_REALIZADA');

-- CreateTable
CREATE TABLE "BehavioralAction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "actionDate" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ActionCategory" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANEJADA',
    "expectation" INTEGER NOT NULL,
    "pleasure" INTEGER,
    "achievement" INTEGER,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BehavioralAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BehavioralAction_userId_actionDate_idx" ON "BehavioralAction"("userId", "actionDate");

-- AddForeignKey
ALTER TABLE "BehavioralAction" ADD CONSTRAINT "BehavioralAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-051).

-- Notas de 0 a 10.
ALTER TABLE "BehavioralAction" ADD CONSTRAINT "BehavioralAction_scores_range_check" CHECK (
  "expectation" BETWEEN 0 AND 10
  AND ("pleasure" IS NULL OR "pleasure" BETWEEN 0 AND 10)
  AND ("achievement" IS NULL OR "achievement" BETWEEN 0 AND 10)
);

-- Cada estado com os campos dele: a avaliada tem prazer e realização; as outras, não. A planejada
-- ainda não tem observação.
ALTER TABLE "BehavioralAction" ADD CONSTRAINT "BehavioralAction_status_fields_check" CHECK (
  ("status" = 'AVALIADA' AND "pleasure" IS NOT NULL AND "achievement" IS NOT NULL)
  OR ("status" = 'NAO_REALIZADA' AND "pleasure" IS NULL AND "achievement" IS NULL)
  OR ("status" = 'PLANEJADA' AND "pleasure" IS NULL AND "achievement" IS NULL AND "observation" IS NULL)
);

-- Nome de 1 a 100 caracteres e observação de até 1000, como nas atividades.
ALTER TABLE "BehavioralAction" ADD CONSTRAINT "BehavioralAction_text_length_check" CHECK (
  char_length("name") BETWEEN 1 AND 100
  AND ("observation" IS NULL OR char_length("observation") <= 1000)
);
