import { AppError } from '../../errors/app-error.js';
import { Prisma, type DailyCheckIn, type SharedArea } from '../../generated/prisma/client.js';
import {
  addDays,
  dateOnlyToDate,
  dateToDateOnly,
  dateToTimeOnly,
  timeOnlyToDate,
  todayInAppZone,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { removeRecordLinks } from '../record-links/record-links.cleanup.js';
import { CHECK_IN_WINDOW_DAYS, type CheckInInput } from './daily-check-ins.schema.js';

// Sono, humor e remédio (DEC-107). Um registro por dia; a noite pertence ao dia em que a pessoa
// acordou. O paciente registra e edita só os últimos 7 dias.

type Range = { from: string; to: string };

const MINUTES_PER_DAY = 24 * 60;

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

// Minutos de sono entre deitar e acordar. Deitar depois de acordar no relógio quer dizer que a
// noite passou da meia-noite (23:30 → 07:00 = 7h30).
export function sleepMinutes(bedTime: string, wakeTime: string): number {
  const diff = minutesOf(wakeTime) - minutesOf(bedTime);
  return diff > 0 ? diff : diff + MINUTES_PER_DAY;
}

// O primeiro dia que ainda dá para registrar ou editar.
export function firstEditableDay(today = todayInAppZone()): string {
  return addDays(today, -(CHECK_IN_WINDOW_DAYS - 1));
}

function isEditable(date: string, today: string): boolean {
  return date >= firstEditableDay(today) && date <= today;
}

function toPublicCheckIn(row: DailyCheckIn, today: string) {
  const date = dateToDateOnly(row.checkInDate);
  const bedTime = row.bedTime ? dateToTimeOnly(row.bedTime) : null;
  const wakeTime = row.wakeTime ? dateToTimeOnly(row.wakeTime) : null;
  return {
    date,
    bedTime,
    wakeTime,
    sleepMinutes: bedTime && wakeTime ? sleepMinutes(bedTime, wakeTime) : null,
    sleepQuality: row.sleepQuality,
    mood: row.mood,
    moodWord: row.moodWord,
    medication: row.medication,
    editable: isEditable(date, today),
  };
}

export type PublicCheckIn = ReturnType<typeof toPublicCheckIn>;

// Na profissional: o sono e o humor só com a área Sono e humor, e o remédio só com a área Remédio
// (DEC-107). Um dia que fica vazio para ela sai da lista, e nada aparece como editável.
export function checkInsForProfessional(checkIns: PublicCheckIn[], sharedAreas: SharedArea[]): PublicCheckIn[] {
  const sleepMood = sharedAreas.includes('SLEEP_MOOD');
  const medication = sharedAreas.includes('MEDICATION');
  return checkIns
    .map((checkIn) => ({
      ...checkIn,
      ...(!sleepMood && {
        bedTime: null,
        wakeTime: null,
        sleepMinutes: null,
        sleepQuality: null,
        mood: null,
        moodWord: null,
      }),
      ...(!medication && { medication: null }),
      editable: false,
    }))
    .filter(
      (checkIn) =>
        checkIn.sleepMinutes !== null ||
        checkIn.sleepQuality !== null ||
        checkIn.mood !== null ||
        checkIn.moodWord !== null ||
        checkIn.medication !== null,
    );
}

function assertEditable(date: string) {
  const today = todayInAppZone();
  if (date > today) throw new AppError(400, 'CHECK_IN_FUTURE', 'Este dia ainda não chegou.');
  if (!isEditable(date, today)) {
    throw new AppError(409, 'CHECK_IN_CLOSED', `Dá para registrar e editar só os últimos ${CHECK_IN_WINDOW_DAYS} dias.`);
  }
}

export function createDailyCheckInsService() {
  async function list(userId: string, range: Range) {
    const rows = await prisma.dailyCheckIn.findMany({
      where: { userId, checkInDate: { gte: dateOnlyToDate(range.from), lte: dateOnlyToDate(range.to) } },
      orderBy: { checkInDate: 'asc' },
    });
    const today = todayInAppZone();
    return rows.map((row) => toPublicCheckIn(row, today));
  }

  // PUT do dia inteiro: cria ou troca o registro daquele dia.
  async function save(userId: string, date: string, input: CheckInInput) {
    assertEditable(date);
    const data = {
      bedTime: input.bedTime ? timeOnlyToDate(input.bedTime) : null,
      wakeTime: input.wakeTime ? timeOnlyToDate(input.wakeTime) : null,
      sleepQuality: input.sleepQuality ?? null,
      mood: input.mood ?? null,
      moodWord: input.moodWord ?? null,
      medication: input.medication ?? null,
    };
    const checkInDate = dateOnlyToDate(date);
    const upsert = () =>
      prisma.dailyCheckIn.upsert({
        where: { userId_checkInDate: { userId, checkInDate } },
        create: { userId, checkInDate, ...data },
        update: data,
      });
    let row: DailyCheckIn;
    try {
      row = await upsert();
    } catch (err) {
      // Dois envios do mesmo dia ao mesmo tempo: o segundo cai na chave única ao criar. Tentar de
      // novo vira uma atualização (achado do revisor-seguranca).
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      row = await upsert();
    }
    return toPublicCheckIn(row, todayInAppZone());
  }

  async function remove(userId: string, date: string) {
    assertEditable(date);
    await prisma.$transaction(async (tx) => {
      const row = await tx.dailyCheckIn.findFirst({ where: { userId, checkInDate: dateOnlyToDate(date) }, select: { id: true } });
      if (!row) throw new AppError(404, 'CHECK_IN_NOT_FOUND', 'Não há registro neste dia.');
      await tx.dailyCheckIn.delete({ where: { id: row.id } });
      await removeRecordLinks(tx, userId, 'SLEEP_MOOD', row.id);
      await removeRecordLinks(tx, userId, 'MEDICATION', row.id);
    });
  }

  async function settings(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tracksMedication: true } });
    return { tracksMedication: user.tracksMedication };
  }

  async function updateSettings(userId: string, tracksMedication: boolean) {
    await prisma.user.update({ where: { id: userId }, data: { tracksMedication } });
    return { tracksMedication };
  }

  return { list, save, remove, settings, updateSettings };
}
