import { AppError } from '../../errors/app-error.js';
import {
  Prisma,
  type Medication,
  type MedicationChange,
  type Symptom,
  type SymptomCheck,
} from '../../generated/prisma/client.js';
import { dateOnlyToDate, dateToDateOnly, daysBetween, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import {
  CHANGES_PER_MEDICATION_MAX,
  CHECKS_PER_SYMPTOM_MAX,
  MEDICATIONS_MAX,
  SYMPTOMS_MAX,
  type ChangeKind,
  type CreateChangeInput,
  type CreateMedicationInput,
  type CreateSymptomInput,
  type UpdateChangeInput,
  type UpdateMedicationInput,
  type UpdateSymptomInput,
} from './medications.schema.js';

// Remédios e o que sinto (DEC-114, #171). Tudo é anotação do paciente: o Faísca guarda o que ele
// conta e nunca avalia remédio nem sintoma. "No começo" ou "com o uso contínuo" é só a conta dos dias
// desde a mudança do remédio, feita na leitura.

type Tx = Prisma.TransactionClient;
type MedicationRow = Medication & { changes: MedicationChange[] };
type SymptomRow = Symptom & { checks: SymptomCheck[] };

function notFound() {
  return new AppError(404, 'NOT_FOUND', 'Registro não encontrado.');
}

function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a este registro.');
}

function futureDate() {
  return new AppError(400, 'DATE_IN_FUTURE', 'Essa data ainda não chegou.');
}

function assertNotFuture(...dates: (string | null | undefined)[]) {
  const today = todayInAppZone();
  if (dates.some((date) => date && date > today)) throw futureDate();
}

// Na ordem da linha do tempo: pela data e, no mesmo dia, pela ordem em que foram anotadas.
function byTimeline(a: Pick<MedicationChange, 'changeDate' | 'createdAt'>, b: Pick<MedicationChange, 'changeDate' | 'createdAt'>) {
  return a.changeDate.getTime() - b.changeDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime();
}

type TimelineItem = { kind: ChangeKind; changeDate: Date; createdAt: Date };

// A linha do tempo precisa fazer sentido: começa com COMECOU; a dose só muda e o remédio só para
// enquanto está em uso; e só volta a começar depois de parar.
export function timelineError(changes: TimelineItem[]): string | null {
  const sorted = [...changes].sort(byTimeline);
  if (sorted.length === 0 || sorted[0]!.kind !== 'COMECOU') {
    return 'A primeira mudança precisa ser o começo do remédio.';
  }
  let active = false;
  for (const change of sorted) {
    if (change.kind === 'COMECOU' && active) return 'O remédio já estava em uso nessa data.';
    if (change.kind !== 'COMECOU' && !active) return 'O remédio não estava em uso nessa data.';
    active = change.kind !== 'PAROU';
  }
  return null;
}

function assertTimeline(changes: TimelineItem[]) {
  const message = timelineError(changes);
  if (message) throw new AppError(409, 'MEDICATION_TIMELINE_INVALID', message);
}

// O estado do remédio num dia (até ele, inclusive): em uso, a dose e a última mudança.
export function stateOn(changes: MedicationChange[], date?: string) {
  const until = date ? dateOnlyToDate(date).getTime() : Infinity;
  const sorted = [...changes].sort(byTimeline).filter((change) => change.changeDate.getTime() <= until);
  let dose: string | null = null;
  for (const change of sorted) if (change.kind !== 'PAROU') dose = change.dose;
  const last = sorted.at(-1) ?? null;
  return { active: last !== null && last.kind !== 'PAROU', dose, last };
}

function toPublicChange(change: MedicationChange) {
  return {
    id: change.id,
    kind: change.kind,
    changeDate: dateToDateOnly(change.changeDate),
    dose: change.dose,
    note: change.note,
  };
}

