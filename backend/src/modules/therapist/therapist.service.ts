import { addDays, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { ActivitiesService } from '../activities/activities.service.js';
import type { ListActivitiesQuery } from '../activities/activities.schema.js';
import type { CycleQuery, ListAppointmentsQuery } from '../appointments/appointments.schema.js';
import type { AppointmentsService } from '../appointments/appointments.service.js';
import type { Session } from '../appointments/sessions.js';
import type { ListTensionEpisodesQuery } from '../tension-episodes/tension-episodes.schema.js';
import type { TensionEpisodesService } from '../tension-episodes/tension-episodes.service.js';
import type { ListThoughtRecordsQuery } from '../thought-records/thought-records.schema.js';
import type { ThoughtRecordsService } from '../thought-records/thought-records.service.js';

// No resumo, só quando e de que tipo: o motivo de uma remarcada fica na rota da agenda, que pede o
// aceite da 2026-10.4 (DEC-045).
function withoutReason(session: Session | null) {
  return session && { date: session.date, time: session.time, kind: session.kind };
}

export type Highlight = {
  from: string;
  to: string;
  // Por que esse período: a semana antes da próxima consulta ou, sem ela, os últimos 7 dias.
  reason: 'NEXT_APPOINTMENT' | 'LAST_7_DAYS';
};

// SPEC ("Destaque"), DEC-033: os 7 dias antes da próxima consulta, sem o dia dela.
// Sem próxima consulta, os últimos 7 dias até hoje. Função pura, para testar as bordas sem banco.
export function highlightWindow(nextAppointment: string | null, today: string): Highlight {
  if (nextAppointment) {
    return { from: addDays(nextAppointment, -7), to: addDays(nextAppointment, -1), reason: 'NEXT_APPOINTMENT' };
  }
  return { from: addDays(today, -6), to: today, reason: 'LAST_7_DAYS' };
}

// Só leitura, sempre atrás do requireActiveLink. Reaproveita os services do paciente para as
// regras (ordem, formato, última e próxima consulta) ficarem num lugar só.
export function createTherapistService(
  activities: ActivitiesService,
  appointments: AppointmentsService,
  thoughtRecords: ThoughtRecordsService,
  tensionEpisodes: TensionEpisodesService,
) {
  return {
    async summary(therapistId: string, patientId: string) {
      const link = await prisma.therapistLink.findFirstOrThrow({
        where: { therapistId, patientId, revokedAt: null },
        include: { patient: { select: { id: true, name: true, email: true } } },
      });
      const today = todayInAppZone();
      const { last, next, status, pause } = await appointments.list(patientId);
      return {
        patient: { ...link.patient, linkedAt: link.createdAt.toISOString() },
        today,
        lastAppointment: withoutReason(last),
        nextAppointment: withoutReason(next),
        // Situação da agenda (DEC-045): o selo "em pausa" ou "encerrada" na tela da terapeuta.
        // Só a situação e as datas da pausa; os motivos ficam na rota da agenda, com o aceite.
        agendaStatus: status,
        pause,
        highlight: highlightWindow(next?.date ?? null, today),
      };
    },

    listActivities(patientId: string, query: ListActivitiesQuery) {
      return activities.list(patientId, query);
    },

    cycle(patientId: string, query: CycleQuery) {
      return appointments.cycle(patientId, query);
    },

    listAppointments(patientId: string, query: ListAppointmentsQuery) {
      return appointments.list(patientId, query);
    },

    listThoughtRecords(patientId: string, query: ListThoughtRecordsQuery) {
      return thoughtRecords.list(patientId, query);
    },

    listTensionEpisodes(patientId: string, query: ListTensionEpisodesQuery) {
      return tensionEpisodes.list(patientId, query);
    },
  };
}

export type TherapistService = ReturnType<typeof createTherapistService>;
