import { AppError } from '../../errors/app-error.js';
import type { Activity, ActivityStatus, Prisma } from '../../generated/prisma/client.js';
import { dateOnlyToDate, dateToDateOnly, todayInAppZone } from '../../lib/dates.js';
import {
  accountPhotoLimit,
  countAccountPhotos,
  isPastDeadline,
  MAX_PHOTOS,
  MAX_PHOTOS_PER_ACCOUNT,
  photoNotFound,
  processPhoto,
} from '../../lib/photos.js';
import { prisma } from '../../lib/prisma.js';
import { loadAgenda } from '../appointments/appointments.service.js';
import { scheduledSessionsFrom, type Session } from '../appointments/sessions.js';
import {
  deadlineFor,
  deadlineInstant,
  effectiveDeadline,
  isBeforeDeadline,
  type AlternativeDeadline,
} from '../thought-records/thought-records.service.js';
import type {
  CompleteActivityInput,
  CreateActivityInput,
  ListActivitiesQuery,
  NotDoneActivityInput,
  StartActivityInput,
  UpdateActivityInput,
} from './activities.schema.js';

// Máquina de estados da SPEC (Atividades > Transições). É o único lugar que decide
// mudança de status. Funções puras, sem banco, exportadas para os testes de unidade.

export const FINAL_STATUSES: readonly ActivityStatus[] = ['CONCLUIDA', 'NAO_REALIZADA'];
export const EDITABLE_STATUSES: readonly ActivityStatus[] = ['PLANEJADA', 'PENDENTE'];

// De onde cada transição pode partir.
export const TRANSITIONS = {
  start: { from: ['PLANEJADA'], to: 'PENDENTE' },
  complete: { from: ['PENDENTE'], to: 'CONCLUIDA' },
  notDone: { from: ['PLANEJADA', 'PENDENTE'], to: 'NAO_REALIZADA' },
} as const satisfies Record<string, { from: readonly ActivityStatus[]; to: ActivityStatus }>;

export type TransitionName = keyof typeof TRANSITIONS;

export function isFinal(status: ActivityStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

// DEC-012: 409 e não 403. A pessoa tem permissão; é o estado do registro que não deixa.
export function activityFinalized() {
  return new AppError(
    409,
    'ACTIVITY_FINALIZED',
    'Esta atividade já foi finalizada e não pode mais ser alterada.',
  );
}

export function invalidTransition(message = 'Esta mudança de estado não é permitida.') {
  return new AppError(409, 'INVALID_TRANSITION', message);
}

// Editar ou excluir: só enquanto a atividade não é final.
export function assertEditable(status: ActivityStatus): void {
  if (isFinal(status)) throw activityFinalized();
}

export function assertTransition(status: ActivityStatus, transition: TransitionName): void {
  assertEditable(status);
  const allowed: readonly ActivityStatus[] = TRANSITIONS[transition].from;
  if (!allowed.includes(status)) throw invalidTransition();
}

// CONCLUIDA e NAO_REALIZADA falam de algo que já aconteceu (ou não): só até hoje (DEC-028).
export function isFutureDate(activityDate: string, today: string): boolean {
  // 'AAAA-MM-DD' compara certo como texto.
  return activityDate > today;
}

export type PublicActivity = {
  id: string;
  name: string;
  activityDate: string;
  status: Activity['status'];
  wantBefore: number | null;
  pleasure: number | null;
  achievement: number | null;
  observation: string | null;
  // Fotos (DEC-103), da mais antiga para a mais nova; as imagens vêm por rota própria.
  photos: { id: string; createdAt: string }[];
  // Na concluída, a próxima consulta depois da conclusão, que fecha o prazo das fotos; null com a
  // atividade aberta ou sem consulta marcada.
  photosDeadline: AlternativeDeadline | null;
  // Dá para adicionar ou remover fotos agora: aberta, ou concluída antes do prazo.
  photosOpen: boolean;
  createdAt: string;
  updatedAt: string;
};

type PhotoRef = { id: string; createdAt: Date };
export type ActivityWithPhotos = Activity & { photos: PhotoRef[] };

// Para as consultas trazerem as fotos (só id e data, sem as imagens) na ordem certa.
const withPhotos = { photos: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } } };

// A partir de quando conta o prazo das fotos: a conclusão (DEC-103). As concluídas antes do
// completedAt existir usam o updatedAt, preenchido igual na migration. Aberta não tem prazo.
function photosBasis(activity: Activity): Date | null {
  if (activity.status !== 'CONCLUIDA') return null;
  return activity.completedAt ?? activity.updatedAt;
}

