import { FieldError } from '../../components/ui/field-error';
import { choiceCardClasses } from '../../components/ui/field-styles';
import type { ProfessionalKind } from './links-api';

const OPTIONS: { kind: ProfessionalKind; label: string }[] = [
  { kind: 'PSICOLOGIA', label: 'Sou psicóloga' },
  { kind: 'PSIQUIATRIA', label: 'Sou psiquiatra' },
];

// O tipo de profissional (DEC-097, DEC-099): no cadastro, no convite e em Conta. Cada paciente pode
// ter uma de cada, e o tipo só muda sem vínculo ativo. No cadastro e no convite começa sem nada
// marcado: escolher errado ocuparia a vaga da outra profissional (achado do revisor-seguranca).
export function KindChoice({
  value,
  onChange,
  name,
  error,
  describedBy,
}: {
  value: ProfessionalKind | null;
  onChange: (kind: ProfessionalKind) => void;
  // Grupos diferentes na mesma tela não podem dividir o mesmo name.
  name: string;
  error?: string;
  // Um texto de ajuda fora do grupo, para o leitor de tela ler junto.
  describedBy?: string;
}) {
  const errorId = `${name}-error`;
  const described = [describedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={described}>
      <legend className="mb-1 font-medium">Qual é a sua profissão?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.kind}
            className={`flex min-h-11 items-center gap-3 p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${choiceCardClasses}`}
          >
            <input
              type="radio"
              name={name}
              checked={value === option.kind}
              onChange={() => onChange(option.kind)}
              aria-invalid={error ? true : undefined}
            />
            <span className="font-medium">{option.label}</span>
          </label>
        ))}
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  );
}
