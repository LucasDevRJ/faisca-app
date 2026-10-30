-- AlterTable
ALTER TABLE "User" ADD COLUMN     "comfortableReading" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "directLanguage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noTimePressure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oneThingAtATime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reducedMotion" BOOLEAN NOT NULL DEFAULT false;
