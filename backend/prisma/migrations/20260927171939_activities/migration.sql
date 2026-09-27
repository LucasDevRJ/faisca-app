-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PLANEJADA', 'PENDENTE', 'CONCLUIDA', 'NAO_REALIZADA');

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "activityDate" DATE NOT NULL,
    "status" "ActivityStatus" NOT NULL,
    "wantBefore" INTEGER,
    "pleasure" INTEGER,
    "achievement" INTEGER,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_userId_activityDate_idx" ON "Activity"("userId", "activityDate");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-028).

-- Notas inteiras de 0 a 10 (SPEC, Atividades > Regras).
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_scores_range_check" CHECK (
  ("wantBefore" IS NULL OR "wantBefore" BETWEEN 0 AND 10)
  AND ("pleasure" IS NULL OR "pleasure" BETWEEN 0 AND 10)
  AND ("achievement" IS NULL OR "achievement" BETWEEN 0 AND 10)
);

-- Tamanhos dos textos: nome de 1 a 100 caracteres; observação até 1000.
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_text_length_check" CHECK (
  char_length("name") BETWEEN 1 AND 100
  AND ("observation" IS NULL OR char_length("observation") <= 1000)
);

-- Campos exigidos por estado (tabela de estados da SPEC):
-- PLANEJADA sem notas; PENDENTE com vontade; CONCLUIDA com vontade, prazer e realização;
-- NAO_REALIZADA sem prazer e realização (a vontade fica, se veio de PENDENTE).
-- A observação só existe nos estados finais.
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_fields_by_status_check" CHECK (
  CASE "status"
    WHEN 'PLANEJADA' THEN "wantBefore" IS NULL AND "pleasure" IS NULL
      AND "achievement" IS NULL AND "observation" IS NULL
    WHEN 'PENDENTE' THEN "wantBefore" IS NOT NULL AND "pleasure" IS NULL
      AND "achievement" IS NULL AND "observation" IS NULL
    WHEN 'CONCLUIDA' THEN "wantBefore" IS NOT NULL AND "pleasure" IS NOT NULL
      AND "achievement" IS NOT NULL
    WHEN 'NAO_REALIZADA' THEN "pleasure" IS NULL AND "achievement" IS NULL
  END
);
