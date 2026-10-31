-- CreateTable
CREATE TABLE "TherapistNotice" (
    "id" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeSeen" (
    "noticeId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeSeen_pkey" PRIMARY KEY ("noticeId","patientId")
);

-- CreateIndex
CREATE INDEX "TherapistNotice_therapistId_createdAt_idx" ON "TherapistNotice"("therapistId", "createdAt");

-- CreateIndex
CREATE INDEX "NoticeSeen_patientId_idx" ON "NoticeSeen"("patientId");

-- AddForeignKey
ALTER TABLE "TherapistNotice" ADD CONSTRAINT "TherapistNotice_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeSeen" ADD CONSTRAINT "NoticeSeen_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "TherapistNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeSeen" ADD CONSTRAINT "NoticeSeen_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-079).
ALTER TABLE "TherapistNotice" ADD CONSTRAINT "TherapistNotice_body_check" CHECK (
  char_length("body") BETWEEN 1 AND 2000
);
