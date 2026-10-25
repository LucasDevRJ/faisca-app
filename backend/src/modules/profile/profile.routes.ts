import express, { Router } from 'express';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createProfileController } from './profile.controller.js';
import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES } from './profile.schema.js';
import { createProfileService } from './profile.service.js';

// Perfil básico (DEC-061). /profile: a própria conta, paciente ou terapeuta. A foto do paciente,
// para a terapeuta, fica em therapist.routes.ts, dentro da cadeia de vínculo ativo.
export function createProfileRoutes() {
  const controller = createProfileController(createProfileService());
  const router = Router();
  // A foto chega como o próprio arquivo, e não em JSON (o express.json tem limite de 100 kB).
  const imageBody = express.raw({ type: AVATAR_CONTENT_TYPES, limit: AVATAR_MAX_BYTES });
  // Processar a foto é caro: o limite por conta evita que envios em sequência derrubem a API.
  const avatarLimit = createRateLimit({ windowMinutes: 60, limit: 20, key: 'user' });

  router.get('/profile', requireAuth, controller.get);
  router.patch('/profile', requireAuth, controller.update);
  router.get('/profile/avatar', requireAuth, controller.ownAvatar);
  router.put('/profile/avatar', requireAuth, avatarLimit, imageBody, controller.putAvatar);
  router.delete('/profile/avatar', requireAuth, controller.deleteAvatar);

  // O paciente vê a foto da terapeuta vinculada, como já vê o nome e o e-mail dela (/link).
  router.get('/link/therapist/avatar', requireAuth, requirePatient, controller.therapistAvatar);

  return router;
}
