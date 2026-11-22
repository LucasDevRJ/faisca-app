import type { EmailMessage, Mailer } from '../lib/mailer.js';

// Mailer em memória para os testes lerem os e-mails "enviados" (e os links dentro deles).
export class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  readonly sendOptions: ({ idempotencyKey?: string } | undefined)[] = [];
  readonly attempts: { message: EmailMessage; options?: { idempotencyKey?: string } }[] = [];
  sendError: Error | null = null;

  async send(message: EmailMessage, options?: { idempotencyKey?: string }) {
    this.attempts.push({ message, options });
    if (this.sendError) throw this.sendError;
    this.sent.push(message);
    this.sendOptions.push(options);
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
