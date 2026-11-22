-- Avisos por e-mail de novidades importantes (DEC-119).
CREATE TYPE "AnnouncementEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');

ALTER TABLE "User"
  ADD COLUMN "announcementEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "announcementEmailsEnabledAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "AnnouncementRelease" (
  "id" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementEmailDelivery" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "announcementId" TEXT NOT NULL,
  "status" "AnnouncementEmailStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "firstAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnnouncementEmailDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnnouncementEmailDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementEmailDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "AnnouncementRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AnnouncementEmailDelivery_userId_announcementId_key"
  ON "AnnouncementEmailDelivery"("userId", "announcementId");
CREATE INDEX "AnnouncementEmailDelivery_status_nextAttemptAt_idx"
  ON "AnnouncementEmailDelivery"("status", "nextAttemptAt");
