import { useEffect, useId, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { Dialog, DialogFooter } from '../../components/ui/dialog';
import { getApiError } from '../auth/auth-api';
import { Avatar } from './avatar';
import { avatarUrls, type Profile } from './profile-api';
import { useDeleteAvatar, useUploadAvatar } from './use-profile';

// Foto de perfil em "Seu perfil" (DEC-061, DEC-069): escolher, recortar num círculo, trocar e remover.

// Os tipos que a API aceita. Pedir só estes faz o iPhone converter a foto HEIC antes de entregar.
const ACCEPT = 'image/jpeg,image/png,image/webp';
// O recorte sai com folga sobre os 256 px que a API guarda: ela reduz de novo.
const OUTPUT_SIDE = 512;
const UNREADABLE = 'Não conseguimos abrir esta foto. Tente outra, em JPEG, PNG ou WebP.';

// Desenha só o pedaço escolhido num quadrado e devolve como JPEG. O navegador já endireita a foto
// pela orientação da câmera ao desenhá-la; a API confere de novo e tira os metadados.
async function cropToBlob(source: string, area: Area): Promise<Blob> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIDE;
  canvas.height = OUTPUT_SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sem canvas');
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIDE, OUTPUT_SIDE);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Sem imagem'))), 'image/jpeg', 0.9),
  );
}

export function AvatarEditor({ profile, name }: { profile: Profile; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  // Depois de salvar ou remover, o foco volta para cá (o botão que abriu a janela pode sumir).
  const chooseButton = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const remove = useDeleteAvatar();
  const [done, setDone] = useState('');
  const hasPhoto = profile.avatarVersion !== null;

  // O endereço temporário da foto escolhida só existe enquanto o recorte está aberto.
  useEffect(() => {
    if (!chosen) return;
    return () => URL.revokeObjectURL(chosen);
  }, [chosen]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // O accept é só uma sugestão: no Android dá para escolher qualquer arquivo.
    if (!ACCEPT.split(',').includes(file.type)) {
      setDone(UNREADABLE);
      return;
    }
    setDone('');
    setChosen(URL.createObjectURL(file));
  }

  function finish(message: string) {
    setDone(message);
    // Depois que a janela fecha e a tela se atualiza.
    requestAnimationFrame(() => chooseButton.current?.focus());
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-medium">Foto (opcional)</span>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={hasPhoto ? avatarUrls.own(profile.avatarVersion!) : null} size="lg" />
        <div className="flex flex-wrap gap-2">
          {/* Escondido de todos: quem escolhe é o botão. */}
          <input ref={input} type="file" accept={ACCEPT} onChange={handleFile} hidden />
          <button
            ref={chooseButton}
            type="button"
            className={buttonClasses('secondary')}
            onClick={() => input.current?.click()}
          >
            {hasPhoto ? 'Trocar foto' : 'Escolher foto'}
          </button>
          {hasPhoto && (
            <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
              Remover foto
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted">
        {/* Quem vê a foto (DEC-061): só quem tem vínculo com a pessoa. */}
        Aparece para quem tem vínculo com você. Antes de guardar, tiramos os dados escondidos da foto, como o lugar
        onde ela foi tirada.
      </p>
      {/* Visível: também avisa quem enxerga quando o arquivo escolhido não é uma foto. */}
      <p role="status" className={done === UNREADABLE ? 'text-sm text-accent-text' : 'sr-only'}>
        {done}
      </p>

      {chosen && (
        <CropDialog
          source={chosen}
          onClose={() => setChosen(null)}
          onSaved={() => {
            setChosen(null);
            finish('Pronto, foto salva.');
          }}
        />
      )}

      {confirmRemove && (
        <Dialog title="Remover a foto?" description="O círculo volta a mostrar as suas iniciais." onClose={() => setConfirmRemove(false)}>
          {remove.isError && <Alert tone="attention">{getApiError(remove.error).message}</Alert>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </Button>
            <Button
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmRemove(false);
                    finish('Pronto, foto removida.');
                  },
                })
              }
            >
              {remove.isPending ? 'Removendo…' : 'Remover foto'}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}

// O recorte: arrastar para posicionar e o zoom (pelo controle ou com dois dedos), num círculo.
function CropDialog({ source, onClose, onSaved }: { source: string; onClose: () => void; onSaved: () => void }) {
  const upload = useUploadAvatar();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Preparar o recorte leva um instante numa foto grande: o botão já fica ocupado, sem envio dobrado.
  const [preparing, setPreparing] = useState(false);
  const busy = preparing || upload.isPending;
  const zoomId = useId();

  async function handleSave() {
    if (!area || busy) return;
    setError(null);
    setPreparing(true);
    try {
      const blob = await cropToBlob(source, area);
      upload.mutate(blob, { onSuccess: onSaved, onError: (e) => setError(getApiError(e).message) });
    } catch {
      setError(UNREADABLE);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <Dialog title="Ajustar a foto" description="Arraste para posicionar e use o zoom para aproximar." onClose={onClose}>
      {error && <Alert tone="attention">{error}</Alert>}
      <div className="relative h-72 w-full overflow-hidden rounded-md bg-bg sm:h-80">
        <Cropper
          image={source}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
          // Arquivo que não abre (corrompido, HEIC fora do iPhone): explica, em vez de ficar vazio.
          mediaProps={{ onError: () => setError(UNREADABLE) }}
          // A área recebe foco e anda com as setas: o nome diz isso ao leitor de tela.
          cropperProps={{ role: 'group', 'aria-label': 'Área do recorte. Use as setas para posicionar a foto.' }}
        />
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor={zoomId} className="font-medium">
          Zoom
        </label>
        <input
          id={zoomId}
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-valuetext={`${Math.round(zoom * 100)}%`}
          className="score-range"
          style={{ '--fill': `${((zoom - 1) / 2) * 100}%` } as CSSProperties}
        />
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!area || busy} onClick={handleSave}>
          {busy ? 'Salvando…' : 'Usar esta foto'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
