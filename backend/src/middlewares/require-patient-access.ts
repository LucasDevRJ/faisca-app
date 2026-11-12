import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { ProfessionalKind, SharedArea } from '../generated/prisma/client.js';
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

export type PatientLinkAccess = { id: string; kind: ProfessionalKind; sharedAreas: SharedArea[] };

// Depois do requireAuth e do requireTherapist. O vínculo é conferido a cada requisição:
// revogar derruba o acesso na hora (SPEC, "Regras comuns"). Guarda o vínculo, com as áreas
// liberadas pelo paciente (DEC-097), para o requireSharedArea e para os services.
export const requireActiveLink: RequestHandler = async (req, res, next) => {
  const parsed = patientIdSchema.safeParse(req.params.patientId);
  if (!parsed.success) throw forbidden();

  const link = await prisma.therapistLink.findFirst({
    where: { therapistId: getAuthUser(req).id, patientId: parsed.data, revokedAt: null },
    select: { id: true, kind: true, sharedAreas: true },
  });
  if (!link) throw forbidden();
  res.locals.patientLink = link satisfies PatientLinkAccess;
  next();
};

// O vínculo conferido pelo requireActiveLink. Sem ele, a rota foi montada errada: 500, e não acesso.
export function getPatientLink(res: Response): PatientLinkAccess {
  const link = res.locals.patientLink as PatientLinkAccess | undefined;
  if (!link) throw new Error('requireActiveLink precisa vir antes');
  return link;
}

// Depois do requireActiveLink: a área (todas, se forem várias) precisa estar liberada pelo paciente
// para esta profissional (DEC-097). Sem ela, o mesmo 403 de sem vínculo: não diz o que existe.
export function requireSharedArea(...areas: SharedArea[]): RequestHandler {
  return (_req, res, next) => {
    const { sharedAreas } = getPatientLink(res);
    if (!areas.every((area) => sharedAreas.includes(area))) throw forbidden();
    next();
  };
}
