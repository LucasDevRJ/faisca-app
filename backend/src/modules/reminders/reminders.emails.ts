import { env } from '../../config/env.js';
import type { EmailMessage } from '../../lib/mailer.js';
import type { PushMessage } from '../../lib/web-push.js';
import type { ReminderType } from '../../generated/prisma/client.js';
import { escapeHtml, layout } from '../auth/auth.emails.js';

// Regra inviolável 3 (AGENTS.md, DEC-005): notificações e e-mails de lembrete nunca contêm nome de
// atividade, nome de ação, notas ou observações. Os textos vêm exclusivamente destes templates
// fixos e respeitam o ajuste "Linguagem direta" (DEC-076, DEC-087).

export function reminderPushMessage(type: ReminderType, directLanguage: boolean): PushMessage {
  if (type === 'MANHA') {
    return {
      title: 'Faísca',
      body: directLanguage
        ? 'Bom dia! Há itens planejados para hoje no Faísca. Abra o aplicativo quando quiser.'
        : 'Bom dia! Você planejou algo para hoje no Faísca. Quando quiser, passe por lá.',
      url: '/registros',
    };
  }
  return {
    title: 'Faísca',
    body: directLanguage
      ? 'Olá! Há registros de hoje ou de dias anteriores abertos no Faísca. Abra o aplicativo quando puder.'
      : 'Oi! Como foi o seu dia? Quando puder, passe no Faísca para registrar.',
    url: '/registros',
  };
}

export function reminderEmail(
  to: string,
  name: string,
  type: ReminderType,
  options: { directLanguage: boolean; fallbackFromPush: boolean },
): EmailMessage {
  const recordsUrl = new URL('/registros', env.FRONTEND_URL).toString();
  const accountUrl = new URL('/conta', env.FRONTEND_URL).toString();
  const safeName = escapeHtml(name);

  const subject =
    type === 'MANHA' ? 'Seu lembrete da manhã no Faísca' : 'Seu lembrete da noite no Faísca';

  const mainParagraph =
    type === 'MANHA'
      ? options.directLanguage
        ? 'Há itens planejados para hoje no Faísca. Quando quiser, abra o aplicativo para consultar ou atualizar seus registros.'
        : 'Você planejou algo para hoje no Faísca. Quando quiser, passe por lá para ver o seu dia.'
      : options.directLanguage
        ? 'Há registros de hoje ou de dias anteriores abertos no Faísca. Quando puder, abra o aplicativo para registrar.'
        : 'Como foi o seu dia? Quando puder, passe no Faísca para contar como foi — ou registrar que hoje não deu, sem pressa.';

  const fallbackParagraph = options.fallbackFromPush
    ? 'Não conseguimos entregar a notificação no seu aparelho, por isso enviamos este lembrete por e-mail.'
    : null;

  const manageHtml = `Você pode mudar o horário, pausar ou desligar os lembretes a qualquer momento em <a href="${escapeHtml(accountUrl)}" style="color:#365346;text-decoration:underline">Conta</a>.`;
  const manageText = `Você pode mudar o horário, pausar ou desligar os lembretes a qualquer momento em Conta: ${accountUrl}`;

  const paragraphs = [
    `Olá, ${safeName}!`,
    mainParagraph,
    ...(fallbackParagraph ? [fallbackParagraph] : []),
    manageHtml,
  ];

  const textLines = [
    `Olá, ${name}!`,
    '',
    mainParagraph,
    '',
    `Abrir o Faísca: ${recordsUrl}`,
    ...(fallbackParagraph ? ['', fallbackParagraph] : []),
    '',
    manageText,
  ];

  return {
    to,
    subject,
    html: layout(paragraphs, { label: 'Abrir o Faísca', url: recordsUrl }),
    text: textLines.join('\n'),
  };
}
