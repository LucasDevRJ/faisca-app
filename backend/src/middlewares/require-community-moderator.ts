import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { getAuthUser } from './require-auth.js';

function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso à moderação da comunidade.');
}

// A lista de e-mails só concede acesso à fila da comunidade. O moderador não recebe perfil
// administrativo nem acesso a registros terapêuticos; a sessão também precisa ter 2FA ativo.
export const requireCommunityModerator: RequestHandler = async (req, _res, next) => {
  const authUser = getAuthUser(req);
  const allowed = env.COMMUNITY_MODERATOR_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(authUser.email.toLowerCase())) throw forbidden();

  const account = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { twoFactorEmail: true, totpEnabledAt: true },
  });
  if (!account || (!account.twoFactorEmail && account.totpEnabledAt === null)) throw forbidden();
  next();
};
