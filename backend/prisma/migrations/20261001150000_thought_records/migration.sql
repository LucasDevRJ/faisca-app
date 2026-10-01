-- CreateEnum
CREATE TYPE "Emotion" AS ENUM ('TRISTEZA', 'ANSIEDADE', 'MEDO', 'RAIVA', 'CULPA', 'VERGONHA', 'FRUSTRACAO', 'SOLIDAO', 'ALEGRIA', 'ALIVIO', 'OUTRA');

-- CreateTable
CREATE TABLE "ThoughtRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "situationDate" DATE NOT NULL,
    "situation" TEXT NOT NULL,
    "automaticThought" TEXT NOT NULL,
    "beliefLevel" INTEGER NOT NULL,
    "behavior" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThoughtRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThoughtRecordEmotion" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "emotion" "Emotion" NOT NULL,
    "intensity" INTEGER NOT NULL,
    "otherLabel" TEXT,

    CONSTRAINT "ThoughtRecordEmotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThoughtRecord_userId_situationDate_idx" ON "ThoughtRecord"("userId", "situationDate");

-- CreateIndex
CREATE UNIQUE INDEX "ThoughtRecordEmotion_recordId_emotion_key" ON "ThoughtRecordEmotion"("recordId", "emotion");

-- AddForeignKey
ALTER TABLE "ThoughtRecord" ADD CONSTRAINT "ThoughtRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThoughtRecordEmotion" ADD CONSTRAINT "ThoughtRecordEmotion_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ThoughtRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-039).

-- Crença no pensamento de 0 a 10; textos de 1 a 1000 caracteres (todos obrigatórios).
ALTER TABLE "ThoughtRecord" ADD CONSTRAINT "ThoughtRecord_belief_range_check" CHECK (
  "beliefLevel" BETWEEN 0 AND 10
);

ALTER TABLE "ThoughtRecord" ADD CONSTRAINT "ThoughtRecord_text_length_check" CHECK (
  char_length("situation") BETWEEN 1 AND 1000
  AND char_length("automaticThought") BETWEEN 1 AND 1000
  AND char_length("behavior") BETWEEN 1 AND 1000
  AND char_length("consequence") BETWEEN 1 AND 1000
);

-- Intensidade de 0 a 10.
ALTER TABLE "ThoughtRecordEmotion" ADD CONSTRAINT "ThoughtRecordEmotion_intensity_range_check" CHECK (
  "intensity" BETWEEN 0 AND 10
);

-- O nome livre existe só na OUTRA, e nela é obrigatório (1 a 50 caracteres).
ALTER TABLE "ThoughtRecordEmotion" ADD CONSTRAINT "ThoughtRecordEmotion_other_label_check" CHECK (
  CASE "emotion"
    WHEN 'OUTRA' THEN "otherLabel" IS NOT NULL AND char_length("otherLabel") BETWEEN 1 AND 50
    ELSE "otherLabel" IS NULL
  END
);
