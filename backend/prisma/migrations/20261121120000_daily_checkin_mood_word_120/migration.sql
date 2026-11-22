-- Limite ampliado para a palavra ou frase do dia (DEC-121).
ALTER TABLE "DailyCheckIn" DROP CONSTRAINT "DailyCheckIn_values_check";
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_values_check" CHECK (
  ("sleepQuality" IS NULL OR "sleepQuality" BETWEEN 0 AND 10)
  AND ("mood" IS NULL OR "mood" BETWEEN 0 AND 10)
  AND ("moodWord" IS NULL OR char_length(btrim("moodWord")) BETWEEN 1 AND 120)
  AND (("bedTime" IS NULL) = ("wakeTime" IS NULL))
  AND ("bedTime" IS NULL OR "bedTime" <> "wakeTime")
);
