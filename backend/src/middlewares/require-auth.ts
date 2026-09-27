import type { Request, RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { prisma } from '../lib/prisma.js';
import {
  clearSessionCookie,
  readSessionToken,
  SESSION_COOKIE,
  setSessionCookie,
  shouldRenewSession,
} from '../lib/session.js';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  hasPatientProfile: boolean;
  hasTherapistProfile: boolean;
};

function unauthenticated() {
  return new AppError(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
}

// Base de toda rota com dado de usuário. A autorização por perfil e vínculo (DEC-011)
// vem depois, em middlewares próprios, sempre em cima deste.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? await readSessionToken(token) : null;

  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          name: true,
          email: true,
          hasPatientProfile: true,
          hasTherapistProfile: true,
          emailConfirmedAt: true,
          sessionVersion: true,
        },
      })
    : null;

  // sessionVersion diferente = a senha foi redefinida depois que esta sessão foi criada.
  if (!session || !user || !user.emailConfirmedAt || user.sessionVersion !== session.sessionVersion) {
    if (token !== undefined) clearSessionCookie(res);
    throw unauthenticated();
  }

  if (shouldRenewSession(session.issuedAt)) {
    await setSessionCookie(res, user.id, user.sessionVersion);
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    hasPatientProfile: user.hasPatientProfile,
    hasTherapistProfile: user.hasTherapistProfile,
  };
  next();
};

// Para controllers atrás do requireAuth: evita o `req.user!` espalhado pelo código.
export function getAuthUser(req: Request): AuthUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
