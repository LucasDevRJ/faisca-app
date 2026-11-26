import { env } from '../../config/env.js';
import type { ProfessionalKind } from '../../generated/prisma/client.js';
import type { EmailMessage } from '../../lib/mailer.js';
import { escapeHtml, layout } from '../auth/auth.emails.js';
import type { TeamContactTopic } from './profile.schema.js';

const TOPIC_LABELS: Record<TeamContactTopic, string> = {
  SUGESTAO: 'Sugestão',
  PROBLEMA: 'Problema',
  DUVIDA: 'Dúvida',
  REVISAO_TEXTOS: 'Revisão de textos',
};

const KIND_LABELS: Record<ProfessionalKind, string> = {
  PSICOLOGIA: 'Psicóloga',
  PSIQUIATRIA: 'Psiquiatra',
};

// Mensagem enviada pela profissional no formulário "Fale com a equipe" (#332, DEC-142).
// Vai para a caixa do suporte com replyTo da profissional e não fica guardada no banco.
export function teamContactEmail(input: {
  name: string;
  email: string;
  professionalKind: ProfessionalKind | null;
  topic: TeamContactTopic;
  message: string;
}): EmailMessage {
  const topicLabel = TOPIC_LABELS[input.topic];
  const kindLabel = input.professionalKind ? KIND_LABELS[input.professionalKind] : 'Profissional';
  const cleanSubjectName = input.name.replaceAll(/[\r\n]+/g, ' ').trim();
  const paragraphs = input.message
    .split(/\r?\n\r?\n/)
    .map((block) => escapeHtml(block.trim()).replaceAll(/\r?\n/g, '<br>'))
    .filter(Boolean);

  return {
    to: env.SUPPORT_EMAIL,
    replyTo: input.email,
    subject: `[Faísca · Equipe] ${topicLabel} — ${cleanSubjectName}`,
    html: layout([
      `<strong>Assunto:</strong> ${escapeHtml(topicLabel)}`,
      `<strong>De:</strong> ${escapeHtml(input.name)} (${escapeHtml(kindLabel)}) · ${escapeHtml(input.email)}`,
      ...paragraphs,
    ]),
    text: `Assunto: ${topicLabel}\nDe: ${input.name} (${kindLabel}) · ${input.email}\n\n${input.message}`,
  };
}
