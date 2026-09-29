-- CreateEnum
CREATE TYPE "LinkMethod" AS ENUM ('INVITE', 'CODE');

-- CreateTable
CREATE TABLE "TherapistLink" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "method" "LinkMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "seenByPatientAt" TIMESTAMP(3),

    CONSTRAINT "TherapistLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkInvite" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "therapistEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "signupUserId" UUID,

    CONSTRAINT "LinkInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkCode" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkCodeAttempt" (
    "id" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkCodeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapistLink_patientId_idx" ON "TherapistLink"("patientId");

-- CreateIndex
CREATE INDEX "TherapistLink_therapistId_idx" ON "TherapistLink"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkInvite_tokenHash_key" ON "LinkInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "LinkInvite_patientId_idx" ON "LinkInvite"("patientId");

-- CreateIndex
CREATE INDEX "LinkInvite_signupUserId_idx" ON "LinkInvite"("signupUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkCode_codeHash_key" ON "LinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "LinkCode_patientId_idx" ON "LinkCode"("patientId");

-- CreateIndex
CREATE INDEX "LinkCodeAttempt_therapistId_createdAt_idx" ON "LinkCodeAttempt"("therapistId", "createdAt");

-- AddForeignKey
ALTER TABLE "TherapistLink" ADD CONSTRAINT "TherapistLink_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistLink" ADD CONSTRAINT "TherapistLink_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkInvite" ADD CONSTRAINT "LinkInvite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkInvite" ADD CONSTRAINT "LinkInvite_signupUserId_fkey" FOREIGN KEY ("signupUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkCode" ADD CONSTRAINT "LinkCode_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkCodeAttempt" ADD CONSTRAINT "LinkCodeAttempt_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escritos à mão (o Prisma não gera índice parcial nem CHECK). Valem mesmo com duas
-- requisições ao mesmo tempo, o que uma checagem só no código não garante (DEC-031).

-- No máximo uma terapeuta ativa por paciente (SPEC, "Vínculo").
CREATE UNIQUE INDEX "TherapistLink_one_active_per_patient"
  ON "TherapistLink"("patientId") WHERE "revokedAt" IS NULL;

-- Ninguém se vincula a si mesmo.
ALTER TABLE "TherapistLink" ADD CONSTRAINT "TherapistLink_not_self_check"
  CHECK ("patientId" <> "therapistId");

-- No máximo um convite pendente por paciente.
CREATE UNIQUE INDEX "LinkInvite_one_pending_per_patient"
  ON "LinkInvite"("patientId") WHERE "acceptedAt" IS NULL AND "canceledAt" IS NULL;

-- Um convite termina de um jeito só: aceito ou cancelado.
ALTER TABLE "LinkInvite" ADD CONSTRAINT "LinkInvite_single_outcome_check"
  CHECK ("acceptedAt" IS NULL OR "canceledAt" IS NULL);
