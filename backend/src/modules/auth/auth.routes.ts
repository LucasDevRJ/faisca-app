import { Router } from 'express';
import type { RunAfterResponse } from '../../lib/background.js';
import type { Mailer } from '../../lib/mailer.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { createLinksService } from '../links/links.service.js';
import { createAuthController } from './auth.controller.js';
import { createAuthService } from './auth.service.js';

// O proxy remove o /api (DEC-023): o front chama /api/auth/login e aqui chega /auth/login.
export function createAuthRoutes(mailer: Mailer, runAfterResponse: RunAfterResponse) {
  const controller = createAuthController(createAuthService(mailer, createLinksService(mailer)), runAfterResponse);
  const router = Router();

  // Limites da DEC-025. Os de e-mail valem por endereço e por IP ao mesmo tempo.
  const signupLimit = createRateLimit({ windowMinutes: 60, limit: 5, key: 'ip' });
  // Tetos do cadastro por e-mail (DEC-072). O curto conta e-mail e IP juntos, para outra pessoa
  // não gastar a cota da dona do e-mail; o folgado, só por e-mail, barra quem troca de "IP" para
  // mandar e-mails sem fim a alguém.
  const signupEmailLimits = [
    createRateLimit({ windowMinutes: 60, limit: 3, key: 'ip+email' }),
    createRateLimit({ windowMinutes: 60, limit: 10, key: 'email' }),
  ];
  // A confirmação confere a senha do cadastro (DEC-072): limite de erros por IP.
  const confirmLimit = createRateLimit({ windowMinutes: 15, limit: 10, key: 'ip', onlyFailures: true });
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
  // Excluir a conta, "Sair de todos os aparelhos" e "Trocar senha" conferem a senha, para ninguém
  // testar senhas por aqui com uma sessão aberta (DEC-085). Os contadores valem para as três rotas
  // juntas: trocar de rota não dá tentativas novas. Por sessão, o mesmo limite do login; por conta, um teto mais
  // folgado, para quem roubou uma sessão não travar o "Sair de todos" da dona da conta.
  const passwordCheckLimits = [
    createRateLimit({ windowMinutes: 15, limit: 10, key: 'session', onlyFailures: true }),
    createRateLimit({ windowMinutes: 15, limit: 30, key: 'user', onlyFailures: true }),
  ];
  const emailLimits = () => [
    createRateLimit({ windowMinutes: 60, limit: 3, key: 'email' }),
    createRateLimit({ windowMinutes: 60, limit: 10, key: 'ip' }),
  ];

  router.post('/auth/signup', ...signupEmailLimits, signupLimit, controller.signup);
  router.post('/auth/confirm-email', confirmLimit, controller.confirmEmail);
  router.post('/auth/resend-confirmation', ...emailLimits(), controller.resendConfirmation);
  router.post('/auth/login', loginEmailLimit, loginLimit, controller.login);
  router.post('/auth/logout', controller.logout);
  router.get('/auth/me', requireAuth, controller.me);
  router.post('/auth/profiles', requireAuth, controller.addProfile);
  router.post('/auth/accept-privacy', requireAuth, controller.acceptPrivacy);
  router.post('/auth/announcement-seen', requireAuth, controller.announcementSeen);
  router.post('/auth/delete-account', requireAuth, ...passwordCheckLimits, controller.deleteAccount);
  router.post('/auth/logout-all', requireAuth, ...passwordCheckLimits, controller.logoutAll);
  router.post('/auth/change-password', requireAuth, ...passwordCheckLimits, controller.changePassword);
  router.post('/auth/forgot-password', ...emailLimits(), controller.forgotPassword);
  router.post('/auth/reset-password', controller.resetPassword);

  return router;
}
