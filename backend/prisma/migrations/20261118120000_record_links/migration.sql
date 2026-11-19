-- Ligações entre registros e repetições do paciente (DEC-111).
CREATE TYPE "LinkedRecordType" AS ENUM (
  'ACTIVITY',
  'THOUGHT_RECORD',
  'TENSION_EPISODE',
  'ACTION',
  'PLAN',
  'PLAN_ENTRY',
  'TASK',
  'SLEEP_MOOD',
  'MEDICATION'
);

CREATE TYPE "RecordLinkKind" AS ENUM ('RELATED', 'REPETITION');

CREATE TABLE "RecordLink" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "sourceType" "LinkedRecordType" NOT NULL,
  "sourceId" UUID NOT NULL,
  "targetType" "LinkedRecordType" NOT NULL,
  "targetId" UUID NOT NULL,
  "kind" "RecordLinkKind" NOT NULL DEFAULT 'RELATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecordLink_not_self_check" CHECK (
    ("sourceType", "sourceId") <> ("targetType", "targetId")
  ),
  CONSTRAINT "RecordLink_repetition_type_check" CHECK (
    "kind" <> 'REPETITION' OR (
      "sourceType" = "targetType" AND
      "sourceType" IN ('THOUGHT_RECORD', 'TENSION_EPISODE')
    )
  )
);

CREATE INDEX "RecordLink_userId_sourceType_sourceId_idx"
  ON "RecordLink"("userId", "sourceType", "sourceId");

CREATE INDEX "RecordLink_userId_targetType_targetId_idx"
  ON "RecordLink"("userId", "targetType", "targetId");

CREATE UNIQUE INDEX "RecordLink_userId_sourceType_sourceId_targetType_targetId_kind_key"
  ON "RecordLink"("userId", "sourceType", "sourceId", "targetType", "targetId", "kind");

ALTER TABLE "RecordLink"
  ADD CONSTRAINT "RecordLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
