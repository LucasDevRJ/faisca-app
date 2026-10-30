import { AppError } from '../../errors/app-error.js';
import type { BehavioralAction, Prisma } from '../../generated/prisma/client.js';
import { addDays, dateOnlyToDate, dateToDateOnly, todayInAppZone } from '../../lib/dates.js';
import { processImage } from '../../lib/images.js';
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
  CreateActionInput,
  EvaluateActionInput,
  ListActionsQuery,
  NotDoneActionInput,
  UpdateActionInput,
} from './actions.schema.js';

// Ação (SPEC, "Ação"; DEC-051).

// Planejar vai de hoje até 7 dias à frente; registrar algo já feito, até 7 dias atrás.
export const PLAN_AHEAD_DAYS = 7;
export const RECORD_BACK_DAYS = 7;

export type PublicAction = {
  id: string;
  actionDate: string;
  name: string;
  category: BehavioralAction['category'];
  status: BehavioralAction['status'];
  expectation: number;
  pleasure: number | null;
  achievement: number | null;
  observation: string | null;
  // Fotos da ação avaliada (DEC-064), da mais antiga para a mais nova; as imagens vêm por rota própria.
  photos: { id: string; createdAt: string }[];
  // A próxima consulta depois da avaliação, que fecha o prazo das fotos; null sem consulta marcada.
  photosDeadline: AlternativeDeadline | null;
  // Dá para adicionar ou remover fotos agora: avaliada e antes do prazo (sem prazo, sempre).
  photosOpen: boolean;
  createdAt: string;
  updatedAt: string;
};

// Fotos (DEC-064): até 10 por ação; a grande cabe em 2560 px e a miniatura é um quadrado de 400 px.
export const MAX_PHOTOS = 10;
// Teto por conta (DEC-074): o limite por ação não segura quem cria ações sem fim, e cada foto
// ocupa o banco. 300 são 30 ações cheias.
export const MAX_PHOTOS_PER_ACCOUNT = 300;
// Câmeras de celular de até 50 MP; a fila de lib/images.ts trata uma foto por vez na API toda.
const PHOTO_MAX_PIXELS = 50_000_000;
const PHOTO_OUTPUTS = [
  { width: 2560, height: 2560, fit: 'inside' as const, quality: 85 },
  { width: 400, height: 400, fit: 'cover' as const, quality: 75 },
];

type PhotoRef = { id: string; createdAt: Date };
export type ActionWithPhotos = BehavioralAction & { photos: PhotoRef[] };

// Para as consultas trazerem as fotos (só id e data, sem as imagens) na ordem certa.
const withPhotos = { photos: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } } };

// A partir de quando conta o prazo das fotos: a avaliação. As avaliadas antes do evaluatedAt
// existir usam o updatedAt, preenchido igual na migration.
function photosBasis(action: BehavioralAction): Date | null {
  if (action.status !== 'AVALIADA') return null;
  return action.evaluatedAt ?? action.updatedAt;
}

// Funções puras, para testar as bordas sem banco. Vale o que vier primeiro: o prazo congelado ou a
// consulta pela agenda de agora (como no RPD, DEC-054).
export function photosDeadlineFor(action: BehavioralAction, sessions: Session[]): AlternativeDeadline | null {
  const basis = photosBasis(action);
  return basis ? effectiveDeadline(action.photosDeadlineAt, deadlineFor(sessions, basis)) : null;
}

export function arePhotosOpen(action: BehavioralAction, sessions: Session[], now: Date = new Date()): boolean {
  if (action.status !== 'AVALIADA') return false;
  const deadline = photosDeadlineFor(action, sessions);
  return deadline === null || isBeforeDeadline(deadline, now);
}

