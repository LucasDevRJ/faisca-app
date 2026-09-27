import type { EmailMessage, Mailer } from '../lib/mailer.js';

// Mailer em memória para os testes lerem os e-mails "enviados" (e os links dentro deles).
export class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
  }

  lastTo(to: string): EmailMessage | undefined {
    return this.sent.findLast((message) => message.to === to);
  }

  // Extrai o token do link (…?token=abc) do último e-mail enviado para o endereço.
  lastTokenTo(to: string): string {
    const match = this.lastTo(to)?.text.match(/[?&]token=([\w-]+)/);
    if (!match?.[1]) throw new Error('Nenhum link com token no último e-mail para este endereço.');
    return match[1];
  }
}
