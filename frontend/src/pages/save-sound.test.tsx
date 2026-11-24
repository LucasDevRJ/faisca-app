import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playSaveFeedback, readSoundSettings, unlockAudioOnFirstTouch } from '../features/sounds/save-sound';
import { installFakeAudio } from '../test/fake-audio';
import { renderRoute } from '../test/render';
import { fakeActivity, fakeUser, loggedIn, server } from '../test/server';

// Som e vibração ao salvar (#93, #272, DEC-135): desligados por padrão, com prévia, guardados
// só no aparelho. Dados fictícios (regra 5).
const storageKey = `faisca:save-sound:${fakeUser.id}`;
let audio: ReturnType<typeof installFakeAudio> | null = null;

beforeEach(() => {
  server.use(
    loggedIn,
    http.get('*/api/link', () => HttpResponse.json({ links: [], link: null, invite: null, code: null })),
  );
});

afterEach(() => {
  audio?.restore();
  audio = null;
  localStorage.clear();
});

describe('/conta/acessibilidade: Sons e vibração', () => {
  it('sem Web Audio nem vibração, explica que o aparelho não oferece', async () => {
    renderRoute('/conta/acessibilidade');
    const section = await screen.findByRole('region', { name: 'Sons e vibração' });
    expect(within(section).getByText('Este navegador não toca os sons do Faísca.')).toBeInTheDocument();
    expect(within(section).getByText('Este aparelho não vibra pelo navegador.')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('começa desligado, deixa ouvir cada som antes e salva só no aparelho', async () => {
    audio = installFakeAudio();
    const user = userEvent.setup();
    renderRoute('/conta/acessibilidade');
    const section = await screen.findByRole('region', { name: 'Sons e vibração' });

    expect(within(section).getByRole('checkbox', { name: 'Tocar um som ao salvar' })).not.toBeChecked();
    expect(within(section).getByRole('checkbox', { name: 'Vibrar de leve ao salvar' })).not.toBeChecked();
    expect(within(section).getByRole('radio', { name: 'Gota' })).toBeChecked();
    expect(within(section).getByRole('radio', { name: 'Baixo' })).toBeChecked();
    expect(within(section).getByRole('button', { name: 'Salvar sons e vibração' })).toBeDisabled();

    // Prévia sem ligar: toca, mas nada fica salvo.
    await user.click(within(section).getByRole('button', { name: 'Ouvir Sino suave' }));
    await waitFor(() => expect(audio!.tones).toContain(1046.5));
    await user.click(within(section).getByRole('button', { name: /Ouvir atividade concluída/ }));
    await waitFor(() => expect(audio!.tones).toEqual(expect.arrayContaining([659.25, 987.77])));
    await user.click(within(section).getByRole('button', { name: 'Sentir a vibração' }));
    expect(audio.vibrations).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(storageKey)).toBeNull();

    await user.click(within(section).getByRole('checkbox', { name: 'Tocar um som ao salvar' }));
    await user.click(within(section).getByRole('radio', { name: 'Madeira' }));
    await user.click(within(section).getByRole('radio', { name: 'Alto' }));
    await user.click(within(section).getByRole('checkbox', { name: 'Vibrar de leve ao salvar' }));
    await user.click(within(section).getByRole('button', { name: 'Salvar sons e vibração' }));

    expect(within(section).getByRole('status')).toHaveTextContent('Sons e vibração salvos neste aparelho.');
    expect(readSoundSettings(fakeUser.id)).toEqual({ enabled: true, sound: 'madeira', volume: 'alto', vibration: true });
  });

  it('nos outros registros, toca o som escolhido; desligado, nada', async () => {
    audio = installFakeAudio();
    playSaveFeedback(fakeUser.id, 'record');
    await Promise.resolve();
    expect(audio.tones).toEqual([]);
    localStorage.setItem(storageKey, JSON.stringify({ enabled: true, sound: 'madeira', volume: 'medio', vibration: false }));
    playSaveFeedback(fakeUser.id, 'record');
    await waitFor(() => expect(audio!.tones).toEqual([740, 1180]));
    expect(audio.vibrations).not.toHaveBeenCalled();
  });

  it('vibração ligada com o som desligado: só vibra', async () => {
    audio = installFakeAudio();
    localStorage.setItem(storageKey, JSON.stringify({ enabled: false, sound: 'gota', volume: 'baixo', vibration: true }));
    playSaveFeedback(fakeUser.id, 'complete');
    await Promise.resolve();
    expect(audio.tones).toEqual([]);
    expect(audio.vibrations).toHaveBeenCalledWith(30);
  });

  it('a escolha é de cada conta no aparelho', () => {
    localStorage.setItem('faisca:save-sound:outra-conta', JSON.stringify({ enabled: true, sound: 'sino', volume: 'alto', vibration: true }));
    expect(readSoundSettings(fakeUser.id).enabled).toBe(false);
    expect(readSoundSettings('outra-conta')).toEqual({ enabled: true, sound: 'sino', volume: 'alto', vibration: true });
  });

  it('com o som ligado, um toque na página prepara o áudio e os ouvintes saem quando ele roda', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      expect(unlockAudioOnFirstTouch(fakeUser.id)()).toBeUndefined();
      expect(add).not.toHaveBeenCalled(); // som desligado: nada a preparar

      audio = installFakeAudio();
      localStorage.setItem(storageKey, JSON.stringify({ enabled: true, sound: 'gota', volume: 'baixo', vibration: false }));
      unlockAudioOnFirstTouch(fakeUser.id);
      expect(add.mock.calls.map(([type]) => type)).toEqual(['click', 'touchend', 'keydown']);
      window.dispatchEvent(new Event('touchend'));
      await waitFor(() => expect(remove.mock.calls.map(([type]) => type)).toEqual(['click', 'touchend', 'keydown']));
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('valor estragado no aparelho volta para o padrão desligado', () => {
    localStorage.setItem(storageKey, '{"enabled":"sim","sound":"trovão"');
    expect(readSoundSettings(fakeUser.id)).toEqual({ enabled: false, sound: 'gota', volume: 'baixo', vibration: false });
  });
});

// Concluir uma atividade (o mesmo fluxo da RecordsPage) com o som ligado ou não.
function weekWith(name: string) {
  const activity = fakeActivity({ name, status: 'PENDENTE', wantBefore: 4, activityDate: '2026-09-24' });
  server.use(
    http.get('*/api/activities', () => HttpResponse.json({ activities: [activity] })),
    http.post('*/api/activities/:id/complete', () => HttpResponse.json({ activity: { ...activity, status: 'CONCLUIDA' } })),
  );
}

async function completeActivity(name: string) {
  const user = userEvent.setup();
  renderRoute('/registros');
  const card = await screen.findByRole('article', { name });
  await user.click(within(card).getByRole('button', { name: 'Conta como foi?' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Prazer'), { target: { value: '6' } });
  fireEvent.change(within(dialog).getByLabelText('Realização'), { target: { value: '9' } });
  await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
  await screen.findByText('Registro guardado.');
  return user;
}

describe('Som ao salvar nas telas', () => {
  // "Hoje" fixo, como na RecordsPage: a atividade fictícia é da semana atual.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('com o som ligado, concluir toca as duas notas e vibra, sem convite', async () => {
    audio = installFakeAudio();
    localStorage.setItem(storageKey, JSON.stringify({ enabled: true, sound: 'gota', volume: 'baixo', vibration: true }));
    weekWith('Caminhada');
    await completeActivity('Caminhada');

    await waitFor(() => expect(audio!.tones).toEqual([659.25, 987.77]));
    expect(audio.vibrations).toHaveBeenCalledWith(30);
    expect(screen.queryByText('Quer ouvir um som suave ao salvar?')).not.toBeInTheDocument();
  });

  it('desligado (padrão), não toca e convida uma vez; "Ligar som" liga e leva o foco à resposta', async () => {
    audio = installFakeAudio();
    weekWith('Caminhada');
    const user = await completeActivity('Caminhada');

    expect(audio.tones).toEqual([]);
    expect(audio.vibrations).not.toHaveBeenCalled();
    const offer = screen.getByRole('group', { name: 'Som ao salvar' });
    expect(within(offer).getByText('Quer ouvir um som suave ao salvar?')).toBeInTheDocument();

    await user.click(within(offer).getByRole('button', { name: 'Ligar som' }));
    const answer = within(offer).getByText(/Som ligado neste aparelho/);
    expect(answer).toHaveFocus();
    expect(within(offer).getByRole('link', { name: 'Conta › Acessibilidade' })).toHaveAttribute('href', '/conta/acessibilidade');
    expect(readSoundSettings(fakeUser.id).enabled).toBe(true);
  });

  it('"Agora não" leva o foco à resposta e só então o convite fica respondido', async () => {
    audio = installFakeAudio();
    weekWith('Caminhada');
    const user = await completeActivity('Caminhada');
    const offer = screen.getByRole('group', { name: 'Som ao salvar' });
    expect(localStorage.getItem(`faisca:save-sound-offer:${fakeUser.id}`)).toBeNull();

    await user.click(within(offer).getByRole('button', { name: /Ouvir/ }));
    await waitFor(() => expect(audio!.tones).toEqual([880]));
    await user.click(within(offer).getByRole('button', { name: 'Agora não' }));
    expect(within(offer).getByText(/Tudo bem/)).toHaveFocus();
    expect(localStorage.getItem(`faisca:save-sound-offer:${fakeUser.id}`)).toBe('true');
    expect(readSoundSettings(fakeUser.id).enabled).toBe(false);
  });

  it('o convite não volta depois de respondido', async () => {
    audio = installFakeAudio();
    localStorage.setItem(`faisca:save-sound-offer:${fakeUser.id}`, 'true');
    weekWith('Caminhada');
    await completeActivity('Caminhada');
    expect(screen.queryByText('Quer ouvir um som suave ao salvar?')).not.toBeInTheDocument();
  });
});
