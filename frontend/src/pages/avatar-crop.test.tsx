import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { renderRoute } from '../test/render';
import { loggedIn, server } from '../test/server';

// Recorte e envio da foto de perfil (DEC-069). No jsdom a imagem não carrega, então o recorte é
// trocado por um que já informa a área escolhida, e o canvas devolve um JPEG fictício.
vi.mock('react-easy-crop', () => ({
  default: function FakeCropper({ onCropComplete }: { onCropComplete: (a: unknown, b: unknown) => void }) {
    // Só uma vez, ao abrir: a função muda a cada atualização da tela.
    const reported = useRef(false);
    useEffect(() => {
      if (reported.current) return;
      reported.current = true;
      onCropComplete({}, { x: 0, y: 0, width: 100, height: 100 });
    });
    return <div>recorte fictício</div>;
  },
}));

const VERSION = '2026-10-25T21:00:00.000Z';

beforeEach(() => {
  server.use(
    loggedIn,
    http.get('*/api/link', () => HttpResponse.json({ link: null, invite: null, code: null })),
    http.get('*/api/profile', () => HttpResponse.json({ profile: { fullName: null, palette: 'SALVIA', avatarVersion: null } })),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto-ficticia');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  // O jsdom não tem decode(): a imagem fictícia "abre" na hora.
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: () => Promise.resolve(), configurable: true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => undefined } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
    callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function chooseFile(file: File) {
  const user = userEvent.setup({ applyAccept: false });
  const section = await screen.findByRole('region', { name: 'Seu perfil' });
  await within(section).findByRole('button', { name: 'Escolher foto' });
  await user.upload(section.querySelector('input[type="file"]') as HTMLInputElement, file);
  return { user, section };
}

describe('Seu perfil: recortar e salvar a foto', () => {
  it('"Usar esta foto" envia o recorte em JPEG, avisa e mostra a foto nova', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({
      data: { profile: { fullName: null, palette: 'SALVIA', avatarVersion: VERSION } },
    });
    const { container } = renderRoute('/conta');
    const { user, section } = await chooseFile(new File(['x'], 'eu.jpg', { type: 'image/jpeg' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajustar a foto' });
    await user.click(within(dialog).getByRole('button', { name: 'Usar esta foto' }));

    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    const [path, body, config] = put.mock.calls[0]!;
    expect(path).toBe('/profile/avatar');
    expect((body as Blob).type).toBe('image/jpeg');
    expect(config?.headers?.['Content-Type']).toBe('image/jpeg');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(section).getAllByRole('status').map((s) => s.textContent)).toContain('Pronto, foto salva.');
    expect(container.querySelector('img[src^="/api/profile/avatar"]')).toHaveAttribute(
      'src',
      `/api/profile/avatar?v=${encodeURIComponent(VERSION)}`,
    );
  });

  it('erro da API ao salvar aparece na janela, que continua aberta', async () => {
    vi.spyOn(api, 'put').mockRejectedValue(
      Object.assign(new Error('falha'), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: 'INVALID_IMAGE', message: 'Não foi possível ler esta imagem.' } } },
      }),
    );
    renderRoute('/conta');
    const { user } = await chooseFile(new File(['x'], 'eu.jpg', { type: 'image/jpeg' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajustar a foto' });
    await user.click(within(dialog).getByRole('button', { name: 'Usar esta foto' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível ler esta imagem.');
  });

  it('arquivo que não é foto: não abre o recorte e explica', async () => {
    renderRoute('/conta');
    const { section } = await chooseFile(new File(['x'], 'notas.pdf', { type: 'application/pdf' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(section).getAllByRole('status').map((s) => s.textContent)).toContain(
      'Não conseguimos abrir esta foto. Tente outra, em JPEG, PNG ou WebP.',
    );
  });

  it('foto que não carrega volta para as iniciais', async () => {
    server.use(
      http.get('*/api/profile', () => HttpResponse.json({ profile: { fullName: null, palette: 'SALVIA', avatarVersion: VERSION } })),
    );
    const { container } = renderRoute('/conta');
    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    await within(section).findByRole('button', { name: 'Trocar foto' });

    fireEvent.error(container.querySelector('img[src^="/api/profile/avatar"]')!);
    expect(await within(section).findByText('AF')).toBeInTheDocument();
  });
});
