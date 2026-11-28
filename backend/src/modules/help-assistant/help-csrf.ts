import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { getAuthUser } from '../../middlewares/require-auth.js';

function expectedHelpCsrfToken(req: Request) {
  // Identificador da sessão já é aleatório. O HMAC produz um token opaco e estável
  // por sessão, permitindo abrir duas abas ao mesmo tempo sem invalidar o envio.
  return createHmac('sha256', env.JWT_SECRET)
    .update(JSON.stringify(['faisca-help-csrf-v1', getAuthUser(req).id, req.sessionId]))
    .digest('hex');
}

function isValidHelpCsrfToken(cookie: unknown, header: string | undefined, req: Request) {
  if (typeof cookie !== 'string' || !/^[a-f0-9]{64}$/.test(cookie) ||
      typeof header !== 'string' || !/^[a-f0-9]{64}$/.test(header)) return false;
  const actual = Buffer.from(cookie, 'hex');
  return timingSafeEqual(actual, Buffer.from(header, 'hex')) &&
    timingSafeEqual(actual, Buffer.from(expectedHelpCsrfToken(req), 'hex'));
}

export const helpCsrfToken: RequestHandler = (req, res) => {
  const csrfToken = expectedHelpCsrfToken(req);
  res.cookie('faisca_help_csrf', csrfToken, {
    httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 30 * 60 * 1000,
  });
  res.json({ csrfToken });
};

export const requireHelpCsrf: RequestHandler = (req, _res, next) => {
  if (!isValidHelpCsrfToken(req.cookies.faisca_help_csrf, req.get('X-CSRF-Token'), req)) {
    throw new AppError(403, 'HELP_CSRF_INVALID', 'Atualize a página e confirme o envio novamente.');
  }
  next();
};
