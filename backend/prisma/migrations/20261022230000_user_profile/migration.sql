-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fullName" TEXT;

-- CreateTable
CREATE TABLE "UserAvatar" (
    "userId" UUID NOT NULL,
    "image" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-061).
-- O Zod já tira os espaços das pontas e transforma vazio em null.
ALTER TABLE "User" ADD CONSTRAINT "User_fullName_check" CHECK (
  "fullName" IS NULL OR char_length("fullName") BETWEEN 1 AND 120
);
