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
});
