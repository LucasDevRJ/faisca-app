import { Button } from './ui/button';

type UpdateBannerProps = {
  updating: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
};

// Faixa de versão nova do app (DEC-041). Fica no topo, por cima de tudo, e não some sozinha:
// a pessoa escolhe a hora, porque atualizar recarrega a tela e perderia um formulário pela metade.
export function UpdateBanner({ updating, onUpdate, onDismiss }: UpdateBannerProps) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <div
        role="status"
        className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-lg border border-border border-l-4 border-l-primary bg-surface px-4 py-3 shadow-soft"
      >
        <p className="flex-1 basis-48">Tem uma versão nova do Faísca. Atualize para ver as novidades.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDismiss}>
            Agora não
          </Button>
          <Button disabled={updating} onClick={onUpdate}>
            {updating ? 'Atualizando…' : 'Atualizar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
