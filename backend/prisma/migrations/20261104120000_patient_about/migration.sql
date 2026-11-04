-- "Sobre mim" do paciente (DEC-081): três campos opcionais, um registro por conta. A terapeuta com
-- vínculo ativo só lê; mudanças entram no "Para ler" dela (marca de leitura com aboutId).
-- AlterTable
ALTER TABLE "ReadMark" ADD COLUMN     "aboutId" UUID;

-- CreateTable
CREATE TABLE "PatientAbout" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "aboutMe" TEXT,
    "goals" TEXT,
    "habits" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAbout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientAbout_userId_key" ON "PatientAbout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadMark_therapistId_aboutId_key" ON "ReadMark"("therapistId", "aboutId");

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_aboutId_fkey" FOREIGN KEY ("aboutId") REFERENCES "PatientAbout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAbout" ADD CONSTRAINT "PatientAbout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-081). Cada
-- campo, quando existe, tem de 1 a 2000 caracteres; pelo menos um vem preenchido (salvar tudo vazio
-- apaga o registro, em vez de guardar uma linha vazia).
ALTER TABLE "PatientAbout" ADD CONSTRAINT "PatientAbout_text_length_check" CHECK (
  ("aboutMe" IS NULL OR char_length("aboutMe") BETWEEN 1 AND 2000)
  AND ("goals" IS NULL OR char_length("goals") BETWEEN 1 AND 2000)
  AND ("habits" IS NULL OR char_length("habits") BETWEEN 1 AND 2000)
  AND num_nonnulls("aboutMe", "goals", "habits") >= 1
);

-- A marca de leitura continua apontando para exatamente um registro, agora com o "Sobre mim".
ALTER TABLE "ReadMark" DROP CONSTRAINT "ReadMark_one_record_check";
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_one_record_check" CHECK (
  num_nonnulls("thoughtRecordId", "tensionEpisodeId", "actionId", "aboutId") = 1
);
