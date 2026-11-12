import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { KindChoice } from '../links/kind-choice';
import type { ProfessionalKind } from '../links/links-api';
import { COUNCIL_NUMBER_MAX, type Profile } from './profile-api';
import { useProfile, useUpdateProfile } from './use-profile';

// "Meu perfil profissional" em Conta, para quem acompanha pacientes (DEC-097, DEC-099): o tipo e o
// número do conselho, que aparecem para os pacientes. O tipo só muda sem vínculo ativo (409).
export function ProfessionalSection() {
  const profile = useProfile();
  // Fica aqui, e não no formulário: ele renasce com o que foi salvo, e a confirmação não some junto.
  const [saved, setSaved] = useState(false);
  const professional = profile.data?.professional;
  if (!professional) return null;

  return (
    <section aria-labelledby="professional-title" className="flex flex-col gap-4">
      <h2 id="professional-title" className="text-2xl font-semibold">
        Meu perfil profissional
      </h2>
      <p className="text-muted">
        Os seus pacientes veem a sua profissão e o número do conselho ao escolher o que compartilhar com você.
      </p>
      {/* Renasce quando o que está salvo muda. */}
      <ProfessionalForm
        key={`${professional.kind}|${professional.councilNumber ?? ''}`}
        professional={professional}
        saved={saved}
        onSaved={() => setSaved(true)}
        onEdit={() => setSaved(false)}
      />
    </section>
  );
}

type ProfessionalFormProps = {
  professional: NonNullable<Profile['professional']>;
  saved: boolean;
  onSaved: () => void;
  onEdit: () => void;
};

function ProfessionalForm({ professional, saved, onSaved, onEdit }: ProfessionalFormProps) {
  const update = useUpdateProfile();
  const [kind, setKind] = useState<ProfessionalKind>(professional.kind);
  const [council, setCouncil] = useState(professional.councilNumber ?? '');
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onEdit();
    if (council.trim().length > COUNCIL_NUMBER_MAX) {
      setError(`O número do conselho pode ter até ${COUNCIL_NUMBER_MAX} caracteres.`);
      return;
    }
    setError(undefined);
    update.mutate(
      { professional: { kind, councilNumber: council.trim() || null } },
      { onSuccess: onSaved },
    );
  }

  const apiError = update.error ? getApiError(update.error) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}
      <KindChoice
        name="account-kind"
        describedBy="account-kind-hint"
        value={kind}
        onChange={(value) => {
          setKind(value);
          onEdit();
        }}
      />
      <p id="account-kind-hint" className="-mt-2 text-sm text-muted">
        Para trocar, os pacientes precisam desfazer o vínculo com você antes.
      </p>
      <TextField
        label="Número do conselho (opcional)"
        hint="CRP ou CRM, como você quiser que apareça. Ex.: CRP 06/12345."
        value={council}
        maxLength={COUNCIL_NUMBER_MAX}
        onChange={(e) => {
          setCouncil(e.target.value);
          onEdit();
        }}
        error={error ?? apiError?.fields['professional.councilNumber']}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={update.isPending}>
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
        <p role="status" className="text-sm text-muted">
          {saved ? 'Salvo.' : ''}
        </p>
      </div>
    </form>
  );
}