function toPublicMedication(row: MedicationRow) {
  const changes = [...row.changes].sort(byTimeline);
  const { active, dose, last } = stateOn(changes);
  return {
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    dose: active ? dose : null,
    active,
    // Pela API há sempre o COMECOU; um remédio gravado sem mudanças (direto no banco) não quebra a lista.
    startedOn: changes[0] ? dateToDateOnly(changes[0].changeDate) : null,
    stoppedOn: !active && last ? dateToDateOnly(last.changeDate) : null,
    changes: changes.map(toPublicChange),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Há quantos dias da mudança do remédio ligado o sintoma começou: "5 dias depois de mudar a dose".
// Sem remédio ligado, ou se o sintoma começou antes do remédio, null.
export function sinceChange(symptom: Pick<Symptom, 'startedOn' | 'medicationId'>, medications: MedicationRow[]) {
  const medication = medications.find((row) => row.id === symptom.medicationId);
  if (!medication) return null;
  const started = dateToDateOnly(symptom.startedOn);
  const { last } = stateOn(medication.changes, started);
  if (!last) return null;
  const date = dateToDateOnly(last.changeDate);
  return { medicationId: medication.id, kind: last.kind, date, days: daysBetween(date, started) };
}

function toPublicSymptom(row: SymptomRow, medications: MedicationRow[]) {
  return {
    id: row.id,
    description: row.description,
    startedOn: dateToDateOnly(row.startedOn),
    endedOn: row.endedOn ? dateToDateOnly(row.endedOn) : null,
    medicationId: row.medicationId,
    note: row.note,
    sinceChange: sinceChange(row, medications),
    checks: [...row.checks]
      .sort((a, b) => a.checkedOn.getTime() - b.checkedOn.getTime())
      .map((check) => ({ date: dateToDateOnly(check.checkedOn), intensity: check.intensity })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type PublicMedication = ReturnType<typeof toPublicMedication>;
export type PublicSymptom = ReturnType<typeof toPublicSymptom>;

// Trava a conta durante a escrita: dois envios ao mesmo tempo não passam juntos do teto.
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
}

function limitReached(code: string, message: string) {
  return new AppError(409, code, message);
}

async function ownedMedication(tx: Tx, userId: string, id: string): Promise<MedicationRow> {
  const row = await tx.medication.findUnique({ where: { id }, include: { changes: true } });
  if (!row) throw notFound();
  if (row.userId !== userId) throw forbidden();
  return row;
}

async function ownedSymptom(tx: Tx, userId: string, id: string): Promise<SymptomRow> {
  const row = await tx.symptom.findUnique({ where: { id }, include: { checks: true } });
  if (!row) throw notFound();
  if (row.userId !== userId) throw forbidden();
  return row;
}

// O sintoma só pode ser ligado a um remédio da própria pessoa.
async function assertOwnMedication(tx: Tx, userId: string, medicationId: string | null | undefined) {
  if (medicationId) await ownedMedication(tx, userId, medicationId);
}

// As intensidades anotadas precisam caber entre o começo e o fim do sintoma.
function assertChecksInside(checks: SymptomCheck[], startedOn: string, endedOn: string | null) {
  const outside = checks.some((check) => {
    const date = dateToDateOnly(check.checkedOn);
    return date < startedOn || (endedOn !== null && date > endedOn);
  });
  if (outside) {
    throw new AppError(409, 'SYMPTOM_CHECKS_OUTSIDE', 'Há anotações de "como está" fora dessas datas.');
  }
}

function assertEndAfterStart(startedOn: string, endedOn: string | null) {
  if (endedOn !== null && endedOn < startedOn) {
    throw new AppError(400, 'SYMPTOM_END_BEFORE_START', 'O fim precisa ser depois do começo.');
  }
}

async function loadAll(userId: string) {
  const [medications, symptoms] = await Promise.all([
    prisma.medication.findMany({ where: { userId }, include: { changes: true } }),
    prisma.symptom.findMany({ where: { userId }, include: { checks: true } }),
  ]);
  return { medications, symptoms };
}

// Em uso primeiro; dentro de cada grupo, o mais recente primeiro.
function sortMedications(list: PublicMedication[]) {
  return list.sort(
    (a, b) => Number(b.active) - Number(a.active) || (b.startedOn ?? '').localeCompare(a.startedOn ?? '') || a.name.localeCompare(b.name),
  );
}

function sortSymptoms(list: PublicSymptom[]) {
  return list.sort(
    (a, b) => Number(a.endedOn !== null) - Number(b.endedOn !== null) || b.startedOn.localeCompare(a.startedOn),
  );
}

export function createMedicationsService() {
  // Tudo de uma vez: os tetos mantêm a lista pequena. Serve ao paciente e à profissional.
  async function list(userId: string) {
    const { medications, symptoms } = await loadAll(userId);
    return {
      medications: sortMedications(medications.map(toPublicMedication)),
      symptoms: sortSymptoms(symptoms.map((row) => toPublicSymptom(row, medications))),
    };
  }

  async function settings(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { listsMedications: true } });
    return { listsMedications: user.listsMedications };
  }

  async function updateSettings(userId: string, listsMedications: boolean) {
    await prisma.user.update({ where: { id: userId }, data: { listsMedications } });
    return { listsMedications };
  }

  async function createMedication(userId: string, input: CreateMedicationInput) {
    assertNotFuture(input.startedOn);
    const row = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      if ((await tx.medication.count({ where: { userId } })) >= MEDICATIONS_MAX) {
        throw limitReached('MEDICATIONS_LIMIT', `Dá para anotar até ${MEDICATIONS_MAX} remédios.`);
      }
      return tx.medication.create({
        data: {
          userId,
          name: input.name,
          schedule: input.schedule ?? null,
          changes: { create: { kind: 'COMECOU', changeDate: dateOnlyToDate(input.startedOn), dose: input.dose ?? null } },
        },
        include: { changes: true },
      });
    });
    return toPublicMedication(row);
  }

  async function updateMedication(userId: string, id: string, input: UpdateMedicationInput) {
    const row = await prisma.$transaction(async (tx) => {
      await ownedMedication(tx, userId, id);
      return tx.medication.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.schedule !== undefined && { schedule: input.schedule }),
        },
        include: { changes: true },
      });
    });
    return toPublicMedication(row);
  }

  // Apaga o remédio e as mudanças; os sintomas ligados continuam, só sem a ligação.
  async function removeMedication(userId: string, id: string) {
    await prisma.$transaction(async (tx) => {
      await ownedMedication(tx, userId, id);
      await tx.medication.delete({ where: { id } });
    });
  }

  // Grava a mudança só se a linha do tempo continuar fazendo sentido.
  async function addChange(userId: string, id: string, input: CreateChangeInput) {
    assertNotFuture(input.changeDate);
    const row = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const medication = await ownedMedication(tx, userId, id);
      if (medication.changes.length >= CHANGES_PER_MEDICATION_MAX) {
        throw limitReached('MEDICATION_CHANGES_LIMIT', `Dá para anotar até ${CHANGES_PER_MEDICATION_MAX} mudanças em cada remédio.`);
      }
      const changeDate = dateOnlyToDate(input.changeDate);
      assertTimeline([...medication.changes, { kind: input.kind, changeDate, createdAt: new Date() }]);
      await tx.medicationChange.create({
        data: {
          medicationId: id,
          kind: input.kind,
          changeDate,
          dose: input.kind === 'PAROU' ? null : (input.dose ?? null),
          note: input.note ?? null,
        },
      });
      // A mudança conta como mudança do remédio (updatedAt).
      return tx.medication.update({ where: { id }, data: { updatedAt: new Date() }, include: { changes: true } });
    });
    return toPublicMedication(row);
  }

  async function updateChange(userId: string, id: string, changeId: string, input: UpdateChangeInput) {
    if (input.changeDate) assertNotFuture(input.changeDate);
    const row = await prisma.$transaction(async (tx) => {
      // Trava a conta: duas edições ao mesmo tempo não deixam a linha do tempo sem sentido.
      await lockUser(tx, userId);
      const medication = await ownedMedication(tx, userId, id);
      const change = medication.changes.find((item) => item.id === changeId);
      if (!change) throw notFound();
      if (change.kind === 'PAROU' && input.dose) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Quem parou não tem dose.');
      }
      if (change.kind === 'MUDOU_DOSE' && input.dose === null) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Informe a dose nova.');
      }
      const changeDate = input.changeDate ? dateOnlyToDate(input.changeDate) : change.changeDate;
      assertTimeline(medication.changes.map((item) => (item.id === changeId ? { ...item, changeDate } : item)));
      await tx.medicationChange.update({
        where: { id: changeId },
        data: {
          changeDate,
          ...(input.dose !== undefined && { dose: input.dose }),
          ...(input.note !== undefined && { note: input.note }),
        },
      });
      return tx.medication.update({ where: { id }, data: { updatedAt: new Date() }, include: { changes: true } });
    });
    return toPublicMedication(row);
  }

  async function removeChange(userId: string, id: string, changeId: string) {
    const row = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const medication = await ownedMedication(tx, userId, id);
      if (!medication.changes.some((item) => item.id === changeId)) throw notFound();
      const rest = medication.changes.filter((item) => item.id !== changeId);
      if (rest.length === 0) {
        throw new AppError(409, 'MEDICATION_TIMELINE_INVALID', 'O remédio precisa de um começo. Para tirar tudo, apague o remédio.');
      }
      assertTimeline(rest);
      await tx.medicationChange.delete({ where: { id: changeId } });
      return tx.medication.update({ where: { id }, data: { updatedAt: new Date() }, include: { changes: true } });
    });
    return toPublicMedication(row);
  }

  async function toPublicSymptomOf(userId: string, row: SymptomRow) {
    const medications = row.medicationId
      ? await prisma.medication.findMany({ where: { userId, id: row.medicationId }, include: { changes: true } })
      : [];
    return toPublicSymptom(row, medications);
  }

  async function createSymptom(userId: string, input: CreateSymptomInput) {
    assertNotFuture(input.startedOn);
    const row = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      if ((await tx.symptom.count({ where: { userId } })) >= SYMPTOMS_MAX) {
        throw limitReached('SYMPTOMS_LIMIT', `Dá para anotar até ${SYMPTOMS_MAX} sintomas.`);
      }
      await assertOwnMedication(tx, userId, input.medicationId);
      const startedOn = dateOnlyToDate(input.startedOn);
      return tx.symptom.create({
        data: {
          userId,
          description: input.description,
          startedOn,
          medicationId: input.medicationId ?? null,
          note: input.note ?? null,
          ...(input.intensity !== null &&
            input.intensity !== undefined && { checks: { create: { checkedOn: startedOn, intensity: input.intensity } } }),
        },
        include: { checks: true },
      });
    });
    return toPublicSymptomOf(userId, row);
  }

  async function updateSymptom(userId: string, id: string, input: UpdateSymptomInput) {
    assertNotFuture(input.startedOn, input.endedOn);
    const row = await prisma.$transaction(async (tx) => {
      // Trava a conta, como o "como está": as anotações não ficam fora do período por corrida.
      await lockUser(tx, userId);
      const current = await ownedSymptom(tx, userId, id);
      await assertOwnMedication(tx, userId, input.medicationId);
      const startedOn = input.startedOn ?? dateToDateOnly(current.startedOn);
      const endedOn =
        input.endedOn !== undefined ? input.endedOn : current.endedOn ? dateToDateOnly(current.endedOn) : null;
      assertEndAfterStart(startedOn, endedOn);
      assertChecksInside(current.checks, startedOn, endedOn);
      return tx.symptom.update({
        where: { id },
        data: {
          ...(input.description !== undefined && { description: input.description }),
          startedOn: dateOnlyToDate(startedOn),
          endedOn: endedOn ? dateOnlyToDate(endedOn) : null,
          ...(input.medicationId !== undefined && { medicationId: input.medicationId }),
          ...(input.note !== undefined && { note: input.note }),
        },
        include: { checks: true },
      });
    });
    return toPublicSymptomOf(userId, row);
  }

  async function removeSymptom(userId: string, id: string) {
    await prisma.$transaction(async (tx) => {
      await ownedSymptom(tx, userId, id);
      await tx.symptom.delete({ where: { id } });
    });
  }

  // "Como está agora" num dia: cria ou troca a intensidade daquele dia, dentro do período do sintoma.
  async function saveCheck(userId: string, id: string, date: string, intensity: number) {
    assertNotFuture(date);
    const row = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const symptom = await ownedSymptom(tx, userId, id);
      const endedOn = symptom.endedOn ? dateToDateOnly(symptom.endedOn) : null;
      if (date < dateToDateOnly(symptom.startedOn) || (endedOn !== null && date > endedOn)) {
        throw new AppError(400, 'CHECK_OUTSIDE_SYMPTOM', 'Esse dia fica fora do período do sintoma.');
      }
      const checkedOn = dateOnlyToDate(date);
      const exists = symptom.checks.some((check) => check.checkedOn.getTime() === checkedOn.getTime());
      if (!exists && symptom.checks.length >= CHECKS_PER_SYMPTOM_MAX) {
        throw limitReached('SYMPTOM_CHECKS_LIMIT', `Dá para anotar até ${CHECKS_PER_SYMPTOM_MAX} dias em cada sintoma.`);
      }
      // A conta está travada: não há dois envios do mesmo dia correndo juntos.
      await tx.symptomCheck.upsert({
        where: { symptomId_checkedOn: { symptomId: id, checkedOn } },
        create: { symptomId: id, checkedOn, intensity },
        update: { intensity },
      });
      return tx.symptom.update({ where: { id }, data: { updatedAt: new Date() }, include: { checks: true } });
    });
    return toPublicSymptomOf(userId, row);
  }

  async function removeCheck(userId: string, id: string, date: string) {
    const row = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const symptom = await ownedSymptom(tx, userId, id);
      const checkedOn = dateOnlyToDate(date);
      if (!symptom.checks.some((check) => check.checkedOn.getTime() === checkedOn.getTime())) throw notFound();
      await tx.symptomCheck.delete({ where: { symptomId_checkedOn: { symptomId: id, checkedOn } } });
      return tx.symptom.update({ where: { id }, data: { updatedAt: new Date() }, include: { checks: true } });
    });
    return toPublicSymptomOf(userId, row);
  }

  return {
    list,
    settings,
    updateSettings,
    createMedication,
    updateMedication,
    removeMedication,
    addChange,
    updateChange,
    removeChange,
    createSymptom,
    updateSymptom,
    removeSymptom,
    saveCheck,
    removeCheck,
  };
}

