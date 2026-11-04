import { prisma } from '../../lib/prisma.js';
import type { SaveAboutMeInput } from './about-me.schema.js';

// "Sobre mim" do paciente (DEC-081): tudo opcional. Sem nenhum campo preenchido, não existe.

export type PublicAboutMe = {
  id: string;
  aboutMe: string | null;
  goals: string | null;
  habits: string | null;
  updatedAt: string;
};

type Row = { id: string; aboutMe: string | null; goals: string | null; habits: string | null; updatedAt: Date };

function toPublic(row: Row): PublicAboutMe {
  return {
    id: row.id,
    aboutMe: row.aboutMe,
    goals: row.goals,
    habits: row.habits,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const select = { id: true, aboutMe: true, goals: true, habits: true, updatedAt: true } as const;

export function createAboutMeService() {
  // Sempre do próprio paciente (ou do paciente com vínculo ativo, na rota da terapeuta).
  async function get(userId: string): Promise<PublicAboutMe | null> {
    const row = await prisma.patientAbout.findUnique({ where: { userId }, select });
    return row ? toPublic(row) : null;
  }

  // Salva os três campos. Tudo vazio apaga o registro (e as marcas de leitura, em cascata).
  async function save(userId: string, input: SaveAboutMeInput): Promise<PublicAboutMe | null> {
    if (input.aboutMe === null && input.goals === null && input.habits === null) {
      await prisma.patientAbout.deleteMany({ where: { userId } });
      return null;
    }
    const row = await prisma.patientAbout.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
      select,
    });
    return toPublic(row);
  }

  return { get, save };
}

export type AboutMeService = ReturnType<typeof createAboutMeService>;
