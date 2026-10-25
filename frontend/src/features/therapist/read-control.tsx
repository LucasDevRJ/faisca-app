import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter } from '../../components/ui/dialog';
import { getApiError } from '../auth/auth-api';
import { isPending, type ReadInfo, type ReadItem, type ReadType } from './read-marks-api';
import { formatReadAt } from './read-format';
import { useReadMarks } from './use-therapist';

// "Lido" da terapeuta (DEC-057, DEC-058). Só aparece na visão da terapeuta, no rodapé do cartão.
// Nunca marca sozinho: só pelo botão.

// `label` (a situação ou o nome) completa o nome do botão para leitor de tela (aria-label, como o
// "Editar" do cartão de Ação): numa lista, vários "Marcar como lido" iguais não dizem de qual é cada um.
type ReadControlProps = {
  patientId: string;
  type: ReadType;
  record: { id: string } & ReadInfo;
  label: string;
};

// O estilo de desabilitado do Button só reage a `disabled`; aqui, o envio aparece também com aria-disabled.
const pendingLook = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

// Situação é texto livre (até 5000 caracteres): no nome do botão, só o começo.
function shortLabel(label: string): string {
  return label.length > 60 ? `${label.slice(0, 60).trimEnd()}…` : label;
}

export function ReadControl({ patientId, type, record, label }: ReadControlProps) {
  const { mark, unmark } = useReadMarks(patientId);
  const name = shortLabel(label);
  const items: ReadItem[] = [{ type, id: record.id }];
  const busy = mark.isPending || unmark.isPending;
  const failed = mark.isError || unmark.isError;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {record.readStatus === 'ATUALIZADO' && (
          <span className="rounded-full border border-accent bg-accent/10 px-2 py-0.5 text-sm font-medium text-accent-text">
            Atualizado depois que você leu
          </span>
        )}
        {record.readStatus === 'LIDO' && record.readAt && (
          <span className="text-sm text-muted">{formatReadAt(record.readAt)}</span>
        )}
        {isPending(record) ? (
          // aria-disabled, e não disabled: desabilitar o botão com foco joga o foco para o começo da página.
          <Button variant="secondary" className={pendingLook} aria-label={`Marcar como lido: ${name}`}
            aria-disabled={busy}
            onClick={() => !busy && mark.mutate(items)}
          >
            Marcar como lido
          </Button>
        ) : (
          <Button variant="ghost" className={`px-3 ${pendingLook}`} aria-label={`Marcar como não lido: ${name}`}
            aria-disabled={busy}
            onClick={() => !busy && unmark.mutate(items)}
          >
            Marcar como não lido
          </Button>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-sm text-accent-text">
          Não deu para registrar agora. Tente de novo em instantes.
        </p>
      )}
    </div>
  );
}

// "Marcar todos como lidos": marca exatamente a lista aberta, depois de confirmar. Some quando
// não há nada para ler.
export function MarkAllRead({ patientId, items }: { patientId: string; items: ReadItem[] }) {
  const { mark } = useReadMarks(patientId);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const count = items.length;

  // Depois de marcar, a lista recarrega sem o botão (e o diálogo) que tinha o foco: ele vai para o
  // status, que diz o que aconteceu, e não para o começo da página.
  useEffect(() => {
    if (done && (!document.activeElement || document.activeElement === document.body)) {
      statusRef.current?.focus();
    }
  }, [done, count]);

  return (
    <>
      {/* Sempre montado (e só visualmente escondido quando vazio): leitor de tela só anuncia
          mudança numa região que já existia na árvore de acessibilidade. */}
      <p ref={statusRef} role="status" tabIndex={-1} className="text-sm text-muted empty:sr-only focus:outline-none">
        {done ? (done === 1 ? '1 registro marcado como lido.' : `${done} registros marcados como lidos.`) : null}
      </p>
      {count > 0 && (
        <>
          <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
            Marcar todos como lidos ({count})
          </Button>
          {open && (
            <Dialog
              title={count === 1 ? 'Marcar 1 registro como lido?' : `Marcar ${count} registros como lidos?`}
              description="Depois, dá para desfazer em cada registro."
              onClose={() => setOpen(false)}
            >
              {mark.isError && <Alert tone="attention">{getApiError(mark.error).message}</Alert>}
              <DialogFooter>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={mark.isPending}
                  onClick={() =>
                    mark.mutate(items, {
                      onSuccess: () => {
                        setDone(count);
                        setOpen(false);
                      },
                    })
                  }
                >
                  {mark.isPending ? 'Marcando…' : 'Marcar como lidos'}
                </Button>
              </DialogFooter>
            </Dialog>
          )}
        </>
      )}
    </>
  );
}
