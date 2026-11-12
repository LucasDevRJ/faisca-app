-- CreateEnum
CREATE TYPE "ProfessionalKind" AS ENUM ('PSICOLOGIA', 'PSIQUIATRIA');

-- CreateEnum
CREATE TYPE "SharedArea" AS ENUM ('ACTIVITIES', 'THOUGHT_RECORDS', 'TENSION_EPISODES', 'ACTIONS', 'ACTION_PHOTOS', 'ABOUT_ME', 'APPOINTMENTS', 'PLANS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "councilNumber" TEXT,
ADD COLUMN     "professionalKind" "ProfessionalKind";

-- AlterTable: o DEFAULT só preenche os vínculos que já existem e sai logo depois (o schema não tem
-- padrão para o tipo: quem cria um vínculo informa o tipo da profissional).
ALTER TABLE "TherapistLink" ADD COLUMN     "kind" "ProfessionalKind" NOT NULL DEFAULT 'PSICOLOGIA',
ADD COLUMN     "sharedAreas" "SharedArea"[] DEFAULT ARRAY[]::"SharedArea"[];
ALTER TABLE "TherapistLink" ALTER COLUMN "kind" DROP DEFAULT;


-- Escrito à mão (DEC-097).

-- Quem já era terapeuta vira psicóloga, e os vínculos que já existiam continuam vendo tudo: nada
-- muda para quem já usava. Vínculo novo começa sem área nenhuma (o padrão do schema).
UPDATE "User" SET "professionalKind" = 'PSICOLOGIA' WHERE "hasTherapistProfile" = true;
UPDATE "TherapistLink" SET "sharedAreas" = ARRAY[
  'ACTIVITIES', 'THOUGHT_RECORDS', 'TENSION_EPISODES', 'ACTIONS', 'ACTION_PHOTOS', 'ABOUT_ME', 'APPOINTMENTS', 'PLANS'
]::"SharedArea"[];

-- Com o perfil de terapeuta, o tipo é obrigatório. O conselho, quando existe, tem de 1 a 30 caracteres.
ALTER TABLE "User" ADD CONSTRAINT "User_professional_kind_check" CHECK (
  "hasTherapistProfile" = false OR "professionalKind" IS NOT NULL
);
ALTER TABLE "User" ADD CONSTRAINT "User_council_number_check" CHECK (
  "councilNumber" IS NULL OR char_length("councilNumber") BETWEEN 1 AND 30
);

-- A lista de áreas nunca é NULL (vazia = nada liberado).
ALTER TABLE "TherapistLink" ADD CONSTRAINT "TherapistLink_shared_areas_check" CHECK ("sharedAreas" IS NOT NULL);

-- Antes: no máximo uma terapeuta ativa por paciente. Agora: no máximo uma ativa de cada tipo
-- (uma psicóloga e uma psiquiatra), mesmo com dois aceites ao mesmo tempo (DEC-031, DEC-097).
DROP INDEX "TherapistLink_one_active_per_patient";
CREATE UNIQUE INDEX "TherapistLink_one_active_per_kind"
  ON "TherapistLink"("patientId", "kind") WHERE "revokedAt" IS NULL;
-- A mesma profissional não fica com dois vínculos ativos com o mesmo paciente.
CREATE UNIQUE INDEX "TherapistLink_one_active_per_pair"
  ON "TherapistLink"("patientId", "therapistId") WHERE "revokedAt" IS NULL;
