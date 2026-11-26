ALTER TYPE "SharedArea" ADD VALUE 'ACTIVITY_VIDEOS';

ALTER TABLE "ActionVideo"
    ADD COLUMN "activityId" UUID,
    ADD COLUMN "isGif" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "ActionVideo_activityId_key" ON "ActionVideo"("activityId");
ALTER TABLE "ActionVideo" ADD CONSTRAINT "ActionVideo_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- As duas relações ficam nulas enquanto a remoção no armazenamento está pendente.
ALTER TABLE "ActionVideo" ADD CONSTRAINT "ActionVideo_one_record_check"
    CHECK ("actionId" IS NULL OR "activityId" IS NULL);
ALTER TABLE "ActionVideo" ADD CONSTRAINT "ActionVideo_gif_silent_check"
    CHECK (NOT "isGif" OR ("actionId" IS NULL AND NOT "keepAudio"));
