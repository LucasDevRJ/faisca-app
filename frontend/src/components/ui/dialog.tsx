import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { Alert } from './alert';
import { Button } from './button';

type DialogProps = {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

// <dialog> nativo em modo modal (DEC-029): o navegador cuida do foco preso dentro dele,
// do Esc para fechar e de deixar o resto da página inerte. Monte só enquanto estiver aberto.
// Sem padding embaixo: o rodapé com os botões (DialogFooter) fica grudado na base do painel.
export function Dialog({ title, description, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Sem close() na limpeza: sair do DOM já tira o dialog do modo modal. E, no StrictMode
  // (dev), o close() da montagem de teste dispararia um "close" atrasado que fecharia o
  // dialog logo depois de abrir.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc dispara "cancel" e depois "close": quem abriu decide fechar.
      onClose={onClose}
      // Celular: painel que sobe de baixo, na largura toda. A partir do sm: janela no centro.
      className="mx-0 mt-auto mb-0 w-full max-w-full rounded-t-xl border border-border bg-surface p-0 text-text shadow-soft backdrop:bg-text/40 sm:m-auto sm:w-[min(32rem,calc(100%-2rem))] sm:rounded-xl"
    >
      <div className="flex max-h-[90dvh] flex-col gap-5 overflow-y-auto px-5 pt-6 sm:max-h-[85dvh] sm:px-6">
        <header className="flex flex-col gap-1">
          <h2 id={titleId} className="text-2xl font-bold">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="text-muted">
              {description}
            </div>
          )}
        </header>
        {children}
      </div>
    </dialog>
  );
}

// Botões do dialog, sempre visíveis: ficam grudados na base enquanto o formulário rola.
export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-auto grid grid-cols-2 gap-3 border-t border-border bg-surface px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:-mx-6 sm:flex sm:justify-end sm:px-6 sm:pb-6">
      {children}
    </div>
  );
}

// Formulário padrão de um dialog: erro da API no topo e os campos em coluna.
export function DialogForm({
  onSubmit,
  error,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && <Alert tone="attention">{error}</Alert>}
      {children}
    </form>
  );
}

// Cancelar e o botão de envio, no rodapé fixo.
export function DialogActions({
  submitLabel,
  pending,
  onCancel,
}: {
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : submitLabel}
      </Button>
    </DialogFooter>
  );
}
