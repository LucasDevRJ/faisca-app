import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import type { Mailer } from './mailer.js';

// Alertas de comportamento estranho (DEC-141, #117): contadores em memória, numa janela de
// 10 minutos, que avisam o dono do Faísca por e-mail quando passam do limite.
// Basta enquanto a API roda em uma instância só (como o rate limit); reiniciar zera a contagem.
// Nada de dado pessoal: o e-mail leva só o tipo e o número; o log, no máximo o id da conta.

export type SecurityAlertKind = 'login_failed' | 'forbidden' | 'rate_limited' | 'server_error';

type KindConfig = { limit: number; perAccount: boolean; label: string; hint: string };

export const SECURITY_ALERT_KINDS: Record<SecurityAlertKind, KindConfig> = {
  login_failed: {
    limit: 30,
    perAccount: false,
    label: 'logins com senha errada',
    hint: 'Pode ser alguém testando senhas.',
  },
  forbidden: {
    limit: 15,
    perAccount: true,
    label: 'acessos negados (403) de uma mesma conta',
    hint: 'Pode ser alguém tentando ver dado de outra pessoa. O id da conta está no log do Railway.',
  },
  rate_limited: {
    limit: 20,
    perAccount: false,
    label: 'respostas de "muitas tentativas" (429)',
    hint: 'Pode ser um robô ou um ataque.',
  },
  server_error: {
    limit: 10,
    perAccount: false,
    label: 'erros da API (500 ou mais)',
    hint: 'Algo pode ter quebrado. Veja o log do Railway.',
  },
};

export const ALERT_WINDOW_MINUTES = 10;
export const ALERT_COOLDOWN_MINUTES = 60;
// Teto de contas acompanhadas ao mesmo tempo, para um ataque com muitas contas não encher a memória.
const MAX_TRACKED_KEYS = 5000;

export type SecurityAlerts = {
  record(kind: SecurityAlertKind, accountId?: string): void;
};

type Options = {
  mailer: Mailer;
  to?: string;
  now?: () => number;
};

export function createSecurityAlerts({ mailer, to = env.SECURITY_ALERT_EMAIL, now = Date.now }: Options): SecurityAlerts {
  const windowMs = ALERT_WINDOW_MINUTES * 60 * 1000;
  const cooldownMs = ALERT_COOLDOWN_MINUTES * 60 * 1000;
  // Chave: tipo, ou tipo + conta. Valor: os instantes dentro da janela.
  const hits = new Map<string, number[]>();
  const lastAlertAt = new Map<SecurityAlertKind, number>();

  function prune(current: number) {
    for (const [key, times] of hits) {
      const recent = times.filter((time) => current - time < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }

  function alert(kind: SecurityAlertKind, count: number, accountId: string | undefined, current: number) {
    const last = lastAlertAt.get(kind);
    if (last !== undefined && current - last < cooldownMs) return;
    lastAlertAt.set(kind, current);

    const config = SECURITY_ALERT_KINDS[kind];
    // O id da conta só vai para o log (regra 7: nada de nome, e-mail ou IP).
    logger.warn({ securityAlert: kind, count, windowMinutes: ALERT_WINDOW_MINUTES, userId: accountId }, 'Alerta de segurança');
    if (!to) return;

    const summary = `${count} ${config.label} em ${ALERT_WINDOW_MINUTES} minutos.`;
    const text = [
      'Alerta de segurança do Faísca.',
      '',
      summary,
      config.hint,
      '',
      `Outros alertas deste tipo ficam em silêncio por ${ALERT_COOLDOWN_MINUTES} minutos.`,
      'O que fazer: docs/DEPLOY.md, seção "Alertas de segurança".',
    ].join('\n');
    const html = text
      .split('\n')
      .map((line) => (line ? `<p>${line.replace(/"/g, '&quot;')}</p>` : ''))
      .join('');
    mailer.send({ to, subject: 'Faísca: alerta de segurança', text, html }).catch((err: unknown) => {
      logger.error({ err, securityAlert: kind }, 'Falha ao enviar o alerta de segurança');
    });
  }

  return {
    record(kind, accountId) {
      const current = now();
      const config = SECURITY_ALERT_KINDS[kind];
      const key = config.perAccount ? `${kind}:${accountId ?? 'sem-conta'}` : kind;

      if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) prune(current);
      if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) return;

      const times = (hits.get(key) ?? []).filter((time) => current - time < windowMs);
      times.push(current);
      hits.set(key, times);

      if (times.length >= config.limit) {
        alert(kind, times.length, config.perAccount ? accountId : undefined, current);
      }
    },
  };
}

function isFailedLogin(req: Request, status: number) {
  // originalUrl, e não path: no 'finish' o req.url pode ter passado por um Router.
  return status === 401 && req.method === 'POST' && req.originalUrl.split('?')[0] === '/auth/login';
}

// Conta as respostas depois de enviadas: assim pega também os 403 dos middlewares, os 429 do rate
// limit e os 500 do errorHandler, sem mexer em cada rota.
export function securityAlertsMiddleware(alerts: SecurityAlerts): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      const status = res.statusCode;
      if (isFailedLogin(req, status)) alerts.record('login_failed');
      else if (status === 403) alerts.record('forbidden', req.user?.id);
      else if (status === 429) alerts.record('rate_limited');
      else if (status >= 500) alerts.record('server_error');
    });
    next();
  };
}
