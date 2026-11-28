-- CreateTable
CREATE TABLE "HelpAssistantUsage" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpAssistantUsage_pkey" PRIMARY KEY ("userId","day")
);

-- AddForeignKey
ALTER TABLE "HelpAssistantUsage" ADD CONSTRAINT "HelpAssistantUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defesa adicional dos limites e do comprovante do envio consentido (DEC-145).
ALTER TABLE "HelpAssistantUsage" ADD CONSTRAINT "HelpAssistantUsage_count_check" CHECK ("count" BETWEEN 0 AND 10);
ALTER TABLE "HelpAssistantUsage" ADD CONSTRAINT "HelpAssistantUsage_consent_check" CHECK (char_length("consentVersion") BETWEEN 1 AND 100);
