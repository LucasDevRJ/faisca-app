import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Message } from '../features/messages/messages-api';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

const linkId = '00000000-0000-4000-8000-000000000010';
const conversation = { id: linkId, name: 'Profissional Fictícia', counterpart: 'PSICOLOGIA', available: true };
const url = `*/api/messages/${linkId}`;

describe('Mensagens privadas', () => {
  it('responde com o assunto mais recente e só abre o seletor ao mudar de assunto', async () => {
    const user = userEvent.setup();
    const messages: Message[] = [
      { id: '2', topic: 'DUVIDA', body: 'Dúvida fictícia', mine: false, createdAt: '2026-11-22T18:01:00Z' },
      { id: '1', topic: 'LOGISTICA', body: 'Horário fictício', mine: true, createdAt: '2026-11-22T18:00:00Z' },
    ];
    const sentTopics: Message['topic'][] = [];
    server.use(
      loggedIn,
      http.get('*/api/messages', () => HttpResponse.json([conversation])),
      http.get(url, () => HttpResponse.json({ messages, next: null })),
      http.post(url, async ({ request }) => {
        const input = await request.json() as Pick<Message, 'topic' | 'body'>;
        sentTopics.push(input.topic);
        const message = { ...input, id: String(messages.length + 1), mine: true, createdAt: '2026-11-22T18:02:00Z' };
        messages.unshift(message);
        return HttpResponse.json(message, { status: 201 });
      }),
    );
    renderRoute(`/mensagens/${linkId}`);
    const field = await screen.findByRole('textbox', { name: 'Mensagem' });
    expect(screen.getByText(/Respondendo sobre/)).toHaveTextContent('Dúvida breve');
    expect(screen.queryByRole('combobox', { name: 'Assunto' })).not.toBeInTheDocument();
    await user.type(field, 'Minha resposta');
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(await screen.findByText('Minha resposta')).toBeInTheDocument();

    const changeTopic = screen.getByRole('button', { name: 'Mudar de assunto' });
    await user.click(changeTopic);
    expect(changeTopic).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Assunto' })).toHaveFocus();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assunto' }), 'LOGISTICA');
    await user.type(field, 'Outro assunto');
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(await screen.findByText('Outro assunto')).toBeInTheDocument();
    expect(await screen.findByText(/Respondendo sobre/)).toHaveTextContent('Logística da consulta');
    expect(sentTopics).toEqual(['DUVIDA', 'LOGISTICA']);
  });

  it('mantém o texto se o envio falhar e o exibe após tentar de novo', async () => {
    const user = userEvent.setup();
    const text = 'Podemos confirmar o horário fictício?';
    let shouldFail = true;
    const messages: Message[] = [];
    server.use(
      loggedIn,
      http.get('*/api/messages', () => HttpResponse.json([conversation])),
      http.get(url, () => HttpResponse.json({ messages, next: null })),
      http.post(url, async ({ request }) => {
        if (shouldFail) return HttpResponse.json({ error: { message: 'Tente novamente.' } }, { status: 503 });
        const input = await request.json() as Pick<Message, 'topic' | 'body'>;
        const message = { ...input, id: '1', mine: true, createdAt: '2026-11-22T18:00:00Z' };
        messages.push(message);
        return HttpResponse.json(message, { status: 201 });
      }),
    );
    renderRoute('/mensagens');
    await user.click(await screen.findByRole('link', { name: conversation.name }));
    const field = await screen.findByRole('textbox', { name: 'Mensagem' });
    await user.type(field, text);
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(await screen.findByText('Tente novamente.')).toBeInTheDocument();
    expect(field).toHaveValue(text);
    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(field).toHaveValue('');
  });

  it('pede o aceite e não busca conversas quando a área está bloqueada', async () => {
    let fetched = false;
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({
        user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, messages: false } },
      })),
      http.get('*/api/messages', () => {
        fetched = true;
        return HttpResponse.json([]);
      }),
    );
    renderRoute('/mensagens');
    expect(await screen.findByText(/Para trocar mensagens com quem acompanha você/)).toBeInTheDocument();
    expect(fetched).toBe(false);
  });

  it('lista mostra "Nova" e a prévia; abrir a conversa marca o "visto" na mais recente (DEC-127)', async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    const messages: Message[] = [
      { id: '00000000-0000-4000-8000-0000000000b2', topic: 'LOGISTICA', body: 'Podemos mudar para 15h?', mine: false, createdAt: '2026-11-22T18:01:00Z' },
      { id: '00000000-0000-4000-8000-0000000000b1', topic: 'LOGISTICA', body: 'Oi', mine: true, createdAt: '2026-11-22T18:00:00Z' },
    ];
    server.use(
      loggedIn,
      http.get('*/api/messages', () => HttpResponse.json([{ ...conversation, unread: true,
        lastMessage: { preview: 'Podemos mudar para 15h?', mine: false, createdAt: '2026-11-22T18:01:00Z' } }])),
      http.get(url, () => HttpResponse.json({ messages, next: null })),
      http.put(`${url}/seen`, async ({ request }) => {
        seen.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/mensagens');
    const item = await screen.findByRole('link', { name: /Profissional Fictícia, mensagem nova/ });
    expect(screen.getByText('Nova')).toBeInTheDocument();
    expect(screen.getByText(/Podemos mudar para 15h\?/)).toBeInTheDocument();

    await user.click(item);
    expect(await screen.findByRole('textbox', { name: 'Mensagem' })).toBeInTheDocument();
    await waitFor(() => expect(seen).toEqual([{ lastMessageId: messages[0]!.id }]));
    // Com poucas mensagens, o campo já está à vista: sem o atalho "Ir para escrever".
    expect(screen.queryByRole('button', { name: 'Ir para escrever mensagem' })).not.toBeInTheDocument();
  });

  it('o aviso de urgência traz o CVV e o SAMU com toque para ligar', async () => {
    server.use(loggedIn, http.get('*/api/messages', () => HttpResponse.json([])));
    renderRoute('/mensagens');
    expect(await screen.findByRole('link', { name: 'CVV, no 188' })).toHaveAttribute('href', 'tel:188');
    expect(screen.getByRole('link', { name: 'SAMU, no 192' })).toHaveAttribute('href', 'tel:192');
  });

  it('o menu mostra o selo de mensagem nova só com o aceite das Mensagens', async () => {
    server.use(loggedIn, http.get('*/api/messages/unread', () => HttpResponse.json({ unread: true })));
    renderRoute('/conta');
    expect(await screen.findByRole('link', { name: 'Mensagens, há mensagem nova' })).toBeInTheDocument();
  });

  it('em conversa longa aparece o atalho "Ir para escrever mensagem"', async () => {
    const messages: Message[] = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000000c${index}`, topic: 'LOGISTICA', body: `Mensagem fictícia ${index}`,
      mine: index % 2 === 0, createdAt: `2026-11-22T18:0${5 - index}:00Z`,
    }));
    server.use(loggedIn, http.get('*/api/messages', () => HttpResponse.json([{ ...conversation, unread: false, lastMessage: null }])),
      http.get(url, () => HttpResponse.json({ messages, next: null })));
    renderRoute(`/mensagens/${linkId}`);
    expect(await screen.findByRole('button', { name: 'Ir para escrever mensagem' })).toBeInTheDocument();
  });

  it('"Sobre um registro": escolhe o registro, envia a referência e mostra o cartão (DEC-128)', async () => {
    const user = userEvent.setup();
    const recordId = '00000000-0000-4000-8000-0000000000d1';
    const messages: Message[] = [{ id: '00000000-0000-4000-8000-0000000000d0', topic: 'LOGISTICA', body: 'Oi', mine: false, createdAt: '2026-11-22T18:00:00Z', record: null }];
    const sent: unknown[] = [];
    server.use(
      loggedIn,
      http.get('*/api/messages', () => HttpResponse.json([{ ...conversation, unread: false, lastMessage: null, recordTopics: true, recordTypes: ['THOUGHT_RECORD'] }])),
      http.get(url, () => HttpResponse.json({ messages, next: null })),
      http.get('*/api/record-links/candidates', ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get('recordId')).toBeNull();
        return HttpResponse.json({ records: [
          { type: 'THOUGHT_RECORD', id: recordId, date: params.get('to'), title: 'Achei que ia dar tudo errado' },
          { type: 'ACTIVITY', id: '00000000-0000-4000-8000-0000000000d2', date: params.get('to'), title: 'Atividade de área fechada' },
        ] });
      }),
      http.post(url, async ({ request }) => {
        const input = await request.json() as Record<string, unknown>;
        sent.push(input);
        const message = { ...input, id: '00000000-0000-4000-8000-0000000000d3', mine: true, createdAt: '2026-11-22T18:02:00Z',
          record: { type: 'THOUGHT_RECORD', id: recordId, date: '2026-11-22', title: 'Achei que ia dar tudo errado' } } as Message;
        messages.unshift(message);
        return HttpResponse.json(message, { status: 201 });
      }),
    );
    renderRoute(`/mensagens/${linkId}`);
    await user.click(await screen.findByRole('button', { name: 'Mudar de assunto' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assunto' }), 'REGISTRO');
    expect(screen.getByText(/O conteúdo em si vocês conversam na consulta/)).toBeInTheDocument();
    // Só os tipos liberados para a profissional aparecem.
    await user.click(await screen.findByRole('radio', { name: /Achei que ia dar tudo errado/ }));
    expect(screen.queryByRole('radio', { name: /Atividade de área fechada/ })).not.toBeInTheDocument();
    // A busca do seletor não dispara o envio da mensagem (revisor-telas).
    await user.type(screen.getByRole('searchbox', { name: 'Buscar no texto' }), 'nada{Enter}');
    expect(screen.queryByText('Escreva uma mensagem antes de enviar.')).not.toBeInTheDocument();
    expect(sent).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    await user.click(await screen.findByRole('radio', { name: /Achei que ia dar tudo errado/ }));
    await user.click(screen.getByRole('button', { name: 'Escolher' }));
    expect(screen.getByRole('button', { name: 'Trocar registro' })).toHaveFocus();

    await user.type(screen.getByRole('textbox', { name: 'Mensagem' }), 'Dúvida fictícia sobre esse registro');
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await waitFor(() => expect(sent).toEqual([{ topic: 'REGISTRO', body: 'Dúvida fictícia sobre esse registro', record: { type: 'THOUGHT_RECORD', id: recordId } }]));
    expect((await screen.findAllByRole('link', { name: 'Abrir registro' })).length).toBeGreaterThan(0);
  });

  it('sem a opção da profissional, o assunto não aparece; registro indisponível não mostra nada dele', async () => {
    const user = userEvent.setup();
    const messages: Message[] = [{ id: '00000000-0000-4000-8000-0000000000e1', topic: 'REGISTRO', body: 'Sobre aquele dia', mine: true, createdAt: '2026-11-22T18:00:00Z', record: { unavailable: true } }];
    server.use(
      loggedIn,
      http.get('*/api/messages', () => HttpResponse.json([{ ...conversation, unread: false, lastMessage: null, recordTopics: false, recordTypes: [] }])),
      http.get(url, () => HttpResponse.json({ messages, next: null })),
    );
    renderRoute(`/mensagens/${linkId}`);
    expect(await screen.findByText('Registro indisponível')).toBeInTheDocument();
    // O registro sumiu: a resposta vira uma dúvida breve.
    expect(screen.getByText(/Respondendo sobre/)).toHaveTextContent('Dúvida breve');
    await user.click(screen.getByRole('button', { name: 'Mudar de assunto' }));
    expect(screen.queryByRole('option', { name: 'Sobre um registro' })).not.toBeInTheDocument();
  });

  it('a profissional escolhe se recebe mensagens sobre registros', async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } })),
      http.get('*/api/messages/preferences', () => HttpResponse.json({ email: true, push: false, recordTopics: true, pushPublicKey: null })),
      http.put('*/api/messages/preferences', async ({ request }) => {
        saved.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/mensagens/avisos');
    const option = await screen.findByRole('checkbox', { name: 'Receber mensagens sobre registros' });
    expect(option).toBeChecked();
    await user.click(option);
    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    await waitFor(() => expect(saved).toEqual([{ email: true, push: false, recordTopics: false }]));
  });
});
