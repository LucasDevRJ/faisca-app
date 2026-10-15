-- Textos do RPD e dos Episódios de tensão de 1 a 5000 caracteres (DEC-053). Antes era até 1000.
-- Só aumenta o limite: todo registro que já existe continua válido. As colunas são TEXT, então
-- só o CHECK muda. Escrito à mão (o Prisma não gera CHECK).

ALTER TABLE "ThoughtRecord" DROP CONSTRAINT "ThoughtRecord_text_length_check";
ALTER TABLE "ThoughtRecord" ADD CONSTRAINT "ThoughtRecord_text_length_check" CHECK (
  char_length("situation") BETWEEN 1 AND 5000
  AND char_length("automaticThought") BETWEEN 1 AND 5000
  AND char_length("behavior") BETWEEN 1 AND 5000
  AND char_length("consequence") BETWEEN 1 AND 5000
);

ALTER TABLE "TensionEpisode" DROP CONSTRAINT "TensionEpisode_text_length_check";
ALTER TABLE "TensionEpisode" ADD CONSTRAINT "TensionEpisode_text_length_check" CHECK (
  char_length("situation") BETWEEN 1 AND 5000
  AND char_length("behavior") BETWEEN 1 AND 5000
  AND char_length("consequence") BETWEEN 1 AND 5000
);
