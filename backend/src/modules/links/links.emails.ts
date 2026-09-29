import { env } from '../../config/env.js';
import type { EmailMessage } from '../../lib/mailer.js';
import { escapeHtml, layout } from '../auth/auth.emails.js';

// E-mails do vínculo. Levam nomes e e-mails das duas pessoas, que cada lado precisa ver
// (SPEC, "Regras comuns"), e nunca atividade, nota ou observação (regra 3).

export function inviteEmail(to: string, patientName: string, token: string): EmailMessage {
  const url = new URL('/convite', env.FRONTEND_URL);
  url.searchParams.set('token', token);
  return {
    to,
    subject: `${patientName} convidou você para o Faísca`,
    html: layout(
      [
        `Olá! <strong>${escapeHtml(patientName)}</strong> quer compartilhar com você os registros de atividades feitos no Faísca.`,
        'Pelo botão abaixo você entra na sua conta (ou cria uma, com o perfil de terapeuta) e o vínculo é feito na hora. Você só vai poder ler os registros, nunca alterar.',
        'O convite vale uma vez. Se você não conhece quem enviou, pode ignorar esta mensagem.',
      ],
      { label: 'Aceitar convite', url: url.toString() },
    ),
    text: `Olá! ${patientName} quer compartilhar com você os registros de atividades feitos no Faísca.\n\nPara aceitar, entre na sua conta (ou crie uma, com o perfil de terapeuta): ${url.toString()}\n\nVocê só vai poder ler os registros, nunca alterar. O convite vale uma vez. Se você não conhece quem enviou, pode ignorar esta mensagem.`,
  };
}

// Aviso ao paciente (DEC-031): mesmo que não abra o app, fica sabendo quem passou a ver os registros.
export function linkCreatedEmail(
  to: string,
  patientName: string,
  therapist: { name: string; email: string },
): EmailMessage {
  const url = new URL('/conta', env.FRONTEND_URL).toString();
  return {
    to,
    subject: 'Sua terapeuta agora acompanha seus registros no Faísca',
    html: layout(
      [
        `Olá, ${escapeHtml(patientName)}!`,
        `<strong>${escapeHtml(therapist.name)}</strong> (${escapeHtml(therapist.email)}) agora pode ler seus registros no Faísca.`,
        'Se não reconhece essa pessoa, você pode desfazer o vínculo a qualquer momento na sua conta. O acesso cai na hora.',
      ],
      { label: 'Ver minha conta', url },
    ),
    text: `Olá, ${patientName}!\n\n${therapist.name} (${therapist.email}) agora pode ler seus registros no Faísca.\n\nSe não reconhece essa pessoa, você pode desfazer o vínculo a qualquer momento na sua conta: ${url}`,
  };
}
