import sharp from 'sharp';
import { AppError } from '../errors/app-error.js';

// Tratamento de imagens enviadas pelas pessoas (foto de perfil, DEC-061; fotos da Ação, DEC-064).

// Sem threads extras por imagem e sem cache: a API roda numa instância pequena, e o processamento
// das fotos não pode tomar a memória e a CPU de quem está usando o resto do app.
sharp.concurrency(1);
sharp.cache(false);

// Fila: uma imagem por vez em toda a API. O concurrency(1) acima limita os threads de cada imagem,
// mas não quantas são tratadas ao mesmo tempo; uma foto de 50 MP descomprimida ocupa ~200 MB.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// Os bytes do começo do arquivo de cada formato aceito. Conferir antes de chamar o sharp evita
// que o arquivo passe pelo leitor de outro formato (SVG, TIFF, HEIF...) só para ser recusado.
function hasAcceptedSignature(data: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end));
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data[0] === 0x89 && ascii(1, 4) === 'PNG';
  const webp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return jpeg || png || webp;
}

export function invalidImage() {
  return new AppError(400, 'INVALID_IMAGE', 'Não foi possível ler esta imagem. Envie uma foto em JPEG, PNG ou WebP.');
}

export type ImageOutput = {
  width: number;
  height: number;
  // cover: recorta no centro para preencher (miniaturas, foto de perfil); inside: cabe inteira,
  // sem aumentar uma foto menor (a foto grande).
  fit: 'cover' | 'inside';
  quality: number;
};

// Confere o tipo pelo conteúdo (não pela extensão), endireita pela orientação da câmera e regrava
// cada saída em WebP. Regravar sem withMetadata() descarta todos os metadados, inclusive a
// localização (GPS) que o celular grava na foto. maxPixels trava "bombas" de imagem: um arquivo
// pequeno que descomprime em bilhões de pixels.
export async function processImage(input: Uint8Array, maxPixels: number, outputs: ImageOutput[]): Promise<Buffer[]> {
  if (!hasAcceptedSignature(input)) throw invalidImage();
  return oneAtATime(() => convert(input, maxPixels, outputs));
}

async function convert(input: Uint8Array, maxPixels: number, outputs: ImageOutput[]): Promise<Buffer[]> {
  try {
    const { format } = await sharp(input, { limitInputPixels: maxPixels }).metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) throw invalidImage();
    const base = sharp(input, { limitInputPixels: maxPixels }).rotate();
    const results: Buffer[] = [];
    for (const { width, height, fit, quality } of outputs) {
      results.push(
        await base
          .clone()
          .resize(width, height, { fit, position: 'centre', withoutEnlargement: fit === 'inside' })
          .webp({ quality })
          .toBuffer(),
      );
    }
    return results;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw invalidImage();
  }
}
