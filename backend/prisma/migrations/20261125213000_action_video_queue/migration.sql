-- #143: guarda o estado do vídeo e permite limpar o R2 quando a Ação sai.
CREATE TYPE "ActionVideoState" AS ENUM ('UPLOADING', 'PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "ActionVideo" (
    "id" UUID NOT NULL,
    "actionId" UUID,
    "state" "ActionVideoState" NOT NULL DEFAULT 'UPLOADING',
    "keepAudio" BOOLEAN NOT NULL DEFAULT true,
    "cleanupPending" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionVideo_actionId_key" ON "ActionVideo"("actionId");
CREATE INDEX "ActionVideo_state_cleanupPending_updatedAt_idx" ON "ActionVideo"("state", "cleanupPending", "updatedAt");
CREATE INDEX "ActionVideo_actionId_updatedAt_idx" ON "ActionVideo"("actionId", "updatedAt");
ALTER TABLE "ActionVideo" ADD CONSTRAINT "ActionVideo_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "BehavioralAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
