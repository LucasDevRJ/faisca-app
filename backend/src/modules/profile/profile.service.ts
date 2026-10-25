import type { Palette } from '../../generated/prisma/client.js';
import { processImage } from '../../lib/images.js';
import { prisma } from '../../lib/prisma.js';
import type { UpdateProfileInput } from './profile.schema.js';

// Perfil básico (DEC-061): nome completo e foto, de paciente e de terapeuta.

export type PublicProfile = {
  fullName: string | null;
  // Paleta de cores (DEC-063); sem escolha, a Sálvia.
  palette: Palette;
  // Quando a foto mudou pela última vez (ISO), ou null sem foto. O front usa no endereço da
  // imagem para não mostrar uma antiga do cache.
  avatarVersion: string | null;
};

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
        select: { fullName: true, palette: true, avatar: { select: { updatedAt: true } } },
      });
      return {
        fullName: user.fullName,
        palette: user.palette ?? 'SALVIA',
        avatarVersion: avatarVersion(user.avatar),
      };
    },

    async update(userId: string, input: UpdateProfileInput): Promise<PublicProfile> {
      // undefined = campo não enviado: o Prisma deixa como está.
      await prisma.user.update({ where: { id: userId }, data: { fullName: input.fullName, palette: input.palette } });
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

    // A terapeuta com vínculo ativo com o paciente, ou null.
    async linkedTherapistId(patientId: string): Promise<string | null> {
      const link = await prisma.therapistLink.findFirst({
        where: { patientId, revokedAt: null },
        select: { therapistId: true },
      });
      return link?.therapistId ?? null;
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
