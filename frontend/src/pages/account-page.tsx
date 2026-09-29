import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { getApiError } from '../features/auth/auth-api';
import { DeleteAccountSection } from '../features/auth/delete-account-section';
import { useAddProfile, useSession } from '../features/auth/use-session';
import { TherapistLinkSection } from '../features/links/therapist-link-section';

const profileInfo = {
  patient: {
    label: 'Registrar minhas atividades',
    add: 'Também quero registrar minhas atividades',
  },
  therapist: {
    label: 'Acompanhar pacientes',
    add: 'Também quero acompanhar pacientes',
  },
} as const;

// "Conta": a terapeuta vinculada (só para quem é paciente), os perfis (SPEC, "Contas e perfis")
// e, no fim, excluir a conta (SPEC, "Privacidade").
export function AccountPage() {
  const { data: user } = useSession();
  if (!user) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Volta para a tela principal do perfil (quem tem um só não vê a alternância no topo). */}
        <Link
          to={user.profiles.patient ? '/registros' : '/pacientes'}
          className="self-start font-medium text-primary-text underline underline-offset-4"
        >
          {user.profiles.patient ? '‹ Meus registros' : '‹ Meus pacientes'}
        </Link>
        <h1 className="text-4xl font-bold">Conta</h1>
        <p className="text-muted">
          {user.name} · <span className="break-all">{user.email}</span>
        </p>
      </div>

      {user.profiles.patient && <TherapistLinkSection />}

      <ProfilesSection profiles={user.profiles} />

      <DeleteAccountSection isPatient={user.profiles.patient} />
    </>
  );
}

function ProfilesSection({ profiles }: { profiles: { patient: boolean; therapist: boolean } }) {
  const addProfile = useAddProfile();
  const active = (['patient', 'therapist'] as const).filter((key) => profiles[key]);
  const missing = (['patient', 'therapist'] as const).filter((key) => !profiles[key]);

  return (
    <section aria-labelledby="profiles-title" className="flex flex-col gap-4">
      <h2 id="profiles-title" className="text-2xl font-semibold">
        Perfis
      </h2>
      <ul className="flex flex-col gap-2">
        {active.map((key) => (
          <li key={key} className="rounded-md border border-border bg-surface px-4 py-3">
            {profileInfo[key].label}
          </li>
        ))}
      </ul>
      {addProfile.isError && <Alert tone="attention">{getApiError(addProfile.error).message}</Alert>}
      {missing.map((key) => (
        <div key={key}>
          <Button variant="secondary" disabled={addProfile.isPending} onClick={() => addProfile.mutate(key)}>
            {profileInfo[key].add}
          </Button>
        </div>
      ))}
    </section>
  );
}
