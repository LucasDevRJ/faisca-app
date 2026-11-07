import {
  generateVapidKeys,
  type PushMessage,
  type PushSender,
  type PushSendResult,
  type PushSubscriptionTarget,
} from '../lib/web-push.js';

export type SentPush = {
  target: PushSubscriptionTarget;
  message: PushMessage;
};

const DEFAULT_VAPID = generateVapidKeys();

export class FakePushSender implements PushSender {
  readonly sent: SentPush[] = [];
  configured: boolean;
  publicKey: string | null;
  private readonly outcomes = new Map<string, PushSendResult>();
  defaultOutcome: PushSendResult = 'sent';

  constructor(options: { configured?: boolean; publicKey?: string | null } = {}) {
    this.configured = options.configured ?? true;
    this.publicKey = this.configured ? (options.publicKey ?? DEFAULT_VAPID.publicKey) : null;
  }

  setOutcomeForEndpoint(endpoint: string, result: PushSendResult) {
    this.outcomes.set(endpoint, result);
  }

  async send(target: PushSubscriptionTarget, message: PushMessage): Promise<PushSendResult> {
    if (!this.configured) return 'failed';
    const outcome = this.outcomes.get(target.endpoint) ?? this.defaultOutcome;
    if (outcome === 'sent') {
      this.sent.push({ target, message });
    }
    return outcome;
  }
}
