-- Mensagens (DEC-127): até que mensagem cada pessoa viu a conversa, para o selo "Nova" de cada uma.
-- Colunas opcionais: vínculos que já existem começam sem "visto" (tudo o que já chegou conta como novo
-- para quem nunca abriu a conversa).
ALTER TABLE "TherapistLink" ADD COLUMN "patientMessagesSeenAt" TIMESTAMP(3);
ALTER TABLE "TherapistLink" ADD COLUMN "therapistMessagesSeenAt" TIMESTAMP(3);
