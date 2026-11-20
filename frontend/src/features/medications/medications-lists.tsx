import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { LongText } from '../../components/ui/long-text';
import { formatFullDate } from '../activities/week';
import { changeLine, intensityTrail, medicationLine, symptomEnded, symptomSince } from './medication-labels';
import type { Medication, MedicationChange, Symptom } from './medications-api';

// As listas de Remédios e o que sinto (DEC-115), para o paciente (com os botões) e para a
// profissional (só leitura, em terceira pessoa). O texto do paciente fica como ele escreveu.

export type MedicationActions = {
  onChange: (medication: Medication) => void;
  onEdit: (medication: Medication) => void;
  onEditChange: (medication: Medication, change: MedicationChange) => void;
};

export type SymptomActions = {
  onCheck: (symptom: Symptom) => void;
  onEnd: (symptom: Symptom) => void;
  onEdit: (symptom: Symptom) => void;
};

type Audience = 'patient' | 'therapist';
// No paciente, os cartões ficam embaixo de um h2; na profissional, embaixo de um h4.
type Level = 3 | 5;

function CardTitle({ level, children }: { level: Level; children: ReactNode }) {
  const Tag = level === 3 ? 'h3' : 'h5';
  return <Tag className="font-semibold break-words first-letter:uppercase">{children}</Tag>;
}

const cardClass = 'flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-soft';

function Buttons({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function MedicationCard({
  medication,
  actions,
  level,
}: {
  medication: Medication;
  actions?: MedicationActions;
  level: Level;
}) {
  return (
    <li className={cardClass}>
      <CardTitle level={level}>{medicationLine(medication)}</CardTitle>
      <p className="text-sm text-muted">
        {medication.active
          ? medication.startedOn && `Em uso desde ${formatFullDate(medication.startedOn)}`
          : medication.stoppedOn && `Parou em ${formatFullDate(medication.stoppedOn)}`}
      </p>
      {medication.changes.length > 0 && (
        <ol className="flex flex-col gap-1 text-sm" aria-label={`Mudanças de ${medication.name}`}>
          {medication.changes.map((change, index) => (
            <li key={change.id} className="flex flex-wrap items-center gap-x-3">
              <span className="break-words">{changeLine(change, index)}</span>
              {actions && (
                <Button
                  variant="ghost"
                  className="min-h-11 px-0 text-sm underline"
                  onClick={() => actions.onEditChange(medication, change)}
                >
                  Editar<span className="sr-only"> a mudança de {formatFullDate(change.changeDate)}</span>
                </Button>
              )}
              {change.note && <p className="w-full break-words text-muted">{change.note}</p>}
            </li>
          ))}
        </ol>
      )}
      {actions && (
        <Buttons>
          <Button variant="secondary" onClick={() => actions.onChange(medication)}>
            Registrar mudança<span className="sr-only"> de {medication.name}</span>
          </Button>
          <Button variant="ghost" onClick={() => actions.onEdit(medication)}>
            Editar<span className="sr-only"> {medication.name}</span>
          </Button>
        </Buttons>
      )}
    </li>
  );
}

function SymptomCard({
  symptom,
  medications,
  actions,
  level,
}: {
  symptom: Symptom;
  medications: Medication[];
  actions?: SymptomActions;
  level: Level;
}) {
  const trail = intensityTrail(symptom);
  const ended = symptomEnded(symptom);
  return (
    <li className={cardClass}>
      <CardTitle level={level}>{symptom.description}</CardTitle>
      <p className="text-sm text-muted">{symptomSince(symptom, medications)}</p>
      {ended && <p className="text-sm text-muted">{ended}</p>}
      {trail && (
        <div className="flex flex-col gap-0.5 text-sm">
          <p>
            Intensidade: <span className="tabular-nums">{trail}</span>
          </p>
          <p className="text-muted">
            {symptom.checks.map((check) => `${formatFullDate(check.date)}: ${check.intensity}`).join(' · ')}
          </p>
        </div>
      )}
      {symptom.note && <LongText text={symptom.note} />}
      {actions && (
        <Buttons>
          {!symptom.endedOn && (
            <>
              <Button variant="secondary" onClick={() => actions.onCheck(symptom)}>
                Como está agora?<span className="sr-only"> {symptom.description}</span>
              </Button>
              <Button variant="secondary" onClick={() => actions.onEnd(symptom)}>
                Já passou<span className="sr-only"> {symptom.description}</span>
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => actions.onEdit(symptom)}>
            Editar<span className="sr-only"> {symptom.description}</span>
          </Button>
        </Buttons>
      )}
    </li>
  );
}

// Os remédios em uso; os que pararam ficam recolhidos em "Remédios que já tomei".
export function MedicationList({
  medications,
  audience,
  actions,
}: {
  medications: Medication[];
  audience: Audience;
  actions?: MedicationActions;
}) {
  const level: Level = audience === 'patient' ? 3 : 5;
  const active = medications.filter((medication) => medication.active);
  const stopped = medications.filter((medication) => !medication.active);
  return (
    <div className="flex flex-col gap-3">
      {active.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Remédios em uso">
          {active.map((medication) => (
            <MedicationCard key={medication.id} medication={medication} actions={actions} level={level} />
          ))}
        </ul>
      )}
      {stopped.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary-text underline underline-offset-4">
            {audience === 'patient' ? 'Remédios que já tomei' : 'Remédios que já tomou'} ({stopped.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {stopped.map((medication) => (
              <MedicationCard key={medication.id} medication={medication} actions={actions} level={level} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// O que está sentindo primeiro; o que já passou depois.
export function SymptomList({
  symptoms,
  medications,
  audience,
  actions,
}: {
  symptoms: Symptom[];
  medications: Medication[];
  audience: Audience;
  actions?: SymptomActions;
}) {
  const level: Level = audience === 'patient' ? 3 : 5;
  return (
    <ul className="flex flex-col gap-3">
      {symptoms.map((symptom) => (
        <SymptomCard key={symptom.id} symptom={symptom} medications={medications} actions={actions} level={level} />
      ))}
    </ul>
  );
}
