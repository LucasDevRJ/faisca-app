-- Já entrou alguma vez? O primeiro login de todos não gera aviso de acesso novo (DEC-091).
ALTER TABLE "User" ADD COLUMN     "hasLoggedIn" BOOLEAN NOT NULL DEFAULT false;

-- Escrito à mão: quem já tem conta confirmada conta como "já entrou", para o aviso valer desde o
-- primeiro login depois do deploy.
UPDATE "User" SET "hasLoggedIn" = true WHERE "emailConfirmedAt" IS NOT NULL;
