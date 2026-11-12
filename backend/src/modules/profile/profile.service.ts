import type { Palette, ProfessionalKind, User } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import { processImage } from '../../lib/images.js';
import { prisma } from '../../lib/prisma.js';
import type { UpdateProfileInput } from './profile.schema.js';

// Perfil básico (DEC-061) e ajustes de acessibilidade (DEC-076): de paciente e de terapeuta.

export type AccessibilitySettings = {
  directLanguage: boolean;
  oneThingAtATime: boolean;
  comfortableReading: boolean;
  noTimePressure: boolean;
  reducedMotion: boolean;
};

export function toAccessibilitySettings(
  user: Pick<User, 'directLanguage' | 'oneThingAtATime' | 'comfortableReading' | 'noTimePressure' | 'reducedMotion'>,
): AccessibilitySettings {
  return {
    directLanguage: user.directLanguage,
    oneThingAtATime: user.oneThingAtATime,
    comfortableReading: user.comfortableReading,
    noTimePressure: user.noTimePressure,
    reducedMotion: user.reducedMotion,
  };
}

export type PublicProfile = {
  fullName: string | null;
  // Paleta de cores (DEC-063); sem escolha, a Sálvia.
  palette: Palette;
  // Ajustes de acessibilidade (DEC-076).
  accessibility: AccessibilitySettings;
  // Quando a foto mudou pela última vez (ISO), ou null sem foto. O front usa no endereço da
  // imagem para não mostrar uma antiga do cache.
  avatarVersion: string | null;
  // Tipo de profissional e conselho (DEC-097); null para quem não tem o perfil de terapeuta.
  professional: { kind: ProfessionalKind; councilNumber: string | null } | null;
};

// Trocar o tipo com vínculo ativo mudaria o que o paciente combinou: só sem vínculo (DEC-097).
function kindLocked() {
  return new AppError(
    409,
    'PROFESSIONAL_KIND_LOCKED',
    'Para trocar o tipo de profissional, os pacientes precisam desfazer o vínculo com você antes.',
  );
}

function notProfessional() {
  return new AppError(403, 'THERAPIST_PROFILE_REQUIRED', 'Esta opção é só para quem acompanha pacientes.');
}

export type Avatar = { image: Uint8Array; updatedAt: Date };

const AVATAR_SIDE = 256;
// 25 MP cobre a foto de qualquer celular e limita a memória de cada envio.
const MAX_INPUT_PIXELS = 25_000_000;

// Recorta no centro em 256×256 e regrava em WebP, sem metadados (lib/images.ts).
export async function toAvatarImage(input: Uint8Array): Promise<Buffer> {
  const [avatar] = await processImage(input, MAX_INPUT_PIXELS, [
    { width: AVATAR_SIDE, height: AVATAR_SIDE, fit: 'cover', quality: 82 },
  ]);
  return avatar!;
}

export function avatarVersion(avatar: { updatedAt: Date } | null): string | null {
  return avatar ? avatar.updatedAt.toISOString() : null;
}

export function createProfileService() {
  return {
    async get(userId: string): Promise<PublicProfile> {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          fullName: true,
          palette: true,
          directLanguage: true,
          oneThingAtATime: true,
          comfortableReading: true,
          noTimePressure: true,
          reducedMotion: true,
          hasTherapistProfile: true,
          professionalKind: true,
          councilNumber: true,
          avatar: { select: { updatedAt: true } },
        },
      });
      return {
        fullName: user.fullName,
        palette: user.palette ?? 'SALVIA',
        accessibility: toAccessibilitySettings(user),
        avatarVersion: avatarVersion(user.avatar),
        professional:
          user.hasTherapistProfile && user.professionalKind
            ? { kind: user.professionalKind, councilNumber: user.councilNumber }
            : null,
      };
    },

    async update(userId: string, input: UpdateProfileInput): Promise<PublicProfile> {
      const { professional } = input;
      // Com a conta travada: um vínculo sendo criado ao mesmo tempo espera, e a conferência "sem
      // vínculo ativo" vale até gravar (achado do revisor-seguranca).
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        if (professional) {
          const user = await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { hasTherapistProfile: true, professionalKind: true },
          });
          if (!user.hasTherapistProfile) throw notProfessional();
          if (professional.kind && professional.kind !== user.professionalKind) {
            const active = await tx.therapistLink.count({ where: { therapistId: userId, revokedAt: null } });
            if (active > 0) throw kindLocked();
          }
        }
        // undefined = campo não enviado: o Prisma deixa como está.
        await tx.user.update({
          where: { id: userId },
          data: {
            fullName: input.fullName,
            palette: input.palette,
            professionalKind: professional?.kind,
            councilNumber: professional?.councilNumber,
            ...(input.accessibility && {
              directLanguage: input.accessibility.directLanguage,
              oneThingAtATime: input.accessibility.oneThingAtATime,
              comfortableReading: input.accessibility.comfortableReading,
              noTimePressure: input.accessibility.noTimePressure,
              reducedMotion: input.accessibility.reducedMotion,
            }),
          },
        });
      });
      return this.get(userId);
    },

    async setAvatar(userId: string, upload: Uint8Array): Promise<PublicProfile> {
      // Cópia num Uint8Array próprio: é o tipo que o Prisma espera nas colunas Bytes.
      const image = new Uint8Array(await toAvatarImage(upload));
      await prisma.userAvatar.upsert({
        where: { userId },
        create: { userId, image },
        update: { image },
      });
      return this.get(userId);
    },

    // true se havia foto para apagar.
    async removeAvatar(userId: string): Promise<boolean> {
      const { count } = await prisma.userAvatar.deleteMany({ where: { userId } });
      return count > 0;
    },

    async avatarOf(userId: string): Promise<Avatar | null> {
      return prisma.userAvatar.findUnique({ where: { userId }, select: { image: true, updatedAt: true } });
    },

    // A profissional de um vínculo ativo do paciente, ou null. Sem linkId, a psicóloga (DEC-097).
    async linkedTherapistId(patientId: string, linkId?: string): Promise<string | null> {
      const link = await prisma.therapistLink.findFirst({
        where: { patientId, revokedAt: null, ...(linkId && { id: linkId }) },
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
        select: { therapistId: true },
      });
      return link?.therapistId ?? null;
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
