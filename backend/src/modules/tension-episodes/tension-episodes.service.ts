import { AppError } from '../../errors/app-error.js';
import type { Prisma, TensionEpisode } from '../../generated/prisma/client.js';
import {
  dateOnlyToDate,
  dateToDateOnly,
  dateToTimeOnly,
  nowTimeInAppZone,
  startOfDayInAppZone,
  timeOnlyToDate,
  todayInAppZone,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type {
  CreateTensionEpisodeInput,
  ListTensionEpisodesQuery,
  UpdateTensionEpisodeInput,
} from './tension-episodes.schema.js';

// Episódios de tensão (SPEC, "Episódios de tensão"; DEC-042).

export type PublicTensionEpisode = {
  id: string;
  episodeDate: string;
  // 'HH:MM' no relógio de São Paulo, ou null quando a pessoa não informou.
  episodeTime: string | null;
  situation: string;
  tensionLevel: number;
  vocalizeUrge: number;
  behavior: string;
  consequence: string;
  // Ainda dá para editar ou excluir: foi registrado hoje (São Paulo). O "hoje" fica na API.
  editable: boolean;
  createdAt: string;
  updatedAt: string;
};

// Editar e excluir só no dia em que o registro foi feito, como no RPD. Função pura para os testes.
export function isEditable(createdAt: Date, now: Date = new Date()): boolean {
  return todayInAppZone(createdAt) === todayInAppZone(now);
}

// O episódio já aconteceu: dia até hoje e, se for hoje, hora até agora. Devolve o erro, ou null.
// 'AAAA-MM-DD' e 'HH:MM' comparam certo como texto.
export function futureMoment(
  episodeDate: string,
  episodeTime: string | null,
  now: Date = new Date(),
): 'DATE_IN_FUTURE' | 'TIME_IN_FUTURE' | null {
  const today = todayInAppZone(now);
  if (episodeDate > today) return 'DATE_IN_FUTURE';
  if (episodeDate === today && episodeTime !== null && episodeTime > nowTimeInAppZone(now)) return 'TIME_IN_FUTURE';
  return null;
}

// Sem o userId: quem pede já é o dono, ou a terapeuta, que sabe de quem pediu.
export function toPublicTensionEpisode(episode: TensionEpisode, now: Date = new Date()): PublicTensionEpisode {
  return {
    id: episode.id,
    episodeDate: dateToDateOnly(episode.episodeDate),
    episodeTime: episode.episodeTime ? dateToTimeOnly(episode.episodeTime) : null,
    situation: episode.situation,
    tensionLevel: episode.tensionLevel,
    vocalizeUrge: episode.vocalizeUrge,
    behavior: episode.behavior,
    consequence: episode.consequence,
    editable: isEditable(episode.createdAt, now),
    createdAt: episode.createdAt.toISOString(),
    updatedAt: episode.updatedAt.toISOString(),
  };
}

function notFound() {
  return new AppError(404, 'TENSION_EPISODE_NOT_FOUND', 'Registro não encontrado.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a este registro.');
}

// 409 e não 403, como na atividade finalizada: a pessoa tem permissão; é o prazo que acabou.
export function tensionEpisodeLocked() {
  return new AppError(409, 'TENSION_EPISODE_LOCKED', 'Este registro só podia ser alterado no dia em que foi feito.');
}

const FUTURE_MESSAGES = {
  DATE_IN_FUTURE: 'O episódio precisa ser de hoje ou de um dia anterior.',
  TIME_IN_FUTURE: 'O episódio de hoje precisa ter uma hora que já passou.',
} as const;

function assertNotFuture(episodeDate: string, episodeTime: string | null) {
  const code = futureMoment(episodeDate, episodeTime);
  if (code) throw new AppError(400, code, FUTURE_MESSAGES[code]);
}

function timeColumn(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : timeOnlyToDate(value);
}

async function findOwned(userId: string, id: string): Promise<TensionEpisode> {
  const episode = await prisma.tensionEpisode.findUnique({ where: { id } });
  if (!episode) throw notFound();
  if (episode.userId !== userId) throw forbidden();
  return episode;
}

// Escrita condicional (como na DEC-028): só vale se o registro ainda é de hoje no momento em que
// grava. O userId repete a conferência do findOwned: segunda linha de defesa da regra 1.
function stillEditable(userId: string, id: string): Prisma.TensionEpisodeWhereInput {
  return { id, userId, createdAt: { gte: startOfDayInAppZone(todayInAppZone()) } };
}

// Explica uma escrita condicional que não alterou nada.
async function conflictAfterRace(id: string): Promise<AppError> {
  const exists = await prisma.tensionEpisode.findUnique({ where: { id }, select: { id: true } });
  return exists ? tensionEpisodeLocked() : notFound();
}

export function createTensionEpisodesService() {
  async function list(userId: string, { from, to }: ListTensionEpisodesQuery) {
    const episodes = await prisma.tensionEpisode.findMany({
      where: { userId, episodeDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      // No dia, pela hora; os sem hora vão para o fim, na ordem em que foram registrados.
      orderBy: [{ episodeDate: 'asc' }, { episodeTime: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const now = new Date();
    return episodes.map((episode) => toPublicTensionEpisode(episode, now));
  }

  // Um registro só, para a página de edição. Uma leitura só: se sumir no meio, é 404, e não 500.
  async function get(userId: string, id: string) {
    return toPublicTensionEpisode(await findOwned(userId, id));
  }

  async function create(userId: string, input: CreateTensionEpisodeInput) {
    const { episodeDate, episodeTime = null, ...rest } = input;
    assertNotFuture(episodeDate, episodeTime);

    const episode = await prisma.tensionEpisode.create({
      data: {
        ...rest,
        userId,
        episodeDate: dateOnlyToDate(episodeDate),
        episodeTime: timeColumn(episodeTime),
      },
    });
    return toPublicTensionEpisode(episode);
  }

  async function update(userId: string, id: string, input: UpdateTensionEpisodeInput) {
    const episode = await findOwned(userId, id);
    if (!isEditable(episode.createdAt)) throw tensionEpisodeLocked();

    const { episodeDate, episodeTime, ...rest } = input;
    // Dia e hora valem juntos: mudar só um deles ainda não pode levar o episódio para o futuro.
    if (episodeDate !== undefined || episodeTime !== undefined) {
      const current = toPublicTensionEpisode(episode);
      assertNotFuture(
        episodeDate ?? current.episodeDate,
        episodeTime === undefined ? current.episodeTime : episodeTime,
      );
    }

    const { count } = await prisma.tensionEpisode.updateMany({
      where: stillEditable(userId, id),
      data: {
        ...rest,
        episodeDate: episodeDate ? dateOnlyToDate(episodeDate) : undefined,
        episodeTime: timeColumn(episodeTime),
      },
    });
    if (count === 0) throw await conflictAfterRace(id);

    return toPublicTensionEpisode(await prisma.tensionEpisode.findUniqueOrThrow({ where: { id } }));
  }

  async function remove(userId: string, id: string) {
    const episode = await findOwned(userId, id);
    if (!isEditable(episode.createdAt)) throw tensionEpisodeLocked();

    const { count } = await prisma.tensionEpisode.deleteMany({ where: stillEditable(userId, id) });
    if (count === 0) throw await conflictAfterRace(id);
  }

  return { list, get, create, update, remove };
}

export type TensionEpisodesService = ReturnType<typeof createTensionEpisodesService>;
