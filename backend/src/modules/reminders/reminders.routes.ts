import { Router } from 'express';
import type { Mailer } from '../../lib/mailer.js';
import type { PushSender } from '../../lib/web-push.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createRemindersController } from './reminders.controller.js';
import { createRemindersService } from './reminders.service.js';

// Lembretes do paciente (SPEC, "Lembretes"; DEC-089). Sempre da própria conta (requireAuth +
// requirePatient). A terapeuta não lê nem altera as configurações de lembrete do paciente.
export function createRemindersRoutes(mailer: Mailer, pushSender: PushSender) {
  const controller = createRemindersController(createRemindersService(mailer, pushSender));
  const router = Router();
  const patient = [requireAuth, requirePatient];
  const pushSubLimit = createRateLimit({ windowMinutes: 15, limit: 30, key: 'user' });

  router.get('/reminders', ...patient, controller.get);
  router.put('/reminders', ...patient, controller.update);
  router.post('/reminders/pause', ...patient, controller.pause);
  router.delete('/reminders/pause', ...patient, controller.resume);
  router.post('/reminders/push-subscriptions', ...patient, pushSubLimit, controller.savePushSubscription);
  router.delete('/reminders/push-subscriptions', ...patient, controller.deletePushSubscription);

  return router;
}
