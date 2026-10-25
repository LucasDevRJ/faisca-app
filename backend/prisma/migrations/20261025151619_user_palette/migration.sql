-- CreateEnum
CREATE TYPE "Palette" AS ENUM ('SALVIA', 'LAVANDA', 'OCEANO', 'AREIA', 'ALTO_CONTRASTE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "palette" "Palette";
