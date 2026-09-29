import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { prisma } from '../lib/prisma.js';
import { getAuthUser } from './require-auth.js';

// Contexto de terapeuta sobre os dados de um paciente (regra 1 do AGENTS.md, DEC-011):
// só leitura e só com vínculo ativo. Qualquer outro caso é 403, sempre com a mesma resposta,
// para não dizer se o paciente existe ou se já teve vínculo.

function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.');
}

const READ_METHODS = new Set(['GET', 'HEAD']);

// Vem antes de tudo, até do login (backend/CLAUDE.md): método de escrita nunca passa daqui,
// nem com sessão válida e vínculo ativo.
export const onlyReads: RequestHandler = (req, _res, next) => {
  if (!READ_METHODS.has(req.method)) throw forbidden();
  next();
};

const patientIdSchema = z.uuid();

// Depois do requireAuth e do requireTherapist. O vínculo é conferido a cada requisição:
// revogar derruba o acesso na hora (SPEC, "Regras comuns").
export const requireActiveLink: RequestHandler = async (req, _res, next) => {
  const parsed = patientIdSchema.safeParse(req.params.patientId);
  if (!parsed.success) throw forbidden();

  const link = await prisma.therapistLink.findFirst({
    where: { therapistId: getAuthUser(req).id, patientId: parsed.data, revokedAt: null },
    select: { id: true },
  });
  if (!link) throw forbidden();
  next();
};
