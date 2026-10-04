-- CreateEnum
CREATE TYPE "AppointmentFrequency" AS ENUM ('SEMANAL', 'QUINZENAL');

-- CreateEnum
CREATE TYPE "ScheduleEndReason" AS ENUM ('MUDANCA', 'ENCERRAMENTO');

-- CreateEnum
CREATE TYPE "AppointmentExceptionType" AS ENUM ('DESMARCADA', 'REMARCADA');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "appointmentTime" TIME(0);

-- CreateTable
CREATE TABLE "AppointmentSchedule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "time" TIME(0) NOT NULL,
    "frequency" "AppointmentFrequency" NOT NULL,
    "endDate" DATE,
    "endReason" "ScheduleEndReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentException" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "originalDate" DATE NOT NULL,
    "type" "AppointmentExceptionType" NOT NULL,
    "newDate" DATE,
    "newTime" TIME(0),
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyPause" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "returnDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapyPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentSchedule_userId_idx" ON "AppointmentSchedule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentException_scheduleId_originalDate_key" ON "AppointmentException"("scheduleId", "originalDate");

-- CreateIndex
CREATE INDEX "TherapyPause_userId_idx" ON "TherapyPause"("userId");

-- AddForeignKey
ALTER TABLE "AppointmentSchedule" ADD CONSTRAINT "AppointmentSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentException" ADD CONSTRAINT "AppointmentException_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AppointmentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPause" ADD CONSTRAINT "TherapyPause_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Escrito à mão (o Prisma não gera índice parcial nem CHECK): segunda linha de defesa, além do
-- Zod e do service (DEC-045).

-- Uma regra em vigor por paciente.
CREATE UNIQUE INDEX "AppointmentSchedule_one_open_per_user_key" ON "AppointmentSchedule"("userId")
  WHERE "endDate" IS NULL;

-- A regra que terminou diz por quê, e só ela.
ALTER TABLE "AppointmentSchedule" ADD CONSTRAINT "AppointmentSchedule_end_check" CHECK (
  ("endDate" IS NULL) = ("endReason" IS NULL)
);

-- Remarcada tem novo dia e nova hora; desmarcada não tem nenhum dos dois.
ALTER TABLE "AppointmentException" ADD CONSTRAINT "AppointmentException_type_check" CHECK (
  ("type" = 'REMARCADA' AND "newDate" IS NOT NULL AND "newTime" IS NOT NULL)
  OR ("type" = 'DESMARCADA' AND "newDate" IS NULL AND "newTime" IS NULL)
);

-- Motivo de 1 a 500 caracteres.
ALTER TABLE "AppointmentException" ADD CONSTRAINT "AppointmentException_reason_length_check" CHECK (
  char_length("reason") BETWEEN 1 AND 500
);

-- A volta da pausa vem depois do início.
ALTER TABLE "TherapyPause" ADD CONSTRAINT "TherapyPause_return_check" CHECK (
  "returnDate" IS NULL OR "returnDate" > "startDate"
);
