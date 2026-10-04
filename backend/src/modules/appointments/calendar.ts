import { addDays, todayInAppZone } from '../../lib/dates.js';
import { sessionsBetween, type AgendaData, type Session } from './sessions.js';

// Arquivo .ics com as sessões dos próximos 12 meses, para importar na agenda do celular (DEC-045).
// Uma sessão por evento, em vez de RRULE: assim pausas, desmarcações e remarcações saem certas.
// O texto é neutro ("Consulta"), sem nada de saúde, como os lembretes (regra 3).

const CALENDAR_DAYS = 366;
const DURATION = 'PT1H';

// São Paulo não tem horário de verão desde 2019: um fuso fixo de -03:00 basta.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Sao_Paulo',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:-0300',
  'TZOFFSETTO:-0300',
  'TZNAME:-03',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function localStamp(date: string, time: string) {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
}

function uid(session: Session) {
  const key = session.kind === 'AVULSA' ? `avulsa-${session.appointmentId}` : `sessao-${session.originalDate}`;
  return `${key}@minhafaisca.com.br`;
}

function event(session: Session, stamp: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${uid(session)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Sao_Paulo:${localStamp(session.date, session.time!)}`,
    `DURATION:${DURATION}`,
    'SUMMARY:Consulta',
    // A desmarcada vai como cancelada: reimportar o arquivo tira a sessão da agenda.
    `STATUS:${session.status === 'DESMARCADA' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
  ];
}

export function buildCalendar(agenda: AgendaData, now: Date = new Date()): string {
  const today = todayInAppZone(now);
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const sessions = sessionsBetween(agenda, today, addDays(today, CALENDAR_DAYS)).filter((s) => s.time !== null);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Faisca//Consultas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE,
    ...sessions.flatMap((s) => event(s, stamp)),
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
