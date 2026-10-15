-- Explicação alternativa e "Como me sinto agora" no RPD; card de Novidades (DEC-054).
-- Colunas opcionais: os registros que já existem continuam válidos.

ALTER TABLE "ThoughtRecord" ADD COLUMN "alternativeExplanation" TEXT,
ADD COLUMN "alternativeAddedAt" TIMESTAMP(3);

ALTER TABLE "ThoughtRecordEmotion" ADD COLUMN "intensityAfter" INTEGER;

ALTER TABLE "User" ADD COLUMN "seenAnnouncement" TEXT;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod.

-- A alternativa tem de 1 a 5000 caracteres, como os outros textos (DEC-053), e vem sempre com a
-- data em que foi adicionada.
ALTER TABLE "ThoughtRecord" ADD CONSTRAINT "ThoughtRecord_alternative_check" CHECK (
  ("alternativeExplanation" IS NULL OR char_length("alternativeExplanation") BETWEEN 1 AND 5000)
  AND (("alternativeExplanation" IS NULL) = ("alternativeAddedAt" IS NULL))
);

-- Intensidade depois da alternativa de 0 a 10.
ALTER TABLE "ThoughtRecordEmotion" ADD CONSTRAINT "ThoughtRecordEmotion_intensity_after_range_check" CHECK (
  "intensityAfter" IS NULL OR "intensityAfter" BETWEEN 0 AND 10
);
