import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { ProfessionalKind, SharedArea } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { coversArea, type PrivacyArea } from '../modules/auth/privacy.js';
import { getAuthUser } from './require-auth.js';

// Contexto de terapeuta sobre os dados de um paciente (regra 1 do AGENTS.md, DEC-011):
// só leitura, exceto a criação estreita de um plano de ação pela psicóloga (DEC-102). Qualquer outro
// caso é 403, sempre com a mesma resposta, para não dizer se o paciente existe ou se já teve vínculo.

function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.');
}

const READ_METHODS = new Set(['GET', 'HEAD']);

// Vem antes de tudo, até do login (backend/CLAUDE.md). A exceção é só POST /plans dentro do prefixo
// do paciente; as verificações de perfil, vínculo, área, aceite e tipo profissional vêm depois.
export const onlyReads: RequestHandler = (req, _res, next) => {
  const createsPlan = req.method === 'POST' && (req.path === '/plans' || req.path === '/plans/');
  if (!READ_METHODS.has(req.method) && !createsPlan) throw forbidden();
  next();
};

const patientIdSchema = z.uuid();

export type PatientLinkAccess = {
  id: string;
  kind: ProfessionalKind;
  sharedAreas: SharedArea[];
  patientPrivacyVersion: string | null;
};

// Depois do requireAuth e do requireTherapist. O vínculo é conferido a cada requisição:
// revogar derruba o acesso na hora (SPEC, "Regras comuns"). Guarda o vínculo, com as áreas
// liberadas pelo paciente (DEC-097), para o requireSharedArea e para os services.
export const requireActiveLink: RequestHandler = async (req, res, next) => {
  const parsed = patientIdSchema.safeParse(req.params.patientId);
  if (!parsed.success) throw forbidden();

  const link = await prisma.therapistLink.findFirst({
    where: { therapistId: getAuthUser(req).id, patientId: parsed.data, revokedAt: null },
    select: {
      id: true,
      kind: true,
      sharedAreas: true,
      patient: { select: { privacyVersion: true } },
    },
  });
  if (!link) throw forbidden();
  res.locals.patientLink = {
    id: link.id,
    kind: link.kind,
    sharedAreas: link.sharedAreas,
    patientPrivacyVersion: link.patient.privacyVersion,
  } satisfies PatientLinkAccess;
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

// Escrita de um dado do paciente pela psicóloga: além do aceite de quem escreve, exige que o
// paciente tenha aceitado o aviso que cobre a área (DEC-094, DEC-102).
export function requirePatientPrivacy(area: PrivacyArea): RequestHandler {
  return (_req, res, next) => {
    if (!coversArea(getPatientLink(res).patientPrivacyVersion, area)) {
      throw new AppError(
        403,
        'PATIENT_PRIVACY_CONSENT_REQUIRED',
        'O paciente precisa aceitar a versão do aviso de privacidade que inclui o Meus Planos.',
      );
    }
    next();
  };
}
