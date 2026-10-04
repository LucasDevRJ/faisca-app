import { addDays, daysBetween } from '../../lib/dates.js';

// Cálculo das sessões da agenda (DEC-045). Funções puras, com datas 'AAAA-MM-DD' e horas 'HH:MM'
// no relógio de São Paulo, para testar as bordas sem banco. O service carrega os dados do
// paciente e chama daqui.

export type Frequency = 'SEMANAL' | 'QUINZENAL';

export type ScheduleData = {
  id: string;
  startDate: string;
  time: string;
  frequency: Frequency;
  // Último dia em que a regra vale (inclusive); null = em vigor.
  endDate: string | null;
};

export type ExceptionData = {
  scheduleId: string;
  originalDate: string;
  type: 'DESMARCADA' | 'REMARCADA';
  newDate: string | null;
  newTime: string | null;
  reason: string;
};

export type PauseData = { startDate: string; returnDate: string | null };

export type ExtraData = { id: string; date: string; time: string | null };

export type AgendaData = {
  schedules: ScheduleData[];
  exceptions: ExceptionData[];
  pauses: PauseData[];
  extras: ExtraData[];
};

export type Session = {
  // RECORRENTE: da regra (remarcada ou não); AVULSA: consulta fora da regra.
  kind: 'RECORRENTE' | 'AVULSA';
  date: string;
  // null só nas avulsas de antes da agenda, que não tinham hora.
  time: string | null;
  status: 'AGENDADA' | 'DESMARCADA';
  // Dia em que a sessão cairia pela regra: identifica a sessão nas rotas de desmarcar,
  // remarcar e desfazer. null nas avulsas.
  originalDate: string | null;
  rescheduled: boolean;
  // Motivo de desmarcar ou remarcar.
  reason: string | null;
  // Só nas avulsas: o id para editar ou excluir.
  appointmentId: string | null;
};

const STEP: Record<Frequency, number> = { SEMANAL: 7, QUINZENAL: 14 };

export function isPaused(date: string, pauses: PauseData[]): boolean {
  // 'AAAA-MM-DD' compara certo como texto.
  return pauses.some((p) => p.startDate <= date && (p.returnDate === null || date < p.returnDate));
}

// Dias em que a regra marca sessão, entre from e to (inclusive), antes de pausa e exceções.
export function ruleDates(schedule: ScheduleData, from: string, to: string): string[] {
  const first = from > schedule.startDate ? from : schedule.startDate;
  const last = schedule.endDate !== null && schedule.endDate < to ? schedule.endDate : to;
  if (first > last) return [];
  const step = STEP[schedule.frequency];
  const offset = daysBetween(schedule.startDate, first);
  let date = addDays(schedule.startDate, Math.ceil(offset / step) * step);
  const dates: string[] = [];
  while (date <= last) {
    dates.push(date);
    date = addDays(date, step);
  }
  return dates;
}

// A regra marca sessão nesse dia, fora de pausa? Devolve a regra, para as exceções.
export function scheduleOn(date: string, data: AgendaData): ScheduleData | null {
  if (isPaused(date, data.pauses)) return null;
  return data.schedules.find((s) => ruleDates(s, date, date).length > 0) ?? null;
}

function compareSessions(a: Session, b: Session): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0;
}

