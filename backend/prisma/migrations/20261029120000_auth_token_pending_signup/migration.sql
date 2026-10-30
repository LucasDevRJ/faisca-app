-- Dados do cadastro guardados no link de confirmação de e-mail (DEC-072). Confirmar aplica estes
-- dados na conta, e não os do primeiro cadastro: quem se cadastra antes com o e-mail de outra
-- pessoa não fica com a senha dela. Colunas opcionais: nada muda nos links que já existem.
ALTER TABLE "AuthToken" ADD COLUMN     "pendingName" TEXT,
ADD COLUMN     "pendingPasswordHash" TEXT,
ADD COLUMN     "pendingPatient" BOOLEAN,
ADD COLUMN     "pendingTherapist" BOOLEAN;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod. Os dados do
-- cadastro só existem na confirmação de e-mail e vêm completos: nome de 1 a 100 caracteres (como
-- no cadastro) e pelo menos um perfil.
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_pending_signup_check" CHECK (
  (
    "pendingPasswordHash" IS NULL AND "pendingName" IS NULL
    AND "pendingPatient" IS NULL AND "pendingTherapist" IS NULL
  )
  OR (
    "type" = 'EMAIL_CONFIRMATION'
    AND "pendingPasswordHash" IS NOT NULL
    AND char_length("pendingName") BETWEEN 1 AND 100
    AND "pendingPatient" IS NOT NULL AND "pendingTherapist" IS NOT NULL
    AND ("pendingPatient" OR "pendingTherapist")
  )
);
