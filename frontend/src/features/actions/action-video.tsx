import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter } from '../../components/ui/dialog';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import {
  actionVideoPath, fetchActionVideo, MAX_ACTION_VIDEO_BYTES, removeActionVideo,
  uploadActionVideo,
} from './action-video-api';

export function ActionVideo({ actionId, patientId, canChange }: { actionId: string; patientId?: string; canChange: boolean }) {
  const { data: user } = useSession();
  const allowed = user?.privacyAreas.actionVideos === true;
  const path = actionVideoPath(actionId, patientId);
  const queryClient = useQueryClient();
  const queryKey = ['actionVideo', user?.id, path] as const;
  const status = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchActionVideo(path, signal),
    enabled: allowed,
    retry: false,
    refetchInterval: ({ state }) => {
      const video = state.data;
      return !patientId && video && video.state !== 'READY' && video.state !== 'FAILED' ? 3000 : false;
    },
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const remove = useMutation({ mutationFn: () => removeActionVideo(path), onSuccess: invalidate });
  const [dialog, setDialog] = useState<'upload' | 'remove' | null>(null);
  const [playbackError, setPlaybackError] = useState(false);

  const video = allowed && !status.isError ? status.data : null;
  if (patientId && video?.state !== 'READY') return null;
  if (!video && !canChange && !status.isError) return null;
  const busy = Boolean(video && video.state !== 'READY' && video.state !== 'FAILED');

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {video?.state === 'READY' && (
        <>
          <video controls preload="none" playsInline aria-label="Vídeo da Ação"
            onError={() => setPlaybackError(true)} onPlaying={() => setPlaybackError(false)}
            className="aspect-video w-full rounded-md bg-bg object-contain" src={`/api${path}/play`} />
          {playbackError && <Alert tone="attention">Não foi possível reproduzir o vídeo. Atualize a tela para tentar de novo.</Alert>}
        </>
      )}
      {busy && <p role="status" className="text-sm text-muted">Preparando o vídeo. Ele aparece aqui quando estiver pronto.</p>}
      {video?.state === 'FAILED' && <p role="status" className="text-sm text-muted">Não foi possível preparar o vídeo.</p>}
      {status.isError && !patientId && <Alert tone="attention">{getApiError(status.error).message}</Alert>}
      {canChange && (!video || video.state === 'FAILED') && !status.isError && (
        <Button variant="secondary" className="self-start" onClick={() => setDialog('upload')}>
          {video?.state === 'FAILED' ? 'Enviar outro vídeo' : 'Adicionar vídeo'}
        </Button>
      )}
      {canChange && video && (
        <Button variant="ghost" className="self-start" onClick={() => { remove.reset(); setDialog('remove'); }}>
          Remover vídeo
        </Button>
      )}
      {dialog === 'upload' && (
        <Dialog title="Adicionar vídeo à Ação" onClose={() => setDialog(null)}>
          {allowed
            ? <UploadVideoForm path={path} onClose={() => setDialog(null)} onUploaded={() => { void invalidate(); setDialog(null); }} />
            : <PrivacyConsentGate area="actionVideos" onCancel={() => setDialog(null)} />}
        </Dialog>
      )}
      {dialog === 'remove' && (
        <Dialog title="Remover vídeo?" description="O vídeo deixará de aparecer nesta Ação." onClose={() => setDialog(null)}>
          {remove.isError && <Alert tone="attention">{getApiError(remove.error).message}</Alert>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => setDialog(null) })}>
              {remove.isPending ? 'Removendo…' : 'Remover vídeo'}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}

function UploadVideoForm({ path, onClose, onUploaded }: { path: string; onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [keepAudio, setKeepAudio] = useState(true);
  const [error, setError] = useState('');
  const hintId = useId();
  const errorId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (selected: File) => uploadActionVideo(path, selected, keepAudio),
    onSuccess: onUploaded,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !/\.(mp4|mov)$/i.test(file.name) || file.size === 0 || file.size > MAX_ACTION_VIDEO_BYTES) {
      setError('Escolha um vídeo MP4 ou MOV de até 100 MB.');
      return;
    }
    setError('');
    upload.mutate(file);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p id={hintId} className="text-muted">
        MP4 ou MOV, até 60 segundos e 100 MB. Se outras pessoas aparecerem ou tiverem a voz gravada, confira se elas estão de acordo.
      </p>
      <fieldset disabled={upload.isPending} className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Button variant="secondary" className="self-start"
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            onClick={() => fileInput.current?.click()}>
            {file ? 'Trocar vídeo' : 'Escolher vídeo'}
          </Button>
          <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" hidden
            aria-label="Arquivo de vídeo"
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} />
          <p role="status" className="break-words text-sm text-muted empty:sr-only">{file?.name}</p>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={keepAudio} onChange={(event) => setKeepAudio(event.target.checked)} />
          Manter o áudio no vídeo final
        </label>
      </fieldset>
      {(error || upload.isError) && <div id={errorId}><Alert tone="attention">{error || getApiError(upload.error).message}</Alert></div>}
      <DialogFooter>
        <Button variant="secondary" disabled={upload.isPending} onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={upload.isPending}>{upload.isPending ? 'Enviando…' : 'Enviar vídeo'}</Button>
      </DialogFooter>
    </form>
  );
}
