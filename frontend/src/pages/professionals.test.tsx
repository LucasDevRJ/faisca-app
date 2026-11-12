import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LinkStatus, PatientLink } from '../features/links/links-api';
import { SHARED_AREAS } from '../features/links/links-api';
import { renderRoute } from '../test/render';
import { loggedIn, server } from '../test/server';

// "Quem me acompanha" em Conta: várias profissionais e o que cada uma vê (DEC-097, DEC-098).
// Dados fictícios (regra 5).
const psychologist: PatientLink = {
  id: '00000000-0000-4000-8000-0000000000c1',
  method: 'CODE',
  createdAt: '2026-09-01T15:00:00Z',
  seen: true,
  kind: 'PSICOLOGIA',
  sharedAreas: [...SHARED_AREAS],
  therapist: {
    name: 'Tereza Fictícia',
    email: 'tereza@faisca.test',
    avatarVersion: null,
    councilNumber: 'CRP 06/12345',
  },
};
const psychiatrist: PatientLink = {
  id: '00000000-0000-4000-8000-0000000000c2',
  method: 'CODE',
  createdAt: '2026-09-20T15:00:00Z',
  seen: true,
  kind: 'PSIQUIATRIA',
  sharedAreas: [],
  therapist: { name: 'Ana Fictícia', email: 'ana@faisca.test', avatarVersion: null, councilNumber: null },
};

function statusOf(links: PatientLink[]): LinkStatus {
  return { links, link: links[0] ?? null, invite: null, code: null };
}

