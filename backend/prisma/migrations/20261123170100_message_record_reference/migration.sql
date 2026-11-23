-- Mensagens (DEC-128): referência ao registro do paciente e a opção da profissional.
ALTER TABLE "PrivateMessage" ADD COLUMN "recordType" "LinkedRecordType";
ALTER TABLE "PrivateMessage" ADD COLUMN "recordId" UUID;
ALTER TABLE "User" ADD COLUMN "messageRecordTopicsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Escrito à mão (o Prisma não gera CHECK): o assunto "Sobre um registro" sempre tem a referência
-- completa, e os outros assuntos nunca têm. Segunda linha de defesa, além do Zod.
ALTER TABLE "PrivateMessage" ADD CONSTRAINT "PrivateMessage_record_check" CHECK (
  ("topic" = 'REGISTRO' AND "recordType" IS NOT NULL AND "recordId" IS NOT NULL)
  OR ("topic" <> 'REGISTRO' AND "recordType" IS NULL AND "recordId" IS NULL)
);
