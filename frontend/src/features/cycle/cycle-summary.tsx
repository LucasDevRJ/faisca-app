import { useRangeActivities } from '../activities/use-activities';
import { useSession } from '../auth/use-session';
import { useRangeTensionEpisodes } from '../tension-episodes/use-tension-episodes';
import {
  usePatientActivities,
  usePatientTensionEpisodes,
  usePatientThoughtRecords,
} from '../therapist/use-therapist';
import { useRangeThoughtRecords } from '../thought-records/use-thought-records';
import { cycleSummaryText } from './cycle-format';

type Range = { from: string; to: string };

function SummaryLine({ text }: { text: string }) {
  return (
    <p className="rounded-md bg-surface px-4 py-2 text-center text-muted shadow-soft sm:text-left">
      {text}
    </p>
  );
}

// As três áreas do ciclo, para o próprio paciente. Usa as mesmas consultas das abas (em cache).
export function PatientCycleSummary({ range }: { range: Range }) {
  const { data: user } = useSession();
  const activities = useRangeActivities(range);
  const thoughts = useRangeThoughtRecords(range, Boolean(user?.privacyAreas.thoughtRecords));
  const tension = useRangeTensionEpisodes(range, Boolean(user?.privacyAreas.tensionEpisodes));
  return (
    <SummaryLine
      text={cycleSummaryText(range, {
        activitiesDone: activities.data?.filter((a) => a.status === 'CONCLUIDA').length,
        thoughts: thoughts.data?.length,
        tension: tension.data?.length,
      })}
    />
  );
}

// O mesmo, na visão da terapeuta: o que ela ainda não liberou no aviso fica de fora.
export function TherapistCycleSummary({ patientId, range }: { patientId: string; range: Range }) {
  const { data: user } = useSession();
  const activities = usePatientActivities(patientId, range);
  const thoughts = usePatientThoughtRecords(patientId, user?.privacyAreas.thoughtRecords ? range : null);
  const tension = usePatientTensionEpisodes(patientId, user?.privacyAreas.tensionEpisodes ? range : null);
  return (
    <SummaryLine
      text={cycleSummaryText(range, {
        activitiesDone: activities.data?.filter((a) => a.status === 'CONCLUIDA').length,
        thoughts: thoughts.data?.length,
        tension: tension.data?.length,
      })}
    />
  );
}
