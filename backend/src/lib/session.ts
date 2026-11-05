import { randomUUID } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';

// Sessão em JWT dentro de cookie httpOnly (DEC-010, DEC-025).
export const SESSION_COOKIE = 'faisca_session';

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
// A sessão é renovada no máximo uma vez por dia de uso, para não gerar cookie novo a cada requisição.
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

const secret = new TextEncoder().encode(env.JWT_SECRET);

export type SessionPayload = {
  userId: string;
  sessionVersion: number;
  issuedAt: Date;
  // Identifica a sessão (o aparelho) do login até a última renovação (DEC-085): é a chave do limite
  // de erros de senha por sessão. Não é segredo e não revoga nada: quem derruba é o sessionVersion.
  sessionId: string;
};

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // Lax: o cookie é first-party graças ao proxy /api (DEC-023) e não vai em POST de outro site.
    sameSite: 'lax',
    path: '/',
  };
}

// Sem sessionId, é um login: sessão nova. A renovação passa o da sessão atual, que continua a mesma.
export async function setSessionCookie(
  res: Response,
  userId: string,
  sessionVersion: number,
  sessionId: string = randomUUID(),
) {
  const token = await new SignJWT({ sv: sessionVersion, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);

  // Um só cookie de sessão por resposta: se o requireAuth já renovou neste pedido (com o
  // sessionVersion de antes, DEC-085), o novo substitui aquele, em vez de irem os dois.
  const previous = res.getHeader('Set-Cookie');
  if (previous !== undefined) {
    const others = ([] as string[])
      .concat(previous as string | string[])
      .filter((cookie) => !cookie.startsWith(`${SESSION_COOKIE}=`));
    res.setHeader('Set-Cookie', others);
  }
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// Devolve null para qualquer token inválido, expirado ou adulterado.
export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number' || !payload.iat) {
      return null;
    }
    return {
      userId: payload.sub,
      sessionVersion: payload.sv,
      issuedAt: new Date(payload.iat * 1000),
      // Sessões de antes da DEC-085 não têm sid: o iat do token ocupa o lugar e segue nas renovações.
      sessionId: typeof payload.sid === 'string' ? payload.sid : `iat-${payload.iat}`,
    };
  } catch {
    return null;
  }
}

export function shouldRenewSession(issuedAt: Date, now = new Date()): boolean {
  return now.getTime() - issuedAt.getTime() > RENEW_AFTER_MS;
}
