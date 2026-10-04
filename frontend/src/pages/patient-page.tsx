import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import type { Activity } from '../features/activities/activities-api';
import { ActivityCard } from '../features/activities/activity-card';
import { formatDayHeading } from '../features/activities/week';
import { TherapistCycleSummary } from '../features/cycle/cycle-summary';
import { PeriodNav } from '../features/cycle/period-nav';
import { usePeriod } from '../features/cycle/use-period';
import { WeekChart } from '../features/activities/week-chart';
import { statusBadge } from '../features/appointments/agenda-format';
import { sessionDays } from '../features/appointments/appointments-api';
import { AppointmentLine } from '../features/appointments/appointments-card';
import { PatientAgenda } from '../features/therapist/patient-agenda';
import { useSession } from '../features/auth/use-session';
import { formatDate } from '../features/links/link-format';
import { PATIENTS_KEY } from '../features/links/use-links';
import { daysInRange, type DateRange } from '../features/therapist/period';
import type { PatientSummary } from '../features/therapist/therapist-api';
import {
  isForbidden,
  patientCycleQuery,
  usePatientActivities,
  usePatientAppointments,
  usePatientSummary,
  usePatientTensionEpisodes,
  usePatientThoughtRecords,
} from '../features/therapist/use-therapist';
import { TensionChart } from '../features/tension-episodes/tension-chart';
import { TensionEpisodeCard } from '../features/tension-episodes/tension-episode-card';
import type { TensionEpisode } from '../features/tension-episodes/tension-episodes-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { ThoughtRecordCard } from '../features/thought-records/thought-record-card';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';

// Aba na URL (?aba=pensamentos ou ?aba=tensao), junto com o período (DEC-040, DEC-043).
// Sem ?aba, Atividades.
const TABS = ['pensamentos', 'tensao'] as const;
type RecordTab = (typeof TABS)[number] | null;

function parseTab(value: string | null): RecordTab {
  return TABS.find((tab) => tab === value) ?? null;
}
const backLinkClass = 'self-start font-medium text-primary-text underline underline-offset-4';

// Registros de um paciente vinculado (SPEC, "Visão da terapeuta"; DEC-033). Só leitura: nenhum
// botão grava nada, e o backend recusaria com 403 de qualquer jeito.
export function PatientPage() {
  const { patientId = '' } = useParams();
  const summary = usePatientSummary(patientId);

  if (summary.isPending) {
    return (
      <p className="text-muted" aria-busy="true">
        Carregando…
      </p>
    );
  }

  if (summary.isError) {
    if (isForbidden(summary.error)) return <NoAccess />;
    return (
      <>
        <Link to="/pacientes" className={backLinkClass}>
          ‹ Meus pacientes
        </Link>
        <Alert tone="attention">
          <div className="flex flex-col gap-3">
            <p>Não conseguimos carregar os registros. Confira sua conexão e tente de novo.</p>
            <div>
              <Button variant="secondary" onClick={() => summary.refetch()}>
                Tentar de novo
              </Button>
            </div>
          </div>
        </Alert>
      </>
    );
  }

  return <PatientRecords patientId={patientId} summary={summary.data} />;
}

// Vínculo desfeito (ou que nunca existiu): mesma mensagem para todos os casos, como a API.
function NoAccess() {
  const queryClient = useQueryClient();

  // A lista de pacientes pode estar em memória com a pessoa ainda nela.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
  }, [queryClient]);

  return (
    <>
      <h1 className="text-3xl font-bold sm:text-4xl">Registros indisponíveis</h1>
      <Alert tone="attention">
        Você não tem mais acesso a estes registros. Isso acontece quando o paciente encerra o
        compartilhamento, e está tudo bem: se ele quiser, pode gerar um novo código.
      </Alert>
      <Link to="/pacientes" className={buttonClasses('secondary', 'self-start')}>
        Voltar para Meus pacientes
      </Link>
    </>
  );
}

