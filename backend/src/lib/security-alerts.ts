import type { RequestHandler } from 'express';
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
  const lastLogAt = new Map<string, number>();

  function prune(current: number) {
    for (const [key, times] of hits) {
      const recent = times.filter((time) => current - time < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }

  function alert(kind: SecurityAlertKind, key: string, count: number, accountId: string | undefined, current: number) {
    // O log sai por chave (cada conta do 403 aparece), no máximo uma vez por janela: assim um alerta
    // já enviado não esconde a conta seguinte (achado do revisor-seguranca).
    const lastLog = lastLogAt.get(key);
    if (lastLog === undefined || current - lastLog >= windowMs) {
      lastLogAt.set(key, current);
      // O id da conta só vai para o log (regra 7: nada de nome, e-mail ou IP).
      logger.warn({ securityAlert: kind, count, windowMinutes: ALERT_WINDOW_MINUTES, userId: accountId }, 'Alerta de segurança');
    }

    // O e-mail, no máximo um por tipo a cada hora, para não lotar a caixa durante um ataque.
    const last = lastAlertAt.get(kind);
    if (last !== undefined && current - last < cooldownMs) return;
    lastAlertAt.set(kind, current);
    if (!to) return;

    const config = SECURITY_ALERT_KINDS[kind];

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
      if (config.perAccount && !accountId) return;
      const key = config.perAccount ? `${kind}:${accountId}` : kind;

      if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) {
        prune(current);
        for (const [logKey, time] of lastLogAt) if (current - time >= windowMs) lastLogAt.delete(logKey);
      }
      if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) return;

      const times = (hits.get(key) ?? []).filter((time) => current - time < windowMs);
      times.push(current);
      // Guarda só os últimos `limit` instantes: contar além do limite não muda o alerta, e a lista
      // sem teto deixaria cada resposta mais lenta durante um ataque (achado do revisor-seguranca).
      if (times.length > config.limit) times.splice(0, times.length - config.limit);
      hits.set(key, times);

      if (times.length >= config.limit) {
        alert(kind, key, times.length, config.perAccount ? accountId : undefined, current);
      }
    },
  };
}

// Marca a rota de login: a falha é reconhecida pelo status que cada rota usa, e não pelo endereço
// (o Express aceita /AUTH/LOGIN e /auth/login/ na mesma rota; achado do revisor-seguranca).
export function markLoginAttempt(failureStatus: number): RequestHandler {
  return (_req, res, next) => {
    res.locals.loginFailureStatus = failureStatus;
    next();
  };
}

// Conta as respostas depois de enviadas: assim pega também os 403 dos middlewares, os 429 do rate
// limit e os 500 do errorHandler, sem mexer em cada rota.
export function securityAlertsMiddleware(alerts: SecurityAlerts): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      const status = res.statusCode;
      if (res.locals.loginFailureStatus === status) alerts.record('login_failed');
      // 403 sem sessão é barulho barato (ex.: POST em /therapist/patients sem cookie) e poderia
      // esconder o alerta de quem está logado: só conta 403 de conta conhecida.
      else if (status === 403) {
        if (req.user?.id) alerts.record('forbidden', req.user.id);
      } else if (status === 429) alerts.record('rate_limited');
      else if (status >= 500) alerts.record('server_error');
    });
    next();
  };
}
