import { env } from '../../config/env.js';
import type { EmailMessage } from '../../lib/mailer.js';

// Textos dos e-mails de conta. Tom acolhedor e sem pressão (SPEC, "Tom e interface").
// Nenhum deles cita atividade, nota ou observação.

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function layout(paragraphs: string[], button?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#5b7f67;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(button.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#2b3a30;max-width:480px">${body}${cta}<p style="margin:24px 0 0;color:#6b7a70;font-size:14px">Faísca</p></div>`;
}

function link(path: string, token: string): string {
  const url = new URL(path, env.FRONTEND_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

export function confirmationEmail(to: string, name: string, token: string): EmailMessage {
  const url = link('/confirmar-email', token);
  return {
    to,
    subject: 'Confirme seu e-mail no Faísca',
    html: layout(
      [
        `Olá, ${escapeHtml(name)}!`,
        'Que bom ter você por aqui. Para começar a usar o Faísca, confirme seu e-mail no botão abaixo.',
        'O link vale por 24 horas. Se não foi você que criou a conta, pode ignorar esta mensagem.',
      ],
      { label: 'Confirmar e-mail', url },
    ),
    text: `Olá, ${name}!\n\nPara começar a usar o Faísca, confirme seu e-mail: ${url}\n\nO link vale por 24 horas. Se não foi você que criou a conta, pode ignorar esta mensagem.`,
  };
}

// Enviado quando alguém tenta se cadastrar com um e-mail que já tem conta confirmada.
// A API responde igual nos dois casos; só o dono do e-mail fica sabendo.
export function accountExistsEmail(to: string): EmailMessage {
  const url = new URL('/entrar', env.FRONTEND_URL).toString();
  return {
    to,
    subject: 'Você já tem uma conta no Faísca',
    html: layout(
      [
        'Alguém tentou criar uma conta no Faísca com este e-mail, mas ele já está cadastrado.',
        'Se foi você, é só entrar. Esqueceu a senha? Na tela de entrada dá para criar uma nova.',
        'Se não foi você, pode ignorar esta mensagem: nada mudou na sua conta.',
      ],
      { label: 'Entrar no Faísca', url },
    ),
    text: `Alguém tentou criar uma conta no Faísca com este e-mail, mas ele já está cadastrado.\n\nSe foi você, é só entrar: ${url}\n\nSe não foi você, pode ignorar esta mensagem: nada mudou na sua conta.`,
  };
}

export function passwordResetEmail(to: string, name: string, token: string): EmailMessage {
  const url = link('/redefinir-senha', token);
  return {
    to,
    subject: 'Crie uma nova senha no Faísca',
    html: layout(
      [
        `Olá, ${escapeHtml(name)}!`,
        'Recebemos um pedido para criar uma nova senha. Use o botão abaixo para escolher a nova senha.',
        'O link vale por 1 hora. Se não foi você que pediu, pode ignorar: sua senha continua a mesma.',
      ],
      { label: 'Criar nova senha', url },
    ),
    text: `Olá, ${name}!\n\nPara criar uma nova senha no Faísca, acesse: ${url}\n\nO link vale por 1 hora. Se não foi você que pediu, pode ignorar: sua senha continua a mesma.`,
  };
}
