import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { PRIVACY_VERSION } from '../modules/auth/auth.service.js';
import { getAuthUser } from './require-auth.js';

// O Registro de Pensamentos entrou no aviso de privacidade na versão atual (DEC-039). Quem
// ainda não aceitou essa versão não usa a área de RPD, nem como paciente nem como terapeuta;
// o resto do app segue funcionando. Vem depois do requireAuth (e, na terapeuta, do vínculo).
export const requireCurrentPrivacy: RequestHandler = (req, _res, next) => {
  if (getAuthUser(req).privacyVersion !== PRIVACY_VERSION) {
    throw new AppError(
      403,
      'PRIVACY_CONSENT_REQUIRED',
      'Para usar o Registro de Pensamentos, leia e aceite a versão atual do aviso de privacidade.',
    );
  }
  next();
};
