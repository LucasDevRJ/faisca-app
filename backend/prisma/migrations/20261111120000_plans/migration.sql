-- AlterTable
ALTER TABLE "ReadMark" ADD COLUMN     "planEntryId" UUID;

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "questions" TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEntry" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entryDate" DATE NOT NULL,
    "entryTime" TIME(0),
    "questions" TEXT[],
    "answers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plan_userId_idx" ON "Plan"("userId");

-- CreateIndex
CREATE INDEX "PlanEntry_planId_entryDate_idx" ON "PlanEntry"("planId", "entryDate");

-- CreateIndex
CREATE INDEX "PlanEntry_userId_idx" ON "PlanEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadMark_therapistId_planEntryId_key" ON "ReadMark"("therapistId", "planEntryId");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_planEntryId_fkey" FOREIGN KEY ("planEntryId") REFERENCES "PlanEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-094).

-- Cada texto de uma lista tem o tamanho certo. CHECK não aceita subconsulta; uma função imutável
-- que só olha a própria lista, sim. search_path vazio: ninguém troca o char_length por outro.
CREATE FUNCTION "texts_length_between"(texts TEXT[], min_length INTEGER, max_length INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(bool_and(pg_catalog.char_length(t) BETWEEN min_length AND max_length), true)
  FROM pg_catalog.unnest(texts) AS t
$$;

-- Plano: nome de 1 a 120 caracteres; de 1 a 10 perguntas, cada uma com 1 a 200, sem NULL.
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_title_length_check" CHECK (
  char_length("title") BETWEEN 1 AND 120
);
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_questions_check" CHECK (
  cardinality("questions") BETWEEN 1 AND 10
  AND array_position("questions", NULL) IS NULL
  AND "texts_length_between"("questions", 1, 200)
);

-- Registro: a cópia das perguntas segue as regras do plano; uma resposta por pergunta, cada uma
-- com até 5000 caracteres ('' = não respondida), e pelo menos uma com texto.
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_answers_check" CHECK (
  cardinality("questions") BETWEEN 1 AND 10
  AND array_position("questions", NULL) IS NULL
  AND "texts_length_between"("questions", 1, 200)
  AND cardinality("answers") = cardinality("questions")
  AND array_position("answers", NULL) IS NULL
  AND "texts_length_between"("answers", 0, 5000)
  AND char_length(array_to_string("answers", '')) > 0
);

-- A marca de leitura continua apontando para exatamente um registro, agora com o Meus Planos.
ALTER TABLE "ReadMark" DROP CONSTRAINT "ReadMark_one_record_check";
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_one_record_check" CHECK (
  num_nonnulls("thoughtRecordId", "tensionEpisodeId", "actionId", "aboutId", "planEntryId") = 1
);