// A API do vínculo do paciente, guardando as escritas.
function linkApi(links: PatientLink[]) {
  const writes: { path: string; body: unknown }[] = [];
  let current = links;
  server.use(
    http.get('*/api/link', () => HttpResponse.json(statusOf(current))),
    http.put('*/api/link/:linkId/areas', async ({ params, request }) => {
      const body = (await request.json()) as { areas: PatientLink['sharedAreas'] };
      writes.push({ path: `areas ${String(params.linkId)}`, body });
      current = current.map((link) => (link.id === params.linkId ? { ...link, sharedAreas: body.areas } : link));
      return HttpResponse.json({ link: current.find((link) => link.id === params.linkId) });
    }),
    http.post('*/api/link/revoke', async ({ request }) => {
      const body = (await request.json()) as { linkId: string };
      writes.push({ path: 'revoke', body });
      current = current.filter((link) => link.id !== body.linkId);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return writes;
}

beforeEach(() => {
  server.use(loggedIn);
});

describe('/conta: quem me acompanha', () => {
  it('um cartão por profissional, com o tipo e o conselho; sem vaga, sem "Vincular outra"', async () => {
    linkApi([psychologist, psychiatrist]);
    renderRoute('/conta');

    const tereza = await screen.findByRole('article', { name: 'Tereza Fictícia' });
    expect(within(tereza).getByText('Psicóloga')).toBeInTheDocument();
    expect(within(tereza).getByText(/CRP 06\/12345/)).toBeInTheDocument();
    const ana = screen.getByRole('article', { name: 'Ana Fictícia' });
    expect(within(ana).getByText('Psiquiatra')).toBeInTheDocument();
    expect(
      within(ana).getByText('Ana ainda não vê nenhum registro seu. Marque o que quiser compartilhar.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vincular outra profissional' })).not.toBeInTheDocument();
  });

  it('o paciente marca o que a psiquiatra vê e salva; vale na hora', async () => {
    const writes = linkApi([psychologist, psychiatrist]);
    const user = userEvent.setup();
    renderRoute('/conta');

    const ana = await screen.findByRole('article', { name: 'Ana Fictícia' });
    const areas = within(ana).getByRole('group', { name: /O que Ana pode ver/ });
    await user.click(within(areas).getByRole('checkbox', { name: 'Tensão' }));
    await user.click(within(areas).getByRole('checkbox', { name: 'Pensamentos' }));
    // Marcar não grava: a tela diz que ainda não está salvo.
    expect(within(ana).getByText('Ainda não salvo.')).toBeInTheDocument();
    await user.click(within(ana).getByRole('button', { name: /Salvar o que Ana vê/ }));

    // Na ordem das telas, e não na ordem dos cliques.
    await waitFor(() =>
      expect(writes).toEqual([
        { path: `areas ${psychiatrist.id}`, body: { areas: ['THOUGHT_RECORDS', 'TENSION_EPISODES'] } },
      ]),
    );
    expect(await within(ana).findByText('Salvo. Já vale.')).toBeInTheDocument();
  });

  it('as fotos da Ação só aparecem com a Ação marcada, e saem junto com ela', async () => {
    const writes = linkApi([psychologist, psychiatrist]);
    const user = userEvent.setup();
    renderRoute('/conta');

    const ana = await screen.findByRole('article', { name: 'Ana Fictícia' });
    expect(within(ana).queryByRole('checkbox', { name: 'Fotos da Ação' })).not.toBeInTheDocument();
    await user.click(within(ana).getByRole('checkbox', { name: 'Ação' }));
    await user.click(within(ana).getByRole('checkbox', { name: 'Fotos da Ação' }));
    await user.click(within(ana).getByRole('checkbox', { name: 'Ação' }));
    expect(within(ana).queryByRole('checkbox', { name: 'Fotos da Ação' })).not.toBeInTheDocument();
    await user.click(within(ana).getByRole('button', { name: /Salvar o que Ana vê/ }));

    await waitFor(() => expect(writes[0]?.body).toEqual({ areas: [] }));
  });

  it('desfaz só o vínculo escolhido', async () => {
    const writes = linkApi([psychologist, psychiatrist]);
    const user = userEvent.setup();
    renderRoute('/conta');

    const ana = await screen.findByRole('article', { name: 'Ana Fictícia' });
    await user.click(within(ana).getByRole('button', { name: /Desfazer o vínculo com Ana/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Desfazer o vínculo com Ana Fictícia?' });
    expect(dialog).toHaveTextContent('Ana Fictícia começa sem ver nada, e você escolhe de novo o que compartilhar.');
    await user.click(within(dialog).getByRole('button', { name: 'Desfazer vínculo' }));

    await waitFor(() => expect(writes).toEqual([{ path: 'revoke', body: { linkId: psychiatrist.id } }]));
    // O cartão do botão sumiu: o foco vai para o título da seção.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Quem me acompanha' })).toHaveFocus());
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Ana Fictícia' })).not.toBeInTheDocument());
    expect(screen.getByRole('article', { name: 'Tereza Fictícia' })).toBeInTheDocument();
    // Abriu a vaga de novo.
    expect(await screen.findByRole('heading', { name: 'Vincular outra profissional' })).toBeInTheDocument();
  });

  it('se salvar falha, as caixas voltam ao que está gravado', async () => {
    linkApi([psychologist, psychiatrist]);
    server.use(
      http.put('*/api/link/:linkId/areas', () =>
        HttpResponse.json({ error: { code: 'X', message: 'Falhou.' } }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/conta');

    const ana = await screen.findByRole('article', { name: 'Ana Fictícia' });
    await user.click(within(ana).getByRole('checkbox', { name: 'Tensão' }));
    await user.click(within(ana).getByRole('button', { name: /Salvar o que Ana vê/ }));

    expect(await within(ana).findByRole('alert')).toBeInTheDocument();
    expect(within(ana).getByRole('checkbox', { name: 'Tensão' })).not.toBeChecked();
  });
});

describe('aviso de novo vínculo com duas profissionais', () => {
  it('lista as duas antes do "Entendi", porque ele marca todas', async () => {
    linkApi([
      { ...psychologist, seen: false },
      { ...psychiatrist, seen: false },
    ]);
    renderRoute('/registros');

    const notice = await screen.findByRole('region', { name: 'Novo vínculo' });
    expect(notice).toHaveTextContent('Tereza Fictícia (psicóloga');
    expect(notice).toHaveTextContent('Ana Fictícia (psiquiatra');
    expect(notice).toHaveTextContent('Ana ainda não vê nada: escolha em Conta o que pode ver.');
    // A psicóloga já vê tudo: sem o convite para escolher.
    expect(notice).not.toHaveTextContent('Tereza ainda não vê nada');
  });

  it('"Marcar tudo" marca todas as áreas, inclusive as fotos; ainda é preciso salvar', async () => {
    const writes = linkApi([psychologist, psychiatrist]);
    const user = userEvent.setup();
    renderRoute('/conta');

    const ana = await screen.findByRole('article', { name: 'Ana Fictícia' });
    await user.click(within(ana).getByRole('button', { name: /Marcar tudo/ }));
    expect(within(ana).getByText('Ainda não salvo.')).toBeInTheDocument();
    expect(within(ana).getByRole('checkbox', { name: 'Fotos da Ação' })).toBeChecked();
    expect(within(ana).getByRole('button', { name: /Marcar tudo/ })).toBeDisabled();
    await user.click(within(ana).getByRole('button', { name: /Salvar o que Ana vê/ }));

    await waitFor(() => expect(writes[0]?.body).toEqual({ areas: [...SHARED_AREAS] }));
  });
});
