import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { getAuthUser } from './require-auth.js';

// Contexto de terapeuta (DEC-011): só quem tem o perfil de terapeuta. Vem sempre depois do
// requireAuth. O acesso aos dados de um paciente (só GET e só com vínculo ativo) é conferido
// por outro middleware, nas rotas /therapist/patients/:patientId (etapa 4b).
export const requireTherapist: RequestHandler = (req, _res, next) => {
  if (!getAuthUser(req).hasTherapistProfile) {
    throw new AppError(403, 'THERAPIST_PROFILE_REQUIRED', 'Esta área é do perfil de terapeuta.');
  }
  next();
};
