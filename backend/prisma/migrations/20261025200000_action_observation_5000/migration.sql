-- Observação da Ação de até 5000 caracteres (DEC-067). Antes era até 1000, o limite que estourou
-- num uso real. Só aumenta o limite: toda ação que já existe continua válida. A coluna é TEXT,
-- então só o CHECK muda. Escrito à mão (o Prisma não gera CHECK).

ALTER TABLE "BehavioralAction" DROP CONSTRAINT "BehavioralAction_text_length_check";
ALTER TABLE "BehavioralAction" ADD CONSTRAINT "BehavioralAction_text_length_check" CHECK (
  char_length("name") BETWEEN 1 AND 100
  AND ("observation" IS NULL OR char_length("observation") <= 5000)
);
