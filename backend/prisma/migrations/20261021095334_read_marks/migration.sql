-- CreateTable
CREATE TABLE "ReadMark" (
    "id" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "thoughtRecordId" UUID,
    "tensionEpisodeId" UUID,
    "actionId" UUID,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadMark_therapistId_patientId_idx" ON "ReadMark"("therapistId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadMark_therapistId_thoughtRecordId_key" ON "ReadMark"("therapistId", "thoughtRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadMark_therapistId_tensionEpisodeId_key" ON "ReadMark"("therapistId", "tensionEpisodeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadMark_therapistId_actionId_key" ON "ReadMark"("therapistId", "actionId");

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_thoughtRecordId_fkey" FOREIGN KEY ("thoughtRecordId") REFERENCES "ThoughtRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_tensionEpisodeId_fkey" FOREIGN KEY ("tensionEpisodeId") REFERENCES "TensionEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "BehavioralAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do service (DEC-057).

-- Cada marca aponta para exatamente um registro: um Pensamento, um Episódio de tensão ou uma Ação.
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_one_record_check" CHECK (
  num_nonnulls("thoughtRecordId", "tensionEpisodeId", "actionId") = 1
);

-- A terapeuta marca registros de outra pessoa, nunca os próprios.
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_not_self_check" CHECK ("therapistId" <> "patientId");
