ALTER TABLE "User"
  ADD COLUMN "messageEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "messagePushEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "MessageTopic" AS ENUM ('LOGISTICA', 'DUVIDA');

CREATE TABLE "PrivateMessage" (
  "id" UUID NOT NULL,
  "linkId" UUID NOT NULL,
  "sentByPatient" BOOLEAN NOT NULL,
  "topic" "MessageTopic" NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivateMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivateMessage_body_check" CHECK (char_length("body") BETWEEN 1 AND 2000),
  CONSTRAINT "PrivateMessage_linkId_fkey" FOREIGN KEY ("linkId")
    REFERENCES "TherapistLink"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PrivateMessage_linkId_createdAt_id_idx" ON "PrivateMessage"("linkId", "createdAt", "id");
