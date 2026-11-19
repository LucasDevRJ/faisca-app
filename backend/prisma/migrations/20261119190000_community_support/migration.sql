-- CreateEnum
CREATE TYPE "CommunityMembershipStatus" AS ENUM ('INVITED', 'REQUESTED', 'ACTIVE', 'LEFT', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommunityAuthorKind" AS ENUM ('PATIENT', 'THERAPIST');

-- CreateEnum
CREATE TYPE "CommunityContentStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "CommunityReportReason" AS ENUM ('HARASSMENT', 'PRIVACY', 'UNSAFE_ADVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'REVIEWED');

-- CreateTable
CREATE TABLE "Community" (
    "id" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMembership" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "CommunityMembershipStatus" NOT NULL DEFAULT 'REQUESTED',
    "displayName" TEXT,
    "acceptedRulesAt" TIMESTAMP(3),
    "adultConfirmedAt" TIMESTAMP(3),
    "announceOnJoin" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorKind" "CommunityAuthorKind" NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityContentStatus" NOT NULL DEFAULT 'PENDING',
    "moderationMessage" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "moderatorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorKind" "CommunityAuthorKind" NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityContentStatus" NOT NULL DEFAULT 'PENDING',
    "moderationMessage" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "moderatorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityEvent" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "postId" UUID,
    "commentId" UUID,
    "reason" "CommunityReportReason" NOT NULL,
    "details" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMP(3),
    "moderatorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Community_therapistId_key" ON "Community"("therapistId");

-- CreateIndex
CREATE INDEX "CommunityMembership_communityId_status_createdAt_idx" ON "CommunityMembership"("communityId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMembership_communityId_patientId_key" ON "CommunityMembership"("communityId", "patientId");

-- CreateIndex
CREATE INDEX "CommunityPost_communityId_status_createdAt_idx" ON "CommunityPost"("communityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_createdAt_idx" ON "CommunityPost"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_status_createdAt_idx" ON "CommunityComment"("postId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_authorId_createdAt_idx" ON "CommunityComment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityEvent_communityId_createdAt_idx" ON "CommunityEvent"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_communityId_status_createdAt_idx" ON "CommunityReport"("communityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_reporterId_createdAt_idx" ON "CommunityReport"("reporterId", "createdAt");

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Escrito à mão (o Prisma não gera CHECK): limites de texto e integridade dos alvos (DEC-113).
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_displayName_check"
  CHECK ("displayName" IS NULL OR char_length("displayName") BETWEEN 1 AND 40);
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_consent_check"
  CHECK (
    "status" = 'INVITED'
    OR ("displayName" IS NOT NULL AND "acceptedRulesAt" IS NOT NULL AND "adultConfirmedAt" IS NOT NULL)
  );
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_body_check"
  CHECK (char_length("body") BETWEEN 1 AND 2000);
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_moderationMessage_check"
  CHECK ("moderationMessage" IS NULL OR char_length("moderationMessage") BETWEEN 1 AND 500);
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_body_check"
  CHECK (char_length("body") BETWEEN 1 AND 1000);
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_moderationMessage_check"
  CHECK ("moderationMessage" IS NULL OR char_length("moderationMessage") BETWEEN 1 AND 500);
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_body_check"
  CHECK (char_length("body") BETWEEN 1 AND 100);
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_details_check"
  CHECK ("details" IS NULL OR char_length("details") BETWEEN 1 AND 500);
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_one_target_check"
  CHECK (("postId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int = 1);
