import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { Dialog, DialogFooter } from '../../components/ui/dialog';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import { useAccessibility } from '../profile/use-profile';
import { formatAlternativeDeadline } from '../thought-records/thought-record-labels';

// Fotos de um registro (Ação, DEC-064 e DEC-065; atividades, DEC-103 e DEC-104): miniaturas no
// cartão e a foto grande ao tocar. O paciente adiciona e remove conforme as regras de cada área
// (quem usa o componente diz o que pode); a profissional só vê.

// Os tipos que a API aceita. Pedir só estes faz o Safari do iPhone converter a foto HEIC sozinho.
const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 20 * 1024 * 1024;

export type PhotosViewer = { kind: 'patient' } | { kind: 'therapist'; patientId: string };

export type PhotoRecord = {
  id: string;
  name: string;
  photos: { id: string; createdAt: string }[];
  photosDeadline: { date: string; time: string | null } | null;
};

type PhotoMutations = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
};

// O que muda de uma área para a outra.
export type PhotoKind = {
  // A área do aviso de privacidade que cobre estas fotos.
  area: 'actionPhotos' | 'activityPhotos';
  // Título da janela do aceite ("Fotos da Ação").
  consentTitle: string;
  // "ação" ou "atividade", para "Esta ação tem 2 fotos."
  noun: string;
  max: number;
  // Quem vê as fotos, para o lembrete do paciente.
  audienceNote: string;
  url: (base: string, recordId: string, photoId: string, size: 'thumb' | 'full') => string;
  useAdd: () => PhotoMutations & { mutateAsync: (input: { recordId: string; file: File }) => Promise<unknown> };
  useRemove: () => PhotoMutations & {
    mutate: (input: { recordId: string; photoId: string }, options: { onSuccess: () => void }) => void;
  };
};

type RecordPhotosProps = {
  record: PhotoRecord;
  kind: PhotoKind;
  viewer: PhotosViewer;
  // O paciente pode adicionar agora? E remover? Quem usa decide pelas regras da área.
  canAdd: boolean;
  canRemove: boolean;
  // Mostrar a seção? (ex.: na Ação, só na avaliada).
  visible: boolean;
  // Uma frase a mais para o paciente (ex.: a atividade que não aconteceu).
  note?: string;
};

