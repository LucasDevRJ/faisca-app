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

export async function setSessionCookie(res: Response, userId: string, sessionVersion: number) {
  const token = await new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);

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
    };
  } catch {
    return null;
  }
}

export function shouldRenewSession(issuedAt: Date, now = new Date()): boolean {
  return now.getTime() - issuedAt.getTime() > RENEW_AFTER_MS;
}
