import { useId, useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import type { DateRange } from '../appointments/appointments-api';
import type { PeriodSummary } from './summary-api';
import { daysLine, hasAnyArea, periodLine, summaryBlocks, type SummaryArea } from './summary-format';
import { useMyPeriodSummary } from './use-summary';

// O "Ver registros" de cada bloco: abre a aba (profissional) ou a página (paciente) daquela área.
export type SummaryLink = (area: SummaryArea) => ReactNode;

type BodyProps = {
  query: UseQueryResult<PeriodSummary, unknown>;
  link: SummaryLink;
};

// O conteúdo do resumo (DEC-100): o período, os dias com registro e um bloco por área com registro.
function SummaryBody({ query, link }: BodyProps) {
  if (query.isPending) {
    return (
      <p role="status" className="text-muted" aria-busy="true">
        Carregando o resumo…
      </p>
    );
  }
  if (query.isError) {
    return (
      <Alert tone="attention">
        <div className="flex flex-col gap-3">
          <p>Não conseguimos carregar o resumo. Confira sua conexão e tente de novo.</p>
          <div>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  const summary = query.data;
  const blocks = summaryBlocks(summary);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{periodLine(summary)}</p>
      {blocks.length === 0 ? (
        <p className="text-muted">Nada registrado neste período.</p>
      ) : (
        <>
          <p className="font-semibold">{daysLine(summary)}</p>
          <ul className="flex flex-col gap-4">
            {blocks.map((block) => (
              <li key={block.area} className="flex flex-col gap-1">
                <h3 className="font-semibold">{block.title}</h3>
                {block.lines.map((line) => (
                  <p key={line} className="break-words text-muted">
                    {line}
                  </p>
                ))}
                {link(block.area)}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm text-muted italic">Números calculados dos registros do período, sem interpretação.</p>
    </div>
  );
}

const cardClass = 'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6';

// Na profissional: aberto, no topo da página do paciente. Sem nenhuma área liberada e com aceite, não
// aparece (as abas já explicam o que falta).
export function PatientPeriodSummaryCard({ query, link }: BodyProps) {
  const titleId = useId();
  if (query.isSuccess && !hasAnyArea(query.data)) return null;
  return (
    <section aria-labelledby={titleId} className={cardClass}>
      <h2 id={titleId} className="text-lg font-semibold">
        Resumo do período
      </h2>
      <SummaryBody query={query} link={link} />
    </section>
  );
}

// No paciente: "Meu resumo", o mesmo cartão que as profissionais veem, fechado por padrão para não
// empurrar as atividades do dia para baixo. Só pergunta à API depois de aberto.
export function MyPeriodSummaryCard({ range, link }: { range: DateRange; link: SummaryLink }) {
  const titleId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const query = useMyPeriodSummary(range, open);
  return (
    <section aria-labelledby={titleId} className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          Meu resumo
        </h2>
        <Button variant="secondary" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          {open ? 'Esconder o resumo' : 'Ver o resumo'}
        </Button>
      </div>
      <div id={bodyId} hidden={!open}>
        {open && <SummaryBody query={query} link={link} />}
      </div>
    </section>
  );
}
