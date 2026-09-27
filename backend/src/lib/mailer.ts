import { Resend } from 'resend';
import { env } from '../config/env.js';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

// Interface para os testes trocarem o Resend por um mailer em memória (FakeMailer).
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export function createResendMailer(): Mailer {
  const resend = new Resend(env.RESEND_API_KEY);

  return {
    async send(message) {
      const { error } = await resend.emails.send({ from: env.EMAIL_FROM, ...message });
      // Só o nome do erro vai adiante: a mensagem do Resend pode citar o destinatário.
      if (error) throw new Error(`Falha no envio de e-mail pelo Resend (${error.name})`);
    },
  };
}
