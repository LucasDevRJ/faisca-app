-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('MANHA', 'NOITE');

-- CreateTable
CREATE TABLE "ReminderSettings" (
    "userId" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'EMAIL',
    "morningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "morningTime" TIME(0) NOT NULL,
    "eveningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eveningTime" TIME(0) NOT NULL,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietStart" TIME(0) NOT NULL,
    "quietEnd" TIME(0) NOT NULL,
    "pausedUntil" DATE,
    "lastFallbackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "ReminderType" NOT NULL,
    "referenceDate" DATE NOT NULL,
    "channelUsed" "ReminderChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_referenceDate_idx" ON "NotificationLog"("referenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_type_referenceDate_key" ON "NotificationLog"("userId", "type", "referenceDate");

-- AddForeignKey
ALTER TABLE "ReminderSettings" ADD CONSTRAINT "ReminderSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-089).
-- Horários dos lembretes e do silêncio sempre em múltiplos de 15 minutos, sem segundos, e o início
-- do silêncio diferente do fim.
ALTER TABLE "ReminderSettings" ADD CONSTRAINT "ReminderSettings_times_check" CHECK (
  EXTRACT(MINUTE FROM "morningTime")::int % 15 = 0
  AND EXTRACT(SECOND FROM "morningTime")::int = 0
  AND EXTRACT(MINUTE FROM "eveningTime")::int % 15 = 0
  AND EXTRACT(SECOND FROM "eveningTime")::int = 0
  AND EXTRACT(MINUTE FROM "quietStart")::int % 15 = 0
  AND EXTRACT(SECOND FROM "quietStart")::int = 0
  AND EXTRACT(MINUTE FROM "quietEnd")::int % 15 = 0
  AND EXTRACT(SECOND FROM "quietEnd")::int = 0
  AND "quietStart" <> "quietEnd"
);

-- Inscrições de Web Push só em HTTPS e com comprimentos dentro do esperado para P-256 e segredo auth.
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_fields_check" CHECK (
  "endpoint" LIKE 'https://%'
  AND char_length("endpoint") BETWEEN 12 AND 2048
  AND char_length("p256dh") BETWEEN 80 AND 120
  AND char_length("auth") BETWEEN 16 AND 64
);
