import type { EmailMessage } from '../../lib/mailer.js';
import { escapeHtml, layout } from '../auth/auth.emails.js';

// E-mails do 2FA (DEC-092): neutros e sem link (como os de senha trocada e de acesso novo, DEC-085 e
// DEC-091), para nenhum deles servir de isca. Textos aprovados pelo usuário.

const NOT_YOU = 'Se não foi você, crie uma senha nova em "Esqueci minha senha", na tela de entrada.';

function message(to: string, name: string, subject: string, paragraphs: string[]): EmailMessage {
  return {
    to,
    subject,
    html: layout([`Olá, ${escapeHtml(name)}.`, ...paragraphs.map(escapeHtml)]),
    text: [`Olá, ${name}.`, ...paragraphs].join('\n\n'),
  };
}

export function twoFactorCodeEmail(to: string, name: string, code: string, forLogin: boolean): EmailMessage {
  // O código fica só no corpo, não no assunto: o assunto aparece na tela bloqueada do celular.
  return message(to, name, forLogin ? 'Seu código para entrar no Faísca' : 'Seu código de confirmação do Faísca', [
    `Seu código do Faísca é ${code}. Ele vale por 10 minutos.`,
    forLogin
      ? 'Se não foi você que tentou entrar, crie uma senha nova em "Esqueci minha senha", na tela de entrada.'
      : 'Se não foi você que pediu este código, crie uma senha nova em "Esqueci minha senha", na tela de entrada.',
  ]);
}

export function twoFactorEnabledEmail(to: string, name: string): EmailMessage {
  return message(to, name, 'A verificação em duas etapas foi ligada', [
    'A verificação em duas etapas da sua conta no Faísca foi ligada.',
    NOT_YOU,
  ]);
}

export function twoFactorDisabledEmail(to: string, name: string): EmailMessage {
  return message(to, name, 'A verificação em duas etapas foi desligada', [
    'A verificação em duas etapas da sua conta no Faísca foi desligada.',
    NOT_YOU,
  ]);
}

// Segundo jeito ligado, códigos novos e entrada travada (DEC-092): sem a senha sozinha fazer nada em
// silêncio (achados do revisor-seguranca).
export function twoFactorMethodAddedEmail(to: string, name: string, method: 'EMAIL' | 'TOTP'): EmailMessage {
  const how = method === 'EMAIL' ? 'o código por e-mail' : 'um app autenticador';
  return message(to, name, 'Um novo jeito de confirmar que é você foi ligado', [
    `Um novo jeito de confirmar que é você foi ligado na sua conta do Faísca: ${how}.`,
    NOT_YOU,
  ]);
}

export function twoFactorNewCodesEmail(to: string, name: string): EmailMessage {
  return message(to, name, 'Seus códigos de recuperação foram trocados', [
    'Os códigos de recuperação da sua conta do Faísca foram trocados por novos. Os antigos não valem mais.',
    NOT_YOU,
  ]);
}

export function twoFactorBlockedEmail(to: string, name: string): EmailMessage {
  return message(to, name, 'Tentativas de entrar na sua conta do Faísca', [
    'Alguém acertou a senha da sua conta no Faísca, mas errou várias vezes o código da verificação em duas etapas. Por segurança, a entrada ficou bloqueada por 15 minutos.',
    'Se não foi você, crie uma senha nova agora em "Esqueci minha senha", na tela de entrada.',
  ]);
}