// Sem o userId: quem pede já é o dono, ou a terapeuta, que sabe de quem pediu.
export function toPublicAction(action: ActionWithPhotos, sessions: Session[] = [], now: Date = new Date()): PublicAction {
  return {
    id: action.id,
    actionDate: dateToDateOnly(action.actionDate),
    name: action.name,
    category: action.category,
    status: action.status,
    expectation: action.expectation,
    pleasure: action.pleasure,
    achievement: action.achievement,
    observation: action.observation,
    photos: action.photos.map((photo) => ({ id: photo.id, createdAt: photo.createdAt.toISOString() })),
    photosDeadline: photosDeadlineFor(action, sessions),
    photosOpen: arePhotosOpen(action, sessions, now),
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}

// As sessões agendadas desde a avaliação mais antiga, para o prazo das fotos de cada ação. Uma
// leitura da agenda por pedido, e só se houver alguma avaliada.
async function sessionsFor(userId: string, actions: BehavioralAction[]): Promise<Session[]> {
  const bases = actions.map(photosBasis).filter((basis): basis is Date => basis !== null);
  if (bases.length === 0) return [];
  const oldest = bases.reduce((a, b) => (a < b ? a : b));
  return scheduledSessionsFrom(await loadAgenda(prisma, userId), todayInAppZone(oldest), todayInAppZone());
}

// freeze: congela o prazo das fotos que ainda não têm. Só na leitura e nas escritas do paciente: a
// leitura da terapeuta não grava nada (regra 1).
async function toPublicActions(userId: string, actions: ActionWithPhotos[], freeze = false): Promise<PublicAction[]> {
  const sessions = await sessionsFor(userId, actions);
  if (freeze) await freezeMissingDeadlines(actions, sessions);
  return actions.map((action) => toPublicAction(action, sessions));
}

// Congela o prazo das fotos das avaliadas que ainda não têm, na primeira vez que há uma consulta
// pela frente. Escrita condicional, sem mexer no updatedAt: congelar não muda a ação, e o Lido da
// terapeuta compara com o updatedAt (DEC-057). Se a ação mudou no meio, fica para a próxima leitura.
async function freezeMissingDeadlines(actions: ActionWithPhotos[], sessions: Session[]) {
  for (const action of actions) {
    const basis = photosBasis(action);
    if (!basis || action.photosDeadlineAt !== null) continue;
    const deadline = deadlineFor(sessions, basis);
    if (!deadline) continue;
    const at = deadlineInstant(deadline);
    const { count } = await prisma.behavioralAction.updateMany({
      where: { id: action.id, photosDeadlineAt: null, updatedAt: action.updatedAt },
      data: { photosDeadlineAt: at, updatedAt: action.updatedAt },
    });
    if (count > 0) action.photosDeadlineAt = at;
  }
}

function photoLimit() {
  return new AppError(409, 'PHOTO_LIMIT', `Cada ação tem espaço para até ${MAX_PHOTOS} fotos.`);
}

function accountPhotoLimit() {
  return new AppError(
    409,
    'ACCOUNT_PHOTO_LIMIT',
    `Sua conta chegou ao limite de ${MAX_PHOTOS_PER_ACCOUNT} fotos. Para adicionar outra, remova uma foto de alguma ação que ainda esteja no prazo.`,
  );
}

function photoNotFound() {
  return new AppError(404, 'PHOTO_NOT_FOUND', 'Foto não encontrada.');
}

function notFound() {
  return new AppError(404, 'ACTION_NOT_FOUND', 'Ação não encontrada.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a esta ação.');
}

// Avaliada e não realizada são finais, como as atividades concluídas (DEC-051): 409, e não 403.
function finalized() {
  return new AppError(409, 'ACTION_FINALIZED', 'Esta ação já foi avaliada ou marcada como não realizada.');
}

// Planejar: de hoje até PLAN_AHEAD_DAYS à frente. Funções puras, para testar as bordas sem banco.
export function planDateError(date: string, today: string): string | null {
  if (date < today) return 'Planeje para hoje ou para um dia que ainda vai chegar.';
  if (date > addDays(today, PLAN_AHEAD_DAYS)) return `Planeje para até ${PLAN_AHEAD_DAYS} dias à frente.`;
  return null;
}

// Registrar o que já foi feito: de RECORD_BACK_DAYS atrás até hoje.
export function recordDateError(date: string, today: string): string | null {
  if (date > today) return 'O que já foi feito precisa ser de hoje ou de um dia anterior.';
  if (date < addDays(today, -RECORD_BACK_DAYS)) {
    return `Dá para registrar o que foi feito nos últimos ${RECORD_BACK_DAYS} dias.`;
  }
  return null;
}

function assertDate(error: string | null) {
  if (error) throw new AppError(400, 'DATE_OUT_OF_RANGE', error);
}

async function findOwned(userId: string, id: string): Promise<BehavioralAction> {
  const action = await prisma.behavioralAction.findUnique({ where: { id } });
  if (!action) throw notFound();
  if (action.userId !== userId) throw forbidden();
  return action;
}

async function findPlanned(userId: string, id: string): Promise<BehavioralAction> {
  const action = await findOwned(userId, id);
  if (action.status !== 'PLANEJADA') throw finalized();
  return action;
}

// Avaliar ou marcar como não realizada: só a partir do dia da ação.
function assertDayArrived(action: BehavioralAction) {
  if (dateToDateOnly(action.actionDate) > todayInAppZone()) {
    throw new AppError(400, 'ACTION_NOT_YET', 'Dá para contar como foi a partir do dia da ação.');
  }
}

// Explica uma escrita condicional que não alterou nada.
async function conflictAfterRace(id: string): Promise<AppError> {
  const exists = await prisma.behavioralAction.findUnique({ where: { id }, select: { id: true } });
  return exists ? finalized() : notFound();
}

// Escrita condicional: só vale se a ação ainda está planejada no momento em que grava. O userId
// repete a conferência do findOwned: segunda linha de defesa da regra 1.
async function writePlanned(userId: string, id: string, data: Prisma.BehavioralActionUpdateManyMutationInput) {
  const { count } = await prisma.behavioralAction.updateMany({ where: { id, userId, status: 'PLANEJADA' }, data });
  if (count === 0) throw await conflictAfterRace(id);
  const [action] = await toPublicActions(
    userId,
    [await prisma.behavioralAction.findUniqueOrThrow({ where: { id }, include: withPhotos })],
    true,
  );
  return action!;
}

// As fotos só mudam na ação avaliada e antes do prazo (a próxima consulta depois da avaliação).
async function assertPhotosOpen(userId: string, action: BehavioralAction) {
  if (action.status !== 'AVALIADA') {
    throw new AppError(409, 'PHOTOS_NOT_ALLOWED', 'As fotos entram depois de contar como foi a ação.');
  }
  const withPhotoRefs = { ...action, photos: [] };
  const sessions = await sessionsFor(userId, [action]);
  await freezeMissingDeadlines([withPhotoRefs], sessions);
  if (!arePhotosOpen(withPhotoRefs, sessions)) {
    throw new AppError(409, 'PHOTOS_CLOSED', 'O prazo para mexer nas fotos desta ação terminou na consulta.');
  }
}

// A foto nova (ou removida) conta como mudança da ação: a terapeuta que já a leu vê "atualizado"
// (DEC-057). Dentro da transação que mexe na foto.
function touchAction(tx: Prisma.TransactionClient, id: string) {
  return tx.behavioralAction.update({ where: { id }, data: { updatedAt: new Date() } });
}

export function createActionsService() {
  // freeze: true só quando quem lê é o próprio paciente (a terapeuta usa o padrão).
  async function list(userId: string, { from, to }: ListActionsQuery, freeze = false) {
    const actions = await prisma.behavioralAction.findMany({
      where: { userId, actionDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      orderBy: [{ actionDate: 'asc' }, { createdAt: 'asc' }],
      include: withPhotos,
    });
    return toPublicActions(userId, actions, freeze);
  }

  async function get(userId: string, id: string) {
    await findOwned(userId, id);
    const [action] = await toPublicActions(
      userId,
      [await prisma.behavioralAction.findUniqueOrThrow({ where: { id }, include: withPhotos })],
      true,
    );
    return action!;
  }

  async function create(userId: string, input: CreateActionInput) {
    const today = todayInAppZone();
    assertDate(
      input.status === 'PLANEJADA' ? planDateError(input.actionDate, today) : recordDateError(input.actionDate, today),
    );
    const { actionDate, ...rest } = input;
    const action = await prisma.behavioralAction.create({
      // Registrar algo já feito já nasce avaliado: o prazo das fotos conta daqui (DEC-064).
      data: {
        ...rest,
        userId,
        actionDate: dateOnlyToDate(actionDate),
        evaluatedAt: rest.status === 'AVALIADA' ? new Date() : null,
      },
      include: withPhotos,
    });
    const [created] = await toPublicActions(userId, [action], true);
    return created!;
  }

  async function update(userId: string, id: string, input: UpdateActionInput) {
    const action = await findPlanned(userId, id);
    // Mudar o dia segue a janela de planejar; mudar só o resto vale mesmo com o dia já passado.
    if (input.actionDate !== undefined && input.actionDate !== dateToDateOnly(action.actionDate)) {
      assertDate(planDateError(input.actionDate, todayInAppZone()));
    }
    const { actionDate, ...rest } = input;
    return writePlanned(userId, id, { ...rest, actionDate: actionDate ? dateOnlyToDate(actionDate) : undefined });
  }

  async function evaluate(userId: string, id: string, input: EvaluateActionInput) {
    assertDayArrived(await findPlanned(userId, id));
    return writePlanned(userId, id, {
      status: 'AVALIADA',
      evaluatedAt: new Date(),
      pleasure: input.pleasure,
      achievement: input.achievement,
      observation: input.observation ?? null,
    });
  }

  async function notDone(userId: string, id: string, input: NotDoneActionInput) {
    assertDayArrived(await findPlanned(userId, id));
    return writePlanned(userId, id, { status: 'NAO_REALIZADA', observation: input.observation ?? null });
  }

  async function remove(userId: string, id: string) {
    await findPlanned(userId, id);
    const { count } = await prisma.behavioralAction.deleteMany({ where: { id, userId, status: 'PLANEJADA' } });
    if (count === 0) throw await conflictAfterRace(id);
  }

  // Ações escolhidas por id, de qualquer data, na ordem da lista (visão "Não lidos", DEC-057).
  async function listByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const actions = await prisma.behavioralAction.findMany({
      where: { userId, id: { in: ids } },
      orderBy: [{ actionDate: 'asc' }, { createdAt: 'asc' }],
      include: withPhotos,
    });
    return toPublicActions(userId, actions);
  }

  // ——— Fotos (DEC-064) ———

  async function addPhoto(userId: string, id: string, upload: Uint8Array) {
    const action = await findOwned(userId, id);
    await assertPhotosOpen(userId, action);
    // Confere o limite antes de tratar a imagem, que é a parte cara; a transação confere de novo.
    if ((await prisma.actionPhoto.count({ where: { actionId: id } })) >= MAX_PHOTOS) throw photoLimit();
    if ((await prisma.actionPhoto.count({ where: { action: { userId } } })) >= MAX_PHOTOS_PER_ACCOUNT) {
      throw accountPhotoLimit();
    }
    // Trata a imagem fora da transação: é a parte demorada.
    const [image, thumbnail] = await processImage(upload, PHOTO_MAX_PIXELS, PHOTO_OUTPUTS);
    const photo = await prisma.$transaction(async (tx) => {
      // Trava a conta e depois a ação, sempre nessa ordem: dois envios ao mesmo tempo, na mesma
      // ação ou em ações diferentes, não passam juntos dos limites. NO KEY: não segura quem só
      // grava em outra tabela que aponta para a conta.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "BehavioralAction" WHERE id = ${id}::uuid FOR UPDATE`;
      // A ação (ou a conta) foi apagada enquanto a imagem era tratada.
      if (locked.length === 0) throw notFound();
      if ((await tx.actionPhoto.count({ where: { actionId: id } })) >= MAX_PHOTOS) {
        throw photoLimit();
      }
      if ((await tx.actionPhoto.count({ where: { action: { userId } } })) >= MAX_PHOTOS_PER_ACCOUNT) {
        throw accountPhotoLimit();
      }
      const created = await tx.actionPhoto.create({
        data: { actionId: id, image: new Uint8Array(image!), thumbnail: new Uint8Array(thumbnail!) },
        select: { id: true, createdAt: true },
      });
      await touchAction(tx, id);
      return created;
    });
    return { photo: { id: photo.id, createdAt: photo.createdAt.toISOString() }, action: await get(userId, id) };
  }

  async function removePhoto(userId: string, id: string, photoId: string) {
    const action = await findOwned(userId, id);
    await assertPhotosOpen(userId, action);
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.actionPhoto.deleteMany({ where: { id: photoId, actionId: id } });
      if (count === 0) throw photoNotFound();
      await touchAction(tx, id);
    });
  }

  // A imagem de uma foto, de uma ação de `ownerId`: o paciente pede as próprias; a terapeuta, as
  // do paciente com vínculo ativo (conferido antes, na cadeia do prefixo).
  async function photoImage(ownerId: string, actionId: string, photoId: string, size: 'thumb' | 'full') {
    const where = { id: photoId, actionId, action: { userId: ownerId } };
    const photo =
      size === 'thumb'
        ? await prisma.actionPhoto.findFirst({ where, select: { thumbnail: true } }).then((p) => p?.thumbnail)
        : await prisma.actionPhoto.findFirst({ where, select: { image: true } }).then((p) => p?.image);
    if (!photo) throw photoNotFound();
    return photo;
  }

  // A foto de uma ação do próprio paciente: ação de outra pessoa é 403, como no resto da Ação.
  async function ownPhotoImage(userId: string, actionId: string, photoId: string, size: 'thumb' | 'full') {
    await findOwned(userId, actionId);
    return photoImage(userId, actionId, photoId, size);
  }

  return {
    list,
    listByIds,
    get,
    create,
    update,
    evaluate,
    notDone,
    remove,
    addPhoto,
    removePhoto,
    photoImage,
    ownPhotoImage,
  };
}

export type ActionsService = ReturnType<typeof createActionsService>;
