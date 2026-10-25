import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter } from '../../components/ui/dialog';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import { formatAlternativeDeadline } from '../thought-records/thought-record-labels';
import { actionPhotoUrl, MAX_ACTION_PHOTOS, type Action } from './actions-api';
import { useAddActionPhoto, useRemoveActionPhoto } from './use-actions';

// Fotos da Ação avaliada (DEC-064, DEC-065): miniaturas no cartão e a foto grande ao tocar. O
// paciente adiciona e remove até a próxima consulta depois da avaliação; a terapeuta só vê.

// Os tipos que a API aceita. Pedir só estes faz o Safari do iPhone converter a foto HEIC sozinho.
const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 20 * 1024 * 1024;

export type PhotosViewer = { kind: 'patient' } | { kind: 'therapist'; patientId: string };

export function ActionPhotos({ action, viewer }: { action: Action; viewer: PhotosViewer }) {
  const { data: user } = useSession();
  const [viewing, setViewing] = useState<number | null>(null);
  const [askConsent, setAskConsent] = useState(false);
  const consented = Boolean(user?.privacyAreas.actionPhotos);
  const isPatient = viewer.kind === 'patient';
  const base = viewer.kind === 'therapist' ? `/therapist/patients/${viewer.patientId}` : '';
  const { photos } = action;
  const canChange = isPatient && action.status === 'AVALIADA' && action.photosOpen;
  const wrapper = useRef<HTMLDivElement>(null);
  const [justConsented, setJustConsented] = useState(false);

  // Aceitou pela janela: ela some junto com o botão que a abriu. O foco vai para o primeiro botão
  // das fotos, e o leitor de tela ouve que deu certo.
  useEffect(() => {
    if (justConsented) wrapper.current?.querySelector('button')?.focus();
  }, [justConsented]);

  if (action.status !== 'AVALIADA' || (photos.length === 0 && !canChange)) return null;

  const consentDialog = askConsent && (
    <Dialog title="Fotos da Ação" onClose={() => setAskConsent(false)}>
      <PrivacyConsentGate
        area="actionPhotos"
        audience={isPatient ? 'patient' : 'therapist'}
        onCancel={() => setAskConsent(false)}
        onAccepted={() => {
          setAskConsent(false);
          setJustConsented(true);
        }}
      />
    </Dialog>
  );

  // Sem o aceite da versão do aviso que cita as fotos: o resto da Ação funciona; as fotos pedem o aceite.
  if (!consented) {
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {photos.length > 0 && (
          <p className="text-sm text-muted">{photos.length === 1 ? 'Esta ação tem 1 foto.' : `Esta ação tem ${photos.length} fotos.`}</p>
        )}
        <Button variant="secondary" className="self-start" onClick={() => setAskConsent(true)}>
          {isPatient ? 'Adicionar fotos' : 'Ver as fotos'}
        </Button>
        {consentDialog}
      </div>
    );
  }

  const url = (index: number, size: 'thumb' | 'full') => actionPhotoUrl(base, action.id, photos[index]!.id, size);
  // Depois de remover, a lista recarrega antes de o visor saber: fica na mesma posição (a foto
  // seguinte) ou na última, sem fechar e abrir de novo.
  const shown = viewing === null || photos.length === 0 ? null : Math.min(viewing, photos.length - 1);

  return (
    <div ref={wrapper} className="flex flex-col gap-3 border-t border-border pt-3">
      {justConsented && (
        <p role="status" className="sr-only">
          {isPatient ? 'Pronto, agora dá para adicionar fotos.' : 'Pronto, agora dá para ver as fotos.'}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Fotos de ${action.name}`}>
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setViewing(index)}
                aria-label={`Abrir a foto ${index + 1} de ${photos.length}`}
                className="block overflow-hidden rounded-md border border-border"
              >
                <img src={url(index, 'thumb')} alt="" loading="lazy" className="size-16 object-cover sm:size-20" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canChange && <AddPhotos action={action} />}
      {/* Fica montada até o aceite salvo fechá-la, para o aviso de "pronto" chegar. */}
      {consentDialog}

      {shown !== null && (
        <PhotoViewer
          action={action}
          index={shown}
          url={url}
          canRemove={canChange}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// "Adicionar fotos": escolhe várias, manda uma por vez e mostra o andamento.
function AddPhotos({ action }: { action: Action }) {
  const input = useRef<HTMLInputElement>(null);
  const add = useAddActionPhoto();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [finished, setFinished] = useState<string | null>(null);
  const room = MAX_ACTION_PHOTOS - action.photos.length;

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (chosen.length === 0 || progress) return;
    setFinished(null);
    const notes: string[] = [];
    if (chosen.length > room) {
      notes.push(room === 1 ? 'Só cabia mais 1 foto; as outras ficaram de fora.' : `Só cabiam mais ${room} fotos; as outras ficaram de fora.`);
    }
    const files = chosen.slice(0, room).filter((file) => {
      if (file.size <= MAX_BYTES) return true;
      notes.push(`"${file.name}" passa de 20 MB.`);
      return false;
    });
    setProblems(notes);
    let sent = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      try {
        await add.mutateAsync({ actionId: action.id, file: files[i]! });
        sent += 1;
      } catch (error) {
        notes.push(`"${files[i]!.name}": ${getApiError(error).message}`);
        setProblems([...notes]);
      }
    }
    setProgress(null);
    if (sent > 0) setFinished(sent === 1 ? 'Pronto, a foto foi adicionada.' : `Pronto, ${sent} fotos foram adicionadas.`);
  }

  // Durante o envio, o botão só fica marcado como indisponível (sem disabled), para o foco não sair dele.
  function choose() {
    if (!progress) input.current?.click();
  }

  const deadline = action.photosDeadline ? `Dá para adicionar ou remover ${formatAlternativeDeadline(action.photosDeadline)}. ` : '';

  return (
    <div className="flex flex-col gap-2">
      {room > 0 && (
        <>
          {/* Escondido de todos: quem escolhe é o botão abaixo. */}
          <input ref={input} type="file" accept={ACCEPT} multiple onChange={handleFiles} hidden />
          <Button
            variant="secondary"
            className="self-start aria-disabled:opacity-60"
            aria-disabled={progress !== null}
            onClick={choose}
          >
            {progress ? `Enviando ${progress.done + 1} de ${progress.total}…` : 'Adicionar fotos'}
          </Button>
        </>
      )}
      <p className="text-sm text-muted">
        {deadline}
        {photoCount(action.photos.length)}
      </p>
      <p className="text-sm text-muted">
        As fotos aparecem para a sua psicóloga. Se aparecerem outras pessoas, confira se elas estão de acordo.
      </p>
      <p role="status" className="sr-only">
        {progress ? `Enviando a foto ${progress.done + 1} de ${progress.total}.` : (finished ?? '')}
      </p>
      {problems.length > 0 && (
        <div role="alert">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-accent-text">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// O limite sem placar: as fotos são opcionais, e "0 de 10" soaria como meta.
function photoCount(count: number): string {
  if (count === 0) return `Até ${MAX_ACTION_PHOTOS} fotos.`;
  if (count >= MAX_ACTION_PHOTOS) return `${count} fotos, o máximo.`;
  return `${count === 1 ? '1 foto' : `${count} fotos`} (cabem até ${MAX_ACTION_PHOTOS}).`;
}

type ViewerProps = {
  action: Action;
  index: number;
  url: (index: number, size: 'thumb' | 'full') => string;
  canRemove: boolean;
  onIndex: (index: number) => void;
  onClose: () => void;
};

// A foto grande, com anterior e próxima (também pelas setas do teclado) e, para o paciente dentro
// do prazo, "Remover foto" com confirmação.
function PhotoViewer({ action, index, url, canRemove, onIndex, onClose }: ViewerProps) {
  const remove = useRemoveActionPhoto();
  const [confirming, setConfirming] = useState(false);
  const total = action.photos.length;
  const go = (step: number) => {
    setConfirming(false);
    onIndex((index + step + total) % total);
  };

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (total < 2) return;
    if (event.key === 'ArrowLeft') go(-1);
    if (event.key === 'ArrowRight') go(1);
  }

  function handleRemove() {
    remove.mutate(
      { actionId: action.id, photoId: action.photos[index]!.id },
      {
        onSuccess: () => {
          setConfirming(false);
          if (total === 1) onClose();
        },
      },
    );
  }

  return (
    <Dialog
      title={`Foto ${index + 1} de ${total}`}
      description={<span className="break-words">{action.name}</span>}
      onClose={onClose}
    >
      <div onKeyDown={handleKey} className="flex flex-col gap-4">
        <img
          src={url(index, 'full')}
          alt={`Foto ${index + 1} de ${total} de ${action.name}`}
          className="max-h-[45dvh] w-full rounded-md object-contain sm:max-h-[60dvh]"
        />
        {/* Trocar de foto não move o foco: o leitor de tela ouve em qual está. */}
        <p role="status" className="sr-only">
          Foto {index + 1} de {total}
        </p>
        {remove.isError && <p role="alert" className="text-sm text-accent-text">{getApiError(remove.error).message}</p>}
        {confirming && (
          <p className="font-medium">Remover esta foto? Não dá para desfazer.</p>
        )}
        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button disabled={remove.isPending} onClick={handleRemove}>
                {remove.isPending ? 'Removendo…' : 'Remover'}
              </Button>
            </>
          ) : (
            <>
              {total > 1 && (
                <>
                  <Button variant="secondary" onClick={() => go(-1)}>
                    ‹ Anterior
                  </Button>
                  <Button variant="secondary" onClick={() => go(1)}>
                    Próxima ›
                  </Button>
                </>
              )}
              {canRemove && (
                <Button variant="ghost" onClick={() => setConfirming(true)}>
                  Remover foto
                </Button>
              )}
              <Button onClick={onClose}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </div>
    </Dialog>
  );
}
