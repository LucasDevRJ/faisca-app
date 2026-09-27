import { useEffect, useId, useRef, type ReactNode } from 'react';

type DialogProps = {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

// <dialog> nativo em modo modal (DEC-029): o navegador cuida do foco preso dentro dele,
// do Esc para fechar e de deixar o resto da página inerte. Monte só enquanto estiver aberto.
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
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border border-border bg-surface p-0 text-text shadow-soft backdrop:bg-text/40"
    >
      <div className="flex max-h-[85dvh] flex-col gap-5 overflow-y-auto p-6">
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