// Sessões com dia entre from e to (inclusive), em ordem. A sessão remarcada aparece no dia novo;
// a desmarcada continua no dia dela, com o motivo. Dias em pausa não têm sessão da regra; uma
// remarcada ou avulsa em dia de pausa aparece, porque foi marcada de propósito.
export function sessionsBetween(data: AgendaData, from: string, to: string): Session[] {
  const exceptionOf = new Map(data.exceptions.map((e) => [`${e.scheduleId}:${e.originalDate}`, e]));
  const sessions: Session[] = [];

  for (const schedule of data.schedules) {
    for (const date of ruleDates(schedule, from, to)) {
      if (isPaused(date, data.pauses)) continue;
      const exception = exceptionOf.get(`${schedule.id}:${date}`);
      if (exception?.type === 'REMARCADA') continue; // aparece no dia novo, logo abaixo
      sessions.push({
        kind: 'RECORRENTE',
        date,
        time: schedule.time,
        status: exception ? 'DESMARCADA' : 'AGENDADA',
        originalDate: date,
        rescheduled: false,
        reason: exception?.reason ?? null,
        appointmentId: null,
      });
    }
  }

  for (const exception of data.exceptions) {
    if (exception.type !== 'REMARCADA' || exception.newDate === null) continue;
    if (exception.newDate < from || exception.newDate > to) continue;
    // A sessão original precisa continuar valendo: se a regra mudou ou entrou uma pausa depois,
    // a remarcação deixa de existir junto com ela.
    const schedule = data.schedules.find((s) => s.id === exception.scheduleId);
    if (!schedule || ruleDates(schedule, exception.originalDate, exception.originalDate).length === 0) continue;
    if (isPaused(exception.originalDate, data.pauses)) continue;
    sessions.push({
      kind: 'RECORRENTE',
      date: exception.newDate,
      time: exception.newTime,
      status: 'AGENDADA',
      originalDate: exception.originalDate,
      rescheduled: true,
      reason: exception.reason,
      appointmentId: null,
    });
  }

  for (const extra of data.extras) {
    if (extra.date < from || extra.date > to) continue;
    sessions.push({
      kind: 'AVULSA',
      date: extra.date,
      time: extra.time,
      status: 'AGENDADA',
      originalDate: null,
      rescheduled: false,
      reason: null,
      appointmentId: extra.id,
    });
  }

  return sessions.sort(compareSessions);
}

// A sessão já começou? Sem hora (avulsa antiga), conta o dia todo: a de hoje já é "última",
// como era antes da agenda.
export function hasStarted(session: Pick<Session, 'date' | 'time'>, today: string, nowTime: string): boolean {
  if (session.date !== today) return session.date < today;
  return session.time === null || session.time <= nowTime;
}

// Até onde procurar a próxima sessão: uma pausa longa ou a quinzena cabem com folga.
const SEARCH_DAYS = 400;

export function earliestDate(data: AgendaData): string | null {
  const dates = [
    ...data.schedules.map((s) => s.startDate),
    ...data.extras.map((e) => e.date),
    ...data.exceptions.flatMap((e) => (e.newDate ? [e.newDate] : [])),
  ];
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

// Última = a mais recente que já começou; próxima = a primeira que ainda não começou.
// Só contam as sessões agendadas (as desmarcadas não aconteceram).
export function lastAndNext(data: AgendaData, today: string, nowTime: string) {
  const start = earliestDate(data);
  if (start === null) return { last: null, next: null };
  const all = sessionsBetween(data, start < today ? start : today, addDays(today, SEARCH_DAYS)).filter(
    (s) => s.status === 'AGENDADA',
  );
  let last: Session | null = null;
  let next: Session | null = null;
  for (const session of all) {
    if (hasStarted(session, today, nowTime)) last = session;
    else if (!next) next = session;
  }
  return { last, next };
}

// As próximas sessões, agendadas ou desmarcadas, para a lista "Próximas".
export function upcomingSessions(data: AgendaData, today: string, nowTime: string, count: number): Session[] {
  return sessionsBetween(data, today, addDays(today, SEARCH_DAYS))
    .filter((s) => !hasStarted(s, today, nowTime))
    .slice(0, count);
}

export type TherapyStatus = 'SEM_AGENDA' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA';

// Situação da terapia, para o card do paciente e o selo na lista da terapeuta (DEC-045).
export function therapyStatus(
  data: AgendaData & { lastEndReason: 'MUDANCA' | 'ENCERRAMENTO' | null },
  today: string,
): TherapyStatus {
  const open = data.schedules.find((s) => s.endDate === null);
  if (!open) return data.lastEndReason === 'ENCERRAMENTO' ? 'ENCERRADA' : 'SEM_AGENDA';
  return isPaused(today, data.pauses) ? 'PAUSADA' : 'ATIVA';
}

// A pausa que está valendo ou a próxima marcada (só pode haver uma das duas).
export function currentOrUpcomingPause<T extends PauseData>(pauses: T[], today: string): T | null {
  return pauses.find((p) => p.returnDate === null || p.returnDate > today) ?? null;
}