// Funções puras, para testar as bordas sem banco. Vale o que vier primeiro: o prazo congelado ou a
// consulta pela agenda de agora (como na Ação, DEC-064).
export function photosDeadlineFor(activity: Activity, sessions: Session[]): AlternativeDeadline | null {
  const basis = photosBasis(activity);
  return basis ? effectiveDeadline(activity.photosDeadlineAt, deadlineFor(sessions, basis)) : null;
}

// Aberta (planejada ou pendente): sempre. Concluída: até a próxima consulta. Não realizada: nunca.
export function arePhotosOpen(activity: Activity, sessions: Session[], now: Date = new Date()): boolean {
  if (EDITABLE_STATUSES.includes(activity.status)) return true;
  if (activity.status !== 'CONCLUIDA') return false;
  const deadline = photosDeadlineFor(activity, sessions);
  return deadline === null || isBeforeDeadline(deadline, now);
}

// Sem o userId: quem pede já é o dono, ou a terapeuta, que sabe de quem pediu.
export function toPublicActivity(
  activity: ActivityWithPhotos,
  sessions: Session[] = [],
  now: Date = new Date(),
): PublicActivity {
  return {
    id: activity.id,
    name: activity.name,
    activityDate: dateToDateOnly(activity.activityDate),
    status: activity.status,
    wantBefore: activity.wantBefore,
    pleasure: activity.pleasure,
    achievement: activity.achievement,
    observation: activity.observation,
    photos: activity.photos.map((photo) => ({ id: photo.id, createdAt: photo.createdAt.toISOString() })),
    photosDeadline: photosDeadlineFor(activity, sessions),
    photosOpen: arePhotosOpen(activity, sessions, now),
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

// As sessões agendadas desde a conclusão mais antiga, para o prazo das fotos de cada atividade.
// Uma leitura da agenda por pedido, e só se houver alguma concluída.
async function sessionsFor(userId: string, activities: Activity[]): Promise<Session[]> {
  const bases = activities.map(photosBasis).filter((basis): basis is Date => basis !== null);
  if (bases.length === 0) return [];
  const oldest = bases.reduce((a, b) => (a < b ? a : b));
  return scheduledSessionsFrom(await loadAgenda(prisma, userId), todayInAppZone(oldest), todayInAppZone());
}

// Congela o prazo das fotos das concluídas que ainda não têm, na primeira vez que há uma consulta
// pela frente. Escrita condicional, sem mexer no updatedAt: congelar não muda a atividade.
async function freezeMissingDeadlines(activities: Activity[], sessions: Session[]) {
  for (const activity of activities) {
    const basis = photosBasis(activity);
    if (!basis || activity.photosDeadlineAt !== null) continue;
    const deadline = deadlineFor(sessions, basis);
    if (!deadline) continue;
    const at = deadlineInstant(deadline);
    const { count } = await prisma.activity.updateMany({
      where: { id: activity.id, photosDeadlineAt: null, updatedAt: activity.updatedAt },
      data: { photosDeadlineAt: at, updatedAt: activity.updatedAt },
    });
    if (count > 0) activity.photosDeadlineAt = at;
  }
}

// freeze: congela o prazo das fotos que ainda não têm. Só nas leituras e escritas do paciente: a
// leitura da terapeuta não grava nada (regra 1).
async function toPublicActivities(userId: string, activities: ActivityWithPhotos[], freeze = false) {
  const sessions = await sessionsFor(userId, activities);
  if (freeze) await freezeMissingDeadlines(activities, sessions);
  return activities.map((activity) => toPublicActivity(activity, sessions));
}

async function getPublic(userId: string, id: string): Promise<PublicActivity> {
  const [activity] = await toPublicActivities(
    userId,
    [await prisma.activity.findUniqueOrThrow({ where: { id }, include: withPhotos })],
    true,
  );
  return activity!;
}

function photosNotAllowed() {
  return new AppError(409, 'PHOTOS_NOT_ALLOWED', 'Uma atividade que não aconteceu não leva fotos.');
}

function photosClosed() {
  return new AppError(409, 'PHOTOS_CLOSED', 'O prazo para mexer nas fotos desta atividade terminou na consulta.');
}

function photoLimit() {
  return new AppError(409, 'PHOTO_LIMIT', `Cada atividade tem espaço para até ${MAX_PHOTOS} fotos.`);
}

function notFound() {
  return new AppError(404, 'ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a esta atividade.');
}

function futureDateOnCreate() {
  return new AppError(
    400,
    'DATE_IN_FUTURE',
    'Uma atividade concluída precisa ter data de hoje ou de um dia anterior.',
  );
}

function futureDateOnTransition() {
  return new AppError(
    409,
    'DATE_IN_FUTURE',
    'Este dia ainda não chegou. Dá para registrar como foi a partir do dia da atividade.',
  );
}

async function findOwned(userId: string, id: string): Promise<Activity> {
  const activity = await prisma.activity.findUnique({ where: { id } });
  if (!activity) throw notFound();
  if (activity.userId !== userId) throw forbidden();
  return activity;
}

// Explica um update condicional que não alterou nada: outra requisição mudou a atividade
// entre a leitura e a escrita.
async function conflictAfterRace(id: string): Promise<AppError> {
  const current = await prisma.activity.findUnique({ where: { id }, select: { status: true } });
  if (!current) return notFound();
  if (isFinal(current.status)) return activityFinalized();
  return new AppError(
    409,
    'ACTIVITY_CHANGED',
    'Esta atividade mudou enquanto você editava. Atualize a tela e tente de novo.',
  );
}

// Update condicional (DEC-028): só grava se o estado e a data ainda são os que foram
// validados. Duas requisições ao mesmo tempo não conseguem alterar um registro já final.
async function guardedUpdate(
  activity: Activity,
  data: Prisma.ActivityUpdateManyMutationInput,
): Promise<PublicActivity> {
  const { count } = await prisma.activity.updateMany({
    where: { id: activity.id, status: activity.status, activityDate: activity.activityDate },
    data,
  });
  if (count === 0) throw await conflictAfterRace(activity.id);
  return getPublic(activity.userId, activity.id);
}

// As fotos mudam com a atividade aberta e na concluída até a próxima consulta (DEC-103). Mexer nas
// fotos não muda nenhum campo do registro: a concluída continua imutável (regra 2).
async function assertPhotosOpen(userId: string, activity: Activity) {
  if (activity.status === 'NAO_REALIZADA') throw photosNotAllowed();
  const sessions = await sessionsFor(userId, [activity]);
  await freezeMissingDeadlines([activity], sessions);
  if (!arePhotosOpen(activity, sessions)) {
    throw photosClosed();
  }
}

export function createActivitiesService() {
  // freeze: true só quando quem lê é o próprio paciente (a terapeuta usa o padrão).
  async function list(userId: string, { from, to }: ListActivitiesQuery, freeze = false) {
    const activities = await prisma.activity.findMany({
      where: { userId, activityDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      // A SPEC não tem horário: dentro do dia, vale a ordem em que foram registradas.
      orderBy: [{ activityDate: 'asc' }, { createdAt: 'asc' }],
      include: withPhotos,
    });
    return toPublicActivities(userId, activities, freeze);
  }

  async function create(userId: string, input: CreateActivityInput) {
    if (input.status === 'CONCLUIDA' && isFutureDate(input.activityDate, todayInAppZone())) {
      throw futureDateOnCreate();
    }

    const activity = await prisma.activity.create({
      data: {
        ...input,
        userId,
        activityDate: dateOnlyToDate(input.activityDate),
        // Já concluída no registro: o prazo das fotos conta daqui (DEC-103).
        ...(input.status === 'CONCLUIDA' && { completedAt: new Date() }),
      },
    });
    return getPublic(userId, activity.id);
  }

  async function update(userId: string, id: string, input: UpdateActivityInput) {
    const activity = await findOwned(userId, id);
    assertEditable(activity.status);

    // Dar vontade a uma PLANEJADA é a transição "start", não uma edição.
    if (input.wantBefore !== undefined && activity.status !== 'PENDENTE') {
      throw invalidTransition('A vontade só pode ser alterada em uma atividade pendente.');
    }

    return guardedUpdate(activity, {
      name: input.name,
      wantBefore: input.wantBefore,
      activityDate: input.activityDate ? dateOnlyToDate(input.activityDate) : undefined,
    });
  }

  async function transition(
    userId: string,
    id: string,
    name: TransitionName,
    data: Prisma.ActivityUpdateManyMutationInput,
  ) {
    const activity = await findOwned(userId, id);
    assertTransition(activity.status, name);

    const target = TRANSITIONS[name].to;
    if (isFinal(target) && isFutureDate(dateToDateOnly(activity.activityDate), todayInAppZone())) {
      throw futureDateOnTransition();
    }

    return guardedUpdate(activity, { ...data, status: target });
  }

  const start = (userId: string, id: string, input: StartActivityInput) =>
    transition(userId, id, 'start', { wantBefore: input.wantBefore });

  const complete = (userId: string, id: string, input: CompleteActivityInput) =>
    transition(userId, id, 'complete', {
      pleasure: input.pleasure,
      achievement: input.achievement,
      observation: input.observation ?? null,
      completedAt: new Date(),
    });

  const notDone = (userId: string, id: string, input: NotDoneActivityInput) =>
    transition(userId, id, 'notDone', { observation: input.observation ?? null });

  async function remove(userId: string, id: string) {
    const activity = await findOwned(userId, id);
    assertEditable(activity.status);

    // Mesmo cuidado do guardedUpdate: só apaga se ainda não for final.
    const { count } = await prisma.activity.deleteMany({
      where: { id, status: { in: [...EDITABLE_STATUSES] } },
    });
    if (count === 0) throw await conflictAfterRace(id);
  }

  // ——— Fotos (DEC-103) ———

  async function addPhoto(userId: string, id: string, upload: Uint8Array) {
    const activity = await findOwned(userId, id);
    await assertPhotosOpen(userId, activity);
    // Confere os limites antes de tratar a imagem, que é a parte cara; a transação confere de novo.
    if ((await prisma.activityPhoto.count({ where: { activityId: id } })) >= MAX_PHOTOS) throw photoLimit();
    if ((await countAccountPhotos(prisma, userId)) >= MAX_PHOTOS_PER_ACCOUNT) throw accountPhotoLimit();
    // Trata a imagem fora da transação: é a parte demorada.
    const { image, thumbnail } = await processPhoto(upload);
    const photo = await prisma.$transaction(async (tx) => {
      // Trava a conta e depois a atividade, sempre nessa ordem (como na Ação, DEC-074): dois envios
      // ao mesmo tempo, na mesma área ou em áreas diferentes, não passam juntos dos limites.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
      const locked = await tx.$queryRaw<{ status: ActivityStatus; photosDeadlineAt: Date | null }[]>`
        SELECT status, "photosDeadlineAt" FROM "Activity" WHERE id = ${id}::uuid FOR UPDATE`;
      // A atividade (ou a conta) foi apagada enquanto a imagem era tratada.
      if (locked.length === 0) throw notFound();
      // Virou "não realizada", ou a consulta começou, enquanto a imagem era tratada (achado do
      // revisor-seguranca): o prazo já foi congelado no assertPhotosOpen, se havia consulta.
      if (locked[0]!.status === 'NAO_REALIZADA') throw photosNotAllowed();
      if (locked[0]!.status === 'CONCLUIDA' && isPastDeadline(locked[0]!.photosDeadlineAt)) throw photosClosed();
      if ((await tx.activityPhoto.count({ where: { activityId: id } })) >= MAX_PHOTOS) throw photoLimit();
      if ((await countAccountPhotos(tx, userId)) >= MAX_PHOTOS_PER_ACCOUNT) throw accountPhotoLimit();
      return tx.activityPhoto.create({
        data: { activityId: id, image, thumbnail },
        select: { id: true, createdAt: true },
      });
    });
    return { photo: { id: photo.id, createdAt: photo.createdAt.toISOString() }, activity: await getPublic(userId, id) };
  }

  async function removePhoto(userId: string, id: string, photoId: string) {
    const activity = await findOwned(userId, id);
    await assertPhotosOpen(userId, activity);
    const { count } = await prisma.activityPhoto.deleteMany({ where: { id: photoId, activityId: id } });
    if (count === 0) throw photoNotFound();
  }

  // A imagem de uma foto, de uma atividade de `ownerId`: o paciente pede as próprias; a terapeuta,
  // as do paciente com vínculo ativo (conferido antes, na cadeia do prefixo).
  async function photoImage(ownerId: string, activityId: string, photoId: string, size: 'thumb' | 'full') {
    const where = { id: photoId, activityId, activity: { userId: ownerId } };
    const photo =
      size === 'thumb'
        ? await prisma.activityPhoto.findFirst({ where, select: { thumbnail: true } }).then((p) => p?.thumbnail)
        : await prisma.activityPhoto.findFirst({ where, select: { image: true } }).then((p) => p?.image);
    if (!photo) throw photoNotFound();
    return photo;
  }

  // A foto de uma atividade do próprio paciente: atividade de outra pessoa é 403, como no resto.
  async function ownPhotoImage(userId: string, activityId: string, photoId: string, size: 'thumb' | 'full') {
    await findOwned(userId, activityId);
    return photoImage(userId, activityId, photoId, size);
  }

  return {
    list,
    create,
    update,
    start,
    complete,
    notDone,
    remove,
    addPhoto,
    removePhoto,
    photoImage,
    ownPhotoImage,
  };
}

export type ActivitiesService = ReturnType<typeof createActivitiesService>;
