import { Router } from 'express';
import type { Mailer } from '../../lib/mailer.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { createLinksController } from './links.controller.js';
import { createLinksService } from './links.service.js';

// Vínculo paciente ↔ terapeuta (SPEC, "Vínculo"; DEC-031).
// /link: o vínculo do próprio paciente. /links: o lado da terapeuta.
export function createLinksRoutes(mailer: Mailer) {
  const controller = createLinksController(createLinksService(mailer));
  const router = Router();
  const patient = [requireAuth, requirePatient];
  const therapist = [requireAuth, requireTherapist];

  // Cada convite manda um e-mail para um endereço escolhido: o limite evita usar o Faísca
  // para mandar e-mail em massa (cancelar e convidar de novo em sequência).
  const inviteLimit = createRateLimit({ windowMinutes: 60, limit: 5, key: 'user' });

  router.get('/link', ...patient, controller.status);
  router.post('/link/invite', ...patient, inviteLimit, controller.createInvite);
  router.delete('/link/invite', ...patient, controller.cancelInvite);
  router.post('/link/code', ...patient, controller.generateCode);
  router.post('/link/revoke', ...patient, controller.revoke);
  router.post('/link/seen', ...patient, controller.markSeen);

  // POSTs do lado da terapeuta: criam o vínculo e não tocam em dado de paciente. A regra
  // "terapeuta só GET" vale para os dados de paciente (/therapist/patients/...), DEC-031.
  // O limite de tentativas do código fica no service, gravado no banco.
  router.post('/links/redeem-code', ...therapist, controller.redeemCode);
  // Sem requireTherapist: aceitar o convite é o que ativa o perfil de terapeuta (SPEC).
  router.post('/links/accept-invite', requireAuth, controller.acceptInvite);
  router.get('/links/patients', ...therapist, controller.listPatients);

  return router;
}
