-- A psicóloga pode optar por revisar o conteúdo da própria comunidade (DEC-122).
CREATE TYPE "CommunityModerator" AS ENUM ('PLATFORM', 'THERAPIST');

ALTER TABLE "Community"
  ADD COLUMN "announcedModerator" "CommunityModerator" NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN "therapistModerationEnabled" BOOLEAN NOT NULL DEFAULT false;
