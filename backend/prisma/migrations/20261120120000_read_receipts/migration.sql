-- "Lido" para o paciente (DEC-117): o pedido do paciente e a resposta da profissional, por vínculo.
-- AlterTable
ALTER TABLE "TherapistLink" ADD COLUMN     "readReceiptsNotNowAt" TIMESTAMP(3),
ADD COLUMN     "readReceiptsRequestedAt" TIMESTAMP(3),
ADD COLUMN     "readReceiptsSharedAt" TIMESTAMP(3);

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do service (DEC-117).
-- A profissional só ativa ou diz "Agora não" depois do pedido, e nunca as duas coisas ao mesmo tempo.
ALTER TABLE "TherapistLink" ADD CONSTRAINT "TherapistLink_read_receipts_check" CHECK (
  ("readReceiptsSharedAt" IS NULL AND "readReceiptsNotNowAt" IS NULL)
  OR ("readReceiptsRequestedAt" IS NOT NULL
      AND ("readReceiptsSharedAt" IS NULL OR "readReceiptsNotNowAt" IS NULL))
);
