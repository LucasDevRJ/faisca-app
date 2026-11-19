-- CreateEnum
CREATE TYPE "MedicationChangeKind" AS ENUM ('COMECOU', 'MUDOU_DOSE', 'PAROU');

-- AlterEnum
ALTER TYPE "SharedArea" ADD VALUE 'MEDICATIONS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "listsMedications" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Medication" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationChange" (
    "id" UUID NOT NULL,
    "medicationId" UUID NOT NULL,
    "kind" "MedicationChangeKind" NOT NULL,
    "changeDate" DATE NOT NULL,
    "dose" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Symptom" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "startedOn" DATE NOT NULL,
    "endedOn" DATE,
    "medicationId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Symptom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomCheck" (
    "id" UUID NOT NULL,
    "symptomId" UUID NOT NULL,
    "checkedOn" DATE NOT NULL,
    "intensity" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymptomCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Medication_userId_idx" ON "Medication"("userId");

-- CreateIndex
CREATE INDEX "MedicationChange_medicationId_changeDate_idx" ON "MedicationChange"("medicationId", "changeDate");

-- CreateIndex
CREATE INDEX "Symptom_userId_idx" ON "Symptom"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SymptomCheck_symptomId_checkedOn_key" ON "SymptomCheck"("symptomId", "checkedOn");

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationChange" ADD CONSTRAINT "MedicationChange_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symptom" ADD CONSTRAINT "Symptom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symptom" ADD CONSTRAINT "Symptom_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomCheck" ADD CONSTRAINT "SymptomCheck_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "Symptom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-114).
-- Textos com o tamanho do Zod (sem só espaços), datas a partir de 1950, a dose só fora do PAROU,
-- o fim do sintoma depois do começo e a intensidade de 0 a 10.
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_values_check" CHECK (
  char_length(btrim("name")) BETWEEN 1 AND 60
  AND ("schedule" IS NULL OR char_length(btrim("schedule")) BETWEEN 1 AND 40)
);
ALTER TABLE "MedicationChange" ADD CONSTRAINT "MedicationChange_values_check" CHECK (
  "changeDate" >= DATE '1950-01-01'
  AND ("dose" IS NULL OR char_length(btrim("dose")) BETWEEN 1 AND 40)
  AND ("kind" <> 'PAROU' OR "dose" IS NULL)
  AND ("note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 200)
);
ALTER TABLE "Symptom" ADD CONSTRAINT "Symptom_values_check" CHECK (
  char_length(btrim("description")) BETWEEN 1 AND 80
  AND "startedOn" >= DATE '1950-01-01'
  AND ("endedOn" IS NULL OR "endedOn" >= "startedOn")
  AND ("note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 500)
);
ALTER TABLE "SymptomCheck" ADD CONSTRAINT "SymptomCheck_intensity_check" CHECK (
  "intensity" BETWEEN 0 AND 10
);