export function RecordPhotos({ record, kind, viewer, canAdd, canRemove, visible, note }: RecordPhotosProps) {
  const { data: user } = useSession();
  const [viewing, setViewing] = useState<number | null>(null);
  const [askConsent, setAskConsent] = useState(false);
  const consented = Boolean(user?.privacyAreas[kind.area]);
  const isPatient = viewer.kind === 'patient';
  const base = viewer.kind === 'therapist' ? `/therapist/patients/${viewer.patientId}` : '';
  const { photos } = record;
  const wrapper = useRef<HTMLDivElement>(null);
  const [justConsented, setJustConsented] = useState(false);

  // Aceitou pela janela: ela some junto com o botão que a abriu. O foco vai para o primeiro botão
  // das fotos, e o leitor de tela ouve que deu certo.
  useEffect(() => {
    if (justConsented) wrapper.current?.querySelector('button')?.focus();
  }, [justConsented]);

  if (!visible || (photos.length === 0 && !canAdd)) return null;

  const consentDialog = askConsent && (
    <Dialog title={kind.consentTitle} onClose={() => setAskConsent(false)}>
      <PrivacyConsentGate
        area={kind.area}
        audience={isPatient ? 'patient' : 'therapist'}
        onCancel={() => setAskConsent(false)}
        onAccepted={() => {
          setAskConsent(false);
          setJustConsented(true);
        }}
      />
    </Dialog>
  );

  // Sem o aceite da versão do aviso que cita as fotos: o resto do registro funciona; as fotos pedem o aceite.
  if (!consented) {
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {photos.length > 0 && (
          <p className="text-sm text-muted">
            {photos.length === 1 ? `Esta ${kind.noun} tem 1 foto.` : `Esta ${kind.noun} tem ${photos.length} fotos.`}
          </p>
        )}
        <Button variant="secondary" className="self-start" onClick={() => setAskConsent(true)}>
          {canAdd ? 'Adicionar fotos' : 'Ver as fotos'}
        </Button>
        {consentDialog}
      </div>
    );
  }

  const url = (index: number, size: 'thumb' | 'full') => kind.url(base, record.id, photos[index]!.id, size);
  // Depois de remover, a lista recarrega antes de o visor saber: fica na mesma posição (a foto
  // seguinte) ou na última, sem fechar e abrir de novo.
  const shown = viewing === null || photos.length === 0 ? null : Math.min(viewing, photos.length - 1);

  return (
    <div ref={wrapper} className="flex flex-col gap-3 border-t border-border pt-3">
      {justConsented && (
        <p role="status" className="sr-only">
          {canAdd ? 'Pronto, agora dá para adicionar fotos.' : 'Pronto, agora dá para ver as fotos.'}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Fotos de ${record.name}`}>
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setViewing(index)}
                aria-label={`Abrir a foto ${index + 1} de ${photos.length}`}
                className="block cursor-zoom-in overflow-hidden rounded-md border border-border"
              >
                <img src={url(index, 'thumb')} alt="" loading="lazy" className="size-16 object-cover sm:size-20" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {isPatient && note && <p className="text-sm text-muted">{note}</p>}
      {canAdd && <AddPhotos record={record} kind={kind} />}
      {/* Fica montada até o aceite salvo fechá-la, para o aviso de "pronto" chegar. */}
      {consentDialog}

      {shown !== null && (
        <PhotoViewer
          record={record}
          kind={kind}
          index={shown}
          url={url}
          canRemove={canRemove}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// "Adicionar fotos": escolhe várias, manda uma por vez e mostra o andamento.
function AddPhotos({ record, kind }: { record: PhotoRecord; kind: PhotoKind }) {
  const { noTimePressure } = useAccessibility();
  const input = useRef<HTMLInputElement>(null);
  const add = kind.useAdd();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [finished, setFinished] = useState<string | null>(null);
  const room = kind.max - record.photos.length;

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
        await add.mutateAsync({ recordId: record.id, file: files[i]! });
        sent += 1;
      } catch (error) {
        const { code, message } = getApiError(error);
        // Limite cheio: as próximas seriam recusadas pelo mesmo motivo. Avisa uma vez e para de enviar.
        if (code === 'ACCOUNT_PHOTO_LIMIT' || code === 'PHOTO_LIMIT') {
          const left = files.length - 1 - i;
          notes.push(left === 0 ? message : `${message} ${left === 1 ? 'A outra não foi enviada.' : 'As outras não foram enviadas.'}`);
          setProblems([...notes]);
          break;
        }
        notes.push(`"${files[i]!.name}": ${message}`);
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

  const deadline =
    !noTimePressure && record.photosDeadline
      ? `Dá para adicionar ou remover ${formatAlternativeDeadline(record.photosDeadline)}. `
      : '';

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
        {photoCount(record.photos.length, kind.max)}
      </p>
      <p className="text-sm text-muted">
        {kind.audienceNote} Se aparecerem outras pessoas, confira se elas estão de acordo.
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
function photoCount(count: number, max: number): string {
  if (count === 0) return `Até ${max} fotos.`;
  if (count >= max) return `${count} fotos, o máximo.`;
  return `${count === 1 ? '1 foto' : `${count} fotos`} (cabem até ${max}).`;
}

type ViewerProps = {
  record: PhotoRecord;
  kind: PhotoKind;
  index: number;
  url: (index: number, size: 'thumb' | 'full') => string;
  canRemove: boolean;
  onIndex: (index: number) => void;
  onClose: () => void;
};

// A foto grande, com anterior e próxima (também pelas setas do teclado) e, quando o paciente pode,
// "Remover foto" com confirmação.
function PhotoViewer({ record, kind, index, url, canRemove, onIndex, onClose }: ViewerProps) {
  const remove = kind.useRemove();
  const [confirming, setConfirming] = useState(false);
  const total = record.photos.length;
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
      { recordId: record.id, photoId: record.photos[index]!.id },
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
      description={<span className="break-words">{record.name}</span>}
      onClose={onClose}
      size="wide"
    >
      <div onKeyDown={handleKey} className="flex flex-col gap-4 sm:gap-3">
        <img
          src={url(index, 'full')}
          alt={`Foto ${index + 1} de ${total} de ${record.name}`}
          // No computador, a foto ocupa a altura que sobra do título e dos botões.
          className="max-h-[45dvh] w-full rounded-md object-contain sm:max-h-[calc(94dvh-12rem)]"
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
              {/* Para ver os detalhes: a foto inteira, em 2560 px, noutra aba, com o zoom do navegador.
                  É o primeiro elemento focável, então as setas do teclado já funcionam ao abrir. */}
              <a
                href={url(index, 'full')}
                target="_blank"
                rel="noopener"
                className={buttonClasses('ghost', 'col-span-2 whitespace-nowrap sm:mr-auto sm:px-3')}
              >
                Abrir em tamanho real<span className="sr-only"> (abre em outra aba)</span>
              </a>
              {total > 1 && (
                <>
                  <Button variant="secondary" className="whitespace-nowrap" onClick={() => go(-1)}>
                    ‹ Anterior
                  </Button>
                  <Button variant="secondary" className="whitespace-nowrap" onClick={() => go(1)}>
                    Próxima ›
                  </Button>
                </>
              )}
              {canRemove && (
                <Button variant="ghost" className="whitespace-nowrap" onClick={() => setConfirming(true)}>
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
