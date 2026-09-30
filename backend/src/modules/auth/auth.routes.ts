import { Router } from 'express';
import type { Mailer } from '../../lib/mailer.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { createLinksService } from '../links/links.service.js';
import { createAuthController } from './auth.controller.js';
import { createAuthService } from './auth.service.js';

// O proxy remove o /api (DEC-023): o front chama /api/auth/login e aqui chega /auth/login.
export function createAuthRoutes(mailer: Mailer) {
  const controller = createAuthController(createAuthService(mailer, createLinksService(mailer)));
  const router = Router();

  // Limites da DEC-025. Os de e-mail valem por endereço e por IP ao mesmo tempo.
  const signupLimit = createRateLimit({ windowMinutes: 60, limit: 5, key: 'ip' });
  const loginLimit = createRateLimit({
    windowMinutes: 15,
    limit: 10,
    key: 'ip+email',
    onlyFailures: true,
  });
  // Teto por e-mail, venha de onde vier (DEC-038): quem chama a API direto, sem a Vercel, pode
  // forjar o X-Forwarded-For e trocar de "IP" a cada tentativa. Mais folgado que o de cima, para
  // não travar a dona da conta por causa de tentativas de outra pessoa.
  const loginEmailLimit = createRateLimit({ windowMinutes: 15, limit: 20, key: 'email', onlyFailures: true });
  // Excluir a conta confere a senha: mesmo limite do login, por conta, para ninguém testar
  // senhas por aqui com uma sessão aberta.
  const deleteAccountLimit = createRateLimit({ windowMinutes: 15, limit: 10, key: 'user', onlyFailures: true });
  const emailLimits = () => [
    createRateLimit({ windowMinutes: 60, limit: 3, key: 'email' }),
    createRateLimit({ windowMinutes: 60, limit: 10, key: 'ip' }),
  ];

  router.post('/auth/signup', signupLimit, controller.signup);
  router.post('/auth/confirm-email', controller.confirmEmail);
  router.post('/auth/resend-confirmation', ...emailLimits(), controller.resendConfirmation);
  router.post('/auth/login', loginEmailLimit, loginLimit, controller.login);
  router.post('/auth/logout', controller.logout);
  router.get('/auth/me', requireAuth, controller.me);
  router.post('/auth/profiles', requireAuth, controller.addProfile);
  router.post('/auth/delete-account', requireAuth, deleteAccountLimit, controller.deleteAccount);
  router.post('/auth/forgot-password', ...emailLimits(), controller.forgotPassword);
  router.post('/auth/reset-password', controller.resetPassword);

  return router;
}