// Resumo do período (DEC-100), na caixa Remédios: só números e datas, sem o nome do remédio nem o
// texto do sintoma. Os dias com mudança, começo de sintoma ou "como está" contam como dias com registro.
// Cada consulta já filtra o período no banco, para não carregar a lista inteira (achado do
// revisor-seguranca).
export async function medicationsStats(userId: string, range: { from: string; to: string }, days: Set<string>) {
  const period = { gte: dateOnlyToDate(range.from), lte: dateOnlyToDate(range.to) };
  const [changes, checks, started, endedSymptoms, untilEnd] = await Promise.all([
    prisma.medicationChange.findMany({
      where: { medication: { userId }, changeDate: period },
      select: { changeDate: true, kind: true, createdAt: true },
    }),
    prisma.symptomCheck.findMany({
      where: { symptom: { userId }, checkedOn: period },
      select: { checkedOn: true, intensity: true },
    }),
    prisma.symptom.findMany({ where: { userId, startedOn: period }, select: { startedOn: true } }),
    prisma.symptom.count({ where: { userId, endedOn: period } }),
    // Para saber o que estava em uso no fim do período: as mudanças até ele (no máximo 50 x 100).
    prisma.medicationChange.findMany({
      where: { medication: { userId }, changeDate: { lte: period.lte } },
      select: { medicationId: true, kind: true, changeDate: true, createdAt: true },
    }),
  ]);

  const lastByMedication = new Map<string, (typeof untilEnd)[number]>();
  for (const change of [...untilEnd].sort(byTimeline)) lastByMedication.set(change.medicationId, change);

  const timeline = [...changes].sort(byTimeline).map((change) => ({ date: dateToDateOnly(change.changeDate), kind: change.kind }));
  timeline.forEach((change) => days.add(change.date));
  started.forEach((row) => days.add(dateToDateOnly(row.startedOn)));
  checks.forEach((check) => days.add(dateToDateOnly(check.checkedOn)));

  return {
    activeMedications: [...lastByMedication.values()].filter((change) => change.kind !== 'PAROU').length,
    changes: timeline,
    newSymptoms: started.length,
    endedSymptoms,
    maxIntensity: checks.length > 0 ? Math.max(...checks.map((check) => check.intensity)) : null,
  };
}