function PatientRecords({ patientId, summary }: { patientId: string; summary: PatientSummary }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: user } = useSession();
  const { patient, today, lastAppointment, nextAppointment, agendaStatus, pause } = summary;
  const [agendaOpen, setAgendaOpen] = useState(false);
  const tab = parseTab(searchParams.get('aba'));

  // Ciclo da consulta por padrão, ou a semana (DEC-050). O mesmo período vale para as três abas.
  const { period, currentMonday, showCycle, showWeek } = usePeriod(patientCycleQuery(patientId), today);
  const range: DateRange = period ?? { from: today, to: today };
  const inCycle = period?.mode === 'cycle';
  const ready = period !== null;

  // Só a aba aberta pergunta à API. O RPD e os episódios também esperam o aceite da versão do
  // aviso que os cita (DEC-039, DEC-042).
  const activities = usePatientActivities(patientId, tab || !ready ? null : range);
  const consented = Boolean(user?.privacyAreas.thoughtRecords);
  const thoughts = usePatientThoughtRecords(patientId, ready && tab === 'pensamentos' && consented ? range : null);
  const tensionConsented = Boolean(user?.privacyAreas.tensionEpisodes);
  const tension = usePatientTensionEpisodes(patientId, ready && tab === 'tensao' && tensionConsented ? range : null);
  // Selo "consulta" nos dias com sessão. A agenda pede o aceite da versão que a cita (DEC-045);
  // sem ele, só a última e a próxima, que vêm no resumo.
  const agendaConsented = Boolean(user?.privacyAreas.appointmentSchedule);
  const agenda = usePatientAppointments(patientId, agendaConsented, range);
  const appointmentList = agendaConsented
    ? sessionDays(agenda.data)
    : [lastAppointment?.date, nextAppointment?.date].filter((d): d is string => Boolean(d));
  const appointmentDays = new Set(appointmentList);
  const badge = statusBadge(agendaStatus, pause, today);

  // Vínculo desfeito enquanto a tela estava aberta.
  if (activities.isError && isForbidden(activities.error)) return <NoAccess />;
  if (thoughts.isError && isForbidden(thoughts.error) && !needsPrivacyConsent(thoughts.error)) return <NoAccess />;
  if (tension.isError && isForbidden(tension.error) && !needsPrivacyConsent(tension.error)) return <NoAccess />;

  const firstName = patient.name.split(' ')[0];

  function selectTab(target: RecordTab) {
    const next = new URLSearchParams(searchParams);
    if (target) next.set('aba', target);
    else next.delete('aba');
    setSearchParams(next);
  }

  return (
    <>
      <Link to="/pacientes" className={backLinkClass}>
        ‹ Meus pacientes
      </Link>

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold break-words sm:text-4xl">{patient.name}</h1>
        <p className="break-all text-muted">{patient.email}</p>
        <p className="text-sm text-muted">Vinculado desde {formatDate(patient.linkedAt)}</p>
      </section>

      <section
        aria-labelledby="appointments-title"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="appointments-title" className="text-lg font-semibold">
            Consultas
          </h2>
          {badge && <span className="rounded-full border border-border px-2 py-0.5 text-sm text-muted">{badge}</span>}
        </div>
        {lastAppointment || nextAppointment ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {nextAppointment && <AppointmentLine label="Próxima" session={nextAppointment} today={today} />}
            {lastAppointment && <AppointmentLine label="Última" session={lastAppointment} today={today} />}
          </dl>
        ) : (
          <p className="text-muted">{firstName} ainda não cadastrou consultas.</p>
        )}
        <Button
          variant="ghost"
          className="self-start px-0 underline"
          aria-expanded={agendaOpen}
          onClick={() => setAgendaOpen((open) => !open)}
        >
          {agendaOpen ? 'Esconder a agenda' : 'Ver a agenda'}
        </Button>
        {agendaOpen && <PatientAgenda patientId={patientId} consented={agendaConsented} today={today} />}
      </section>

      <RecordTabs tab={tab} onSelect={selectTab} />

      <section aria-labelledby="period-title" className="flex flex-col gap-5 sm:gap-6">
        {period ? (
          <PeriodNav
            period={period}
            today={today}
            audience="therapist"
            currentMonday={currentMonday}
            onCycle={showCycle}
            onWeek={showWeek}
            summary={<TherapistCycleSummary patientId={patientId} range={period} />}
          />
        ) : (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {tab === 'tensao' ? (
          <TensionTab
            consented={tensionConsented && !(tension.isError && needsPrivacyConsent(tension.error))}
            query={tension}
            range={range}
            inCycle={inCycle}
            today={today}
            appointmentDays={appointmentList}
          />
        ) : tab === 'pensamentos' ? (
          <ThoughtsTab
            consented={consented && !(thoughts.isError && needsPrivacyConsent(thoughts.error))}
            query={thoughts}
            range={range}
            inCycle={inCycle}
            today={today}
          />
        ) : (
          <>
            {activities.isPending && (
              <p className="text-muted" aria-busy="true">
                Carregando os registros…
              </p>
            )}

            {activities.isError && (
              <Alert tone="attention">
                <div className="flex flex-col gap-3">
                  <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
                  <div>
                    <Button variant="secondary" onClick={() => activities.refetch()}>
                      Tentar de novo
                    </Button>
                  </div>
                </div>
              </Alert>
            )}

            {activities.isSuccess && (
              <>
                {activities.data.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
                    Nada registrado {inCycle ? 'neste ciclo' : 'nesta semana'}.
                  </p>
                )}

                <WeekChart activities={activities.data} period={inCycle ? 'no ciclo' : 'na semana'} />

                <DayList
                  days={daysInRange(range)}
                  activities={activities.data}
                  today={today}
                        appointmentDays={appointmentDays}
                />
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

type DayListProps = {
  days: string[];
  activities: Activity[];
  today: string;
  appointmentDays: Set<string>;
};

function DayList({ days, activities, today, appointmentDays }: DayListProps) {
  return (
    <ol className="flex flex-col gap-2 sm:gap-6">
      {days.map((day) => {
        const ofDay = activities.filter((a) => a.activityDate === day);
        return (
          <li key={day} className="flex flex-col gap-2 sm:gap-3">
            <h3 className={`font-semibold first-letter:uppercase sm:text-lg ${ofDay.length ? '' : 'text-muted'}`}>
              {formatDayHeading(day)}
              {day === today && (
                <span className="ml-2 rounded-sm bg-primary px-2 py-0.5 text-sm font-medium text-on-primary">
                  hoje
                </span>
              )}
              {appointmentDays.has(day) && (
                <span className="ml-2 rounded-sm border border-primary px-2 py-0.5 text-sm font-medium text-primary-text">
                  consulta
                </span>
              )}
            </h3>
            {ofDay.length > 0 && (
              <div className="flex flex-col gap-3">
                {ofDay.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} readOnly />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Nomes curtos, iguais às abas do paciente: com três botões, "Registro de Pensamentos" não cabe
// num celular (DEC-043).
const TAB_LABELS: { tab: RecordTab; label: string }[] = [
  { tab: null, label: 'Atividades' },
  { tab: 'pensamentos', label: 'Pensamentos' },
  { tab: 'tensao', label: 'Tensão' },
];

function RecordTabs({ tab, onSelect }: { tab: RecordTab; onSelect: (tab: RecordTab) => void }) {
  return (
    <div role="group" aria-label="Tipo de registro" className="grid grid-cols-3 gap-2 sm:flex">
      {TAB_LABELS.map((item) => (
        <Button
          key={item.label}
          variant={tab === item.tab ? 'primary' : 'secondary'}
          aria-pressed={tab === item.tab}
          className="px-2 text-sm sm:px-5 sm:text-base"
          onClick={() => onSelect(item.tab)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

type ThoughtsTabProps = {
  consented: boolean;
  query: ReturnType<typeof usePatientThoughtRecords>;
  range: DateRange;
  inCycle: boolean;
  today: string;
};

// Registro de Pensamentos do paciente, só leitura (DEC-040). Só os dias com registro aparecem.
function ThoughtsTab({ consented, query, range, inCycle, today }: ThoughtsTabProps) {
  if (!consented) return <PrivacyConsentGate area="thoughtRecords" audience="therapist" />;

  if (query.isPending) {
    return (
      <p className="text-muted" aria-busy="true">
        Carregando os registros…
      </p>
    );
  }

  if (query.isError) {
    return (
      <Alert tone="attention">
        <div className="flex flex-col gap-3">
          <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
          <div>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  const records = query.data;
  if (records.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
        Nenhum registro de pensamentos {inCycle ? 'neste ciclo' : 'nesta semana'}.
      </p>
    );
  }

  const recorded = new Set(records.map((r) => r.situationDate));
  const days = daysInRange(range).filter((day) => recorded.has(day));
  return (
    <ol className="flex flex-col gap-4 sm:gap-6">
      {days.map((day) => (
        <ThoughtsDay
          key={day}
          day={day}
          records={records.filter((r) => r.situationDate === day)}
          today={today}
        />
      ))}
    </ol>
  );
}

type ThoughtsDayProps = { day: string; records: ThoughtRecord[]; today: string };

function ThoughtsDay({ day, records, today }: ThoughtsDayProps) {
  return (
    <li className="flex flex-col gap-2 sm:gap-3">
      <h3 className="font-semibold first-letter:uppercase sm:text-lg">
        {formatDayHeading(day)}
        {day === today && (
          <span className="ml-2 rounded-sm bg-primary px-2 py-0.5 text-sm font-medium text-on-primary">hoje</span>
        )}
      </h3>
      <div className="flex flex-col gap-3">
        {records.map((record) => (
          <ThoughtRecordCard key={record.id} record={record} readOnly />
        ))}
      </div>
    </li>
  );
}

type TensionTabProps = {
  consented: boolean;
  query: ReturnType<typeof usePatientTensionEpisodes>;
  range: DateRange;
  inCycle: boolean;
  today: string;
  appointmentDays: string[];
};

// Episódios de tensão do paciente, só leitura (DEC-043): o gráfico do período e, embaixo, os dias
// com episódio.
function TensionTab({ consented, query, range, inCycle, today, appointmentDays }: TensionTabProps) {
  if (!consented) return <PrivacyConsentGate area="tensionEpisodes" audience="therapist" />;

  if (query.isPending) {
    return (
      <p className="text-muted" aria-busy="true">
        Carregando os registros…
      </p>
    );
  }

  if (query.isError) {
    return (
      <Alert tone="attention">
        <div className="flex flex-col gap-3">
          <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
          <div>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  const episodes = query.data;
  if (episodes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
        Nenhum episódio de tensão {inCycle ? 'neste ciclo' : 'nesta semana'}.
      </p>
    );
  }

  const recorded = new Set(episodes.map((e) => e.episodeDate));
  const days = daysInRange(range).filter((day) => recorded.has(day));
  return (
    <>
      <TensionChart
        episodes={episodes}
        range={range}
        appointmentDays={appointmentDays}
        period={inCycle ? 'no ciclo' : 'na semana'}
      />
      <ol className="flex flex-col gap-4 sm:gap-6">
        {days.map((day) => (
          <TensionDay
            key={day}
            day={day}
            episodes={episodes.filter((e) => e.episodeDate === day)}
            today={today}
          />
        ))}
      </ol>
    </>
  );
}

type TensionDayProps = { day: string; episodes: TensionEpisode[]; today: string };

function TensionDay({ day, episodes, today }: TensionDayProps) {
  return (
    <li className="flex flex-col gap-2 sm:gap-3">
      <h3 className="font-semibold first-letter:uppercase sm:text-lg">
        {formatDayHeading(day)}
        {day === today && (
          <span className="ml-2 rounded-sm bg-primary px-2 py-0.5 text-sm font-medium text-on-primary">hoje</span>
        )}
      </h3>
      <div className="flex flex-col gap-3">
        {episodes.map((episode) => (
          <TensionEpisodeCard key={episode.id} episode={episode} readOnly />
        ))}
      </div>
    </li>
  );
}
