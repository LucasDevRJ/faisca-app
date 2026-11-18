-- Sono, humor e remédio (DEC-107, #188 e #171).

-- CreateEnum
CREATE TYPE "MedicationTaken" AS ENUM ('TOMOU', 'ESQUECEU_ALGUM', 'NAO_TOMOU');

-- AlterEnum
ALTER TYPE "SharedArea" ADD VALUE 'SLEEP_MOOD';
ALTER TYPE "SharedArea" ADD VALUE 'MEDICATION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tracksMedication" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DailyCheckIn" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "checkInDate" DATE NOT NULL,
    "bedTime" TIME(0),
    "wakeTime" TIME(0),
    "sleepQuality" SMALLINT,
    "mood" SMALLINT,
    "moodWord" TEXT,
    "medication" "MedicationTaken",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCheckIn_userId_checkInDate_key" ON "DailyCheckIn"("userId", "checkInDate");

-- AddForeignKey
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-107).
-- Notas de 0 a 10, a palavra do dia com até 40 caracteres, os dois horários juntos e diferentes, e
-- pelo menos uma resposta no registro.
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_values_check" CHECK (
  ("sleepQuality" IS NULL OR "sleepQuality" BETWEEN 0 AND 10)
  AND ("mood" IS NULL OR "mood" BETWEEN 0 AND 10)
  AND ("moodWord" IS NULL OR char_length(btrim("moodWord")) BETWEEN 1 AND 40)
  AND (("bedTime" IS NULL) = ("wakeTime" IS NULL))
  AND ("bedTime" IS NULL OR "bedTime" <> "wakeTime")
);
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_not_empty_check" CHECK (
  num_nonnulls("bedTime", "sleepQuality", "mood", "moodWord", "medication") >= 1
);
