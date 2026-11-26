import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);
export const ACTION_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const maxSeconds = 60;
const movInput = ['-protocol_whitelist', 'file', '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0'];
// As ferramentas de mídia recebem apenas as variáveis necessárias para serem localizadas.
const toolEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR };
const probeResult = z.object({
  format: z.object({ duration: z.coerce.number().positive().max(maxSeconds) }),
  streams: z.array(z.object({
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
  })).length(1),
});

async function validateVideo(input: string) {
  const info = await stat(input);
  if (!info.isFile() || info.size === 0 || info.size > ACTION_VIDEO_MAX_BYTES) {
    throw new Error('Envie um vídeo de até 100 MB.');
  }

  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', ...movInput, '-select_streams', 'V:0',
      '-show_entries', 'format=duration:stream=width,height', '-of', 'json', '-i', input,
    ], { timeout: 10_000, maxBuffer: 32_768, windowsHide: true, env: toolEnv });
    probeResult.parse(JSON.parse(stdout));
  } catch {
    throw new Error('Envie um vídeo MP4 ou MOV válido de até 60 segundos.');
  }
}

// Chamar com caminhos locais controlados pelo serviço, dentro de uma pasta temporária por trabalho.
// O áudio é mantido por padrão. A escolha de removê-lo acompanha a conversão.
export async function convertActionVideo(
  inputPath: string,
  outputPath: string,
  { keepAudio = true }: { keepAudio?: boolean } = {},
) {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  await validateVideo(input);

  const audio = keepAudio ? ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', '128k'] : ['-an'];
  const scale = "scale=w='if(gte(iw,ih),min(iw,1280),min(iw,720))':h='if(gte(iw,ih),min(ih,720),min(ih,1280))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
  try {
    await run('ffmpeg', [
      '-nostdin', '-v', 'error', '-xerror', '-n',
      '-threads', '2', ...movInput, '-i', input,
      '-map', '0:V:0', ...audio, '-sn', '-dn', '-map_metadata:g', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1',
      '-vf', scale, '-fpsmax', '30', '-t', String(maxSeconds),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '23',
      '-maxrate', '2500k', '-bufsize', '5000k', '-threads', '2',
      '-movflags', '+faststart', '-f', 'mp4', output,
    ], { timeout: 180_000, maxBuffer: 65_536, windowsHide: true, env: toolEnv });
  } catch {
    throw new Error('Não foi possível converter o vídeo da Ação.');
  }
}
