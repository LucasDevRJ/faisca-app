import { api } from '../../lib/api';

export const ACTION_VIDEOS_ENABLED = import.meta.env.VITE_ACTION_VIDEOS_ENABLED === 'true';
export const MAX_ACTION_VIDEO_BYTES = 100 * 1024 * 1024;

export type ActionVideoStatus = { state: 'UPLOADING' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'; keepAudio?: boolean };

export function actionVideoPath(actionId: string, patientId?: string) {
  const prefix = patientId ? `/therapist/patients/${patientId}` : '';
  return `${prefix}/actions/${actionId}/video`;
}

export async function fetchActionVideo(path: string, signal?: AbortSignal) {
  return (await api.get<ActionVideoStatus | null>(path, { signal })).data;
}

export async function uploadActionVideo(path: string, file: File, keepAudio: boolean) {
  const contentType = /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4';
  await api.post(path, file, {
    params: { audio: keepAudio ? 'keep' : 'remove' },
    headers: { 'Content-Type': contentType },
    timeout: 120_000,
  });
}

export async function removeActionVideo(path: string) {
  await api.delete(path);
}
