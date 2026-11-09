import { env } from '../../config/env.js';
import { APP_TIME_ZONE } from '../../lib/dates.js';
import type { EmailMessage } from '../../lib/mailer.js';
import type { PushMessage } from '../../lib/web-push.js';

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

// Enviado depois de excluir a conta (DEC-035): se não foi a própria pessoa, ela fica sabendo.
// Sem link: não há mais conta para entrar. Conta o prazo das cópias de segurança (DEC-075, DEC-078).
export function accountDeletedEmail(to: string, name: string): EmailMessage {
  return {
    to,
    subject: 'Sua conta no Faísca foi excluída',
    html: layout([
      `Olá, ${escapeHtml(name)}.`,
      'Sua conta no Faísca foi excluída, junto com os registros, as consultas e os vínculos.',
      'As cópias de segurança do Faísca, que são criptografadas e não são abertas, expiram em até 5 semanas. Depois disso, não sobra nada da sua conta.',
      'Obrigado por ter usado o Faísca. Se quiser voltar um dia, é só criar uma conta nova.',
    ]),
    text: `Olá, ${name}.

Sua conta no Faísca foi excluída, junto com os registros, as consultas e os vínculos.

As cópias de segurança do Faísca, que são criptografadas e não são abertas, expiram em até 5 semanas. Depois disso, não sobra nada da sua conta.

Obrigado por ter usado o Faísca. Se quiser voltar um dia, é só criar uma conta nova.`,
  };
}

// "09/11/2026, às 21:40", no horário de Brasília.
function formatWhen(when: Date): string {
  const date = when.toLocaleDateString('pt-BR', { timeZone: APP_TIME_ZONE });
  const time = when.toLocaleTimeString('pt-BR', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
  return `${date}, às ${time}`;
}

// Aviso de login novo (DEC-091): sem link, como o de senha trocada, para não servir de isca. Só o
// navegador e o sistema, sem IP nem localização.
export function loginAlertEmail(to: string, name: string, when: Date, device: string | null): EmailMessage {
  const access = `Alguém entrou na sua conta do Faísca em ${formatWhen(when)} (horário de Brasília)${device ? `, pelo ${device}` : ''}.`;
  const paragraphs = [
    'Se foi você, está tudo certo e não precisa fazer nada.',
    'Se não foi você, crie uma senha nova agora: abra o Faísca e toque em "Esqueci minha senha" na tela de entrada. A senha nova tira da sua conta todos os aparelhos conectados.',
    'Se não quiser mais receber este aviso, desligue em Conta → Segurança.',
  ];
  return {
    to,
    subject: 'Novo acesso à sua conta no Faísca',
    html: layout([`Olá, ${escapeHtml(name)}.`, escapeHtml(access), ...paragraphs.map(escapeHtml)]),
    text: [`Olá, ${name}.`, access, ...paragraphs].join('\n\n'),
  };
}

// O mesmo aviso no push dos aparelhos onde a pessoa ligou as notificações (DEC-091). Neutro (regra 3).
export function loginAlertPushMessage(): PushMessage {
  return {
    title: 'Faísca',
    body: 'Alguém entrou na sua conta. Se não foi você, use "Esqueci minha senha" na tela de entrada.',
    url: '/conta',
  };
}

// O aviso de acesso foi desligado (DEC-091): sem link; quem roubou uma sessão não desliga em silêncio.
export function loginAlertDisabledEmail(to: string, name: string): EmailMessage {
  const paragraphs = [
    'O aviso de novos acessos da sua conta no Faísca foi desligado.',
    'Se não foi você, crie uma senha nova em "Esqueci minha senha", na tela de entrada.',
  ];
  return {
    to,
    subject: 'O aviso de novos acessos foi desligado',
    html: layout([`Olá, ${escapeHtml(name)}.`, ...paragraphs.map(escapeHtml)]),
    text: [`Olá, ${name}.`, ...paragraphs].join('\n\n'),
  };
}

// Aviso de senha trocada (DEC-085): sem link, para não servir de isca; quem não trocou usa o
// "Esqueci minha senha" da tela de entrar.
export function passwordChangedEmail(to: string, name: string): EmailMessage {
  return {
    to,
    subject: 'A senha da sua conta no Faísca foi trocada',
    html: layout([
      `Olá, ${escapeHtml(name)}.`,
      'A senha da sua conta no Faísca foi trocada agora há pouco. Por segurança, saímos da sua conta nos outros aparelhos.',
      'Se foi você, está tudo certo e não precisa fazer nada.',
      'Se não foi você, abra o Faísca, toque em "Esqueci minha senha" na tela de entrada e crie uma senha nova.',
    ]),
    text: `Olá, ${name}.

A senha da sua conta no Faísca foi trocada agora há pouco. Por segurança, saímos da sua conta nos outros aparelhos.

Se foi você, está tudo certo e não precisa fazer nada.

Se não foi você, abra o Faísca, toque em "Esqueci minha senha" na tela de entrada e crie uma senha nova.`,
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
