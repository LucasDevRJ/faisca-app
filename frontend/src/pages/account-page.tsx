import { Link, Navigate, useLocation } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { getApiError } from '../features/auth/auth-api';
import { AboutMeSection } from '../features/about-me/about-me-section';
import { DeleteAccountSection } from '../features/auth/delete-account-section';
import { SecuritySection } from '../features/auth/security-section';
import { useAddProfile, useSession } from '../features/auth/use-session';
import { TherapistLinkSection } from '../features/links/therapist-link-section';
import { ProfileSection } from '../features/profile/profile-section';
import { MedicationSettingSection } from '../features/daily-check-ins/medication-setting-section';
import { ProfessionalSection } from '../features/profile/professional-section';
import { ShareFaiscaSection } from '../features/profile/share-faisca-section';

const settings: ReadonlyArray<{ path: string; title: string; description: string; patientExtra?: string }> = [
  { path: 'personalizacao', title: 'Personalização', description: 'Paleta e cor de destaque', patientExtra: 'organização do início' },
  { path: 'acessibilidade', title: 'Acessibilidade', description: 'Leitura, linguagem, movimento e formulários' },
  { path: 'notificacoes', title: 'Notificações', description: 'Novidades por e-mail e avisos de mensagens', patientExtra: 'lembretes' },
];

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

// Conta reúne os atalhos de preferências, o perfil, os vínculos e a segurança.
export function AccountPage() {
  const { data: user } = useSession();
  const { hash, search } = useLocation();
  if (!user) return null;
  if (hash === '#lembretes' || hash === '#novidades-email') {
    return <Navigate to={{ pathname: '/conta/notificacoes', hash, search }} replace />;
  }

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

      <nav aria-label="Preferências da conta">
        <ul className="flex flex-col gap-2">
          {settings.map(({ path, title, description, patientExtra }) => (
            <li key={path}>
              <Link
                to={`/conta/${path}`}
                aria-labelledby={`account-${path}`}
                aria-describedby={`account-${path}-description`}
                className="flex min-h-11 flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span id={`account-${path}`} className="font-semibold text-primary-text">{title}</span>
                <span id={`account-${path}-description`} className="text-sm text-muted">
                  {user.profiles.patient && patientExtra ? `${description} · ${patientExtra}` : description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="Ajuda para usar o Faísca" className="rounded-lg border border-border bg-surface p-4">
        <p className="text-muted">Quer conhecer os recursos e como funciona o compartilhamento?</p>
        <Link to="/como-funciona#vinculo" className="mt-2 inline-flex min-h-11 items-center font-medium text-primary-text underline underline-offset-4">
          Abrir o guia Como funciona
        </Link>
      </section>

      <ShareFaiscaSection />

      <ProfileSection />

      {/* A pergunta do remédio no registro do dia (DEC-107, DEC-108): só para quem é paciente. */}
      {user.profiles.patient && <MedicationSettingSection />}

      {/* "Sobre mim" (DEC-082): só para quem é paciente; a psicóloga vinculada lê. */}
      {user.profiles.patient && <AboutMeSection />}

      {user.profiles.patient && <TherapistLinkSection />}

      {/* Tipo de profissional e conselho (DEC-099): só para quem acompanha pacientes. */}
      {user.profiles.therapist && <ProfessionalSection />}

      <ProfilesSection profiles={user.profiles} />

      {/* Todas as novidades do app, inclusive as que já foram vistas (DEC-060). */}
      <section aria-labelledby="news-title" className="flex flex-col gap-3">
        <h2 id="news-title" className="text-2xl font-semibold">
          Novidades do Faísca
        </h2>
        <p className="text-muted">Tudo o que melhorou no app, mesmo o que você já viu.</p>
        <Link to="/novidades" className={buttonClasses('secondary', 'self-start')}>
          Ver o que há de novo
        </Link>
      </section>

      {/* Trocar senha e sair de todos os aparelhos (DEC-086), antes de "Excluir conta". */}
      <SecuritySection />

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
