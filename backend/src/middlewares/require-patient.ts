import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { getAuthUser } from './require-auth.js';

// Contexto de paciente (DEC-011): só quem tem o perfil de paciente acessa os próprios
// registros. Vem sempre depois do requireAuth. Quem é dono de cada registro é conferido
// no service, porque depende do dado buscado.
export const requirePatient: RequestHandler = (req, _res, next) => {
  if (!getAuthUser(req).hasPatientProfile) {
    throw new AppError(403, 'PATIENT_PROFILE_REQUIRED', 'Esta área é do perfil de paciente.');
  }
  next();
};
