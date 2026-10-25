-- Observação das atividades de até 5000 caracteres (DEC-067), como a da Ação. Antes era até 1000.
-- Só aumenta o limite: toda atividade que já existe continua válida. A coluna é TEXT, então só o
-- CHECK muda. Escrito à mão (o Prisma não gera CHECK).

ALTER TABLE "Activity" DROP CONSTRAINT "Activity_text_length_check";
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_text_length_check" CHECK (
  char_length("name") BETWEEN 1 AND 100
  AND ("observation" IS NULL OR char_length("observation") <= 5000)
);
