-- CreateTable
CREATE TABLE "TensionEpisode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "episodeDate" DATE NOT NULL,
    "episodeTime" TIME(0),
    "situation" TEXT NOT NULL,
    "tensionLevel" INTEGER NOT NULL,
    "vocalizeUrge" INTEGER NOT NULL,
    "behavior" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TensionEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TensionEpisode_userId_episodeDate_idx" ON "TensionEpisode"("userId", "episodeDate");

-- AddForeignKey
ALTER TABLE "TensionEpisode" ADD CONSTRAINT "TensionEpisode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-042).

-- Tensão e vontade de vocalizar de 0 a 10.
ALTER TABLE "TensionEpisode" ADD CONSTRAINT "TensionEpisode_scores_range_check" CHECK (
  "tensionLevel" BETWEEN 0 AND 10
  AND "vocalizeUrge" BETWEEN 0 AND 10
);

-- Textos de 1 a 1000 caracteres (todos obrigatórios).
ALTER TABLE "TensionEpisode" ADD CONSTRAINT "TensionEpisode_text_length_check" CHECK (
  char_length("situation") BETWEEN 1 AND 1000
  AND char_length("behavior") BETWEEN 1 AND 1000
  AND char_length("consequence") BETWEEN 1 AND 1000
);
