import { Router } from 'express';
import type { RunAfterResponse } from '../../lib/background.js';
import type { Mailer } from '../../lib/mailer.js';
import type { PushSender } from '../../lib/web-push.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { createLinksService } from '../links/links.service.js';
import { createAuthController } from './auth.controller.js';
import { createAuthService } from './auth.service.js';
import { createTwoFactorController } from '../two-factor/two-factor.controller.js';
import { createTwoFactorService } from '../two-factor/two-factor.service.js';

// O proxy remove o /api (DEC-023): o front chama /api/auth/login e aqui chega /auth/login.
export function createAuthRoutes(mailer: Mailer, runAfterResponse: RunAfterResponse, pushSender?: PushSender) {
  const twoFactorService = createTwoFactorService(mailer);
  const controller = createAuthController(
    createAuthService(mailer, createLinksService(mailer), pushSender),
    runAfterResponse,
    twoFactorService,
  );
  const twoFactor = createTwoFactorController(twoFactorService, controller.queueLoginAlert);
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
  const twoFactorLoginLimit = createRateLimit({ windowMinutes: 15, limit: 20, key: 'ip', onlyFailures: true });
  // Pedidos de código por e-mail (DEC-092), além do teto por conta no serviço.
  const codeEmailLimit = createRateLimit({ windowMinutes: 60, limit: 10, key: 'user' });
  const loginCodeEmailLimit = createRateLimit({ windowMinutes: 60, limit: 10, key: 'ip' });
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
  router.put('/auth/login-alert', requireAuth, controller.loginAlert);

  // Verificação em duas etapas (DEC-092). Ativar, gerar códigos e desligar pedem a senha e entram
  // nos mesmos limites de erro de senha; confirmar um código também.
  router.get('/auth/2fa', requireAuth, twoFactor.status);
  router.post('/auth/2fa/setup', requireAuth, ...passwordCheckLimits, codeEmailLimit, twoFactor.startSetup);
  router.post('/auth/2fa/setup/confirm', requireAuth, ...passwordCheckLimits, twoFactor.confirmSetup);
  router.post('/auth/2fa/recovery-codes', requireAuth, ...passwordCheckLimits, twoFactor.regenerateCodes);
  router.post('/auth/2fa/email-code', requireAuth, codeEmailLimit, twoFactor.sendActionEmailCode);
  router.post('/auth/2fa/disable', requireAuth, ...passwordCheckLimits, twoFactor.disable);
  // O passo do login: o desafio já limita 5 tentativas e 3 envios; o limite por IP pega quem abre
  // desafio atrás de desafio.
  router.post('/auth/2fa/login/email', twoFactorLoginLimit, loginCodeEmailLimit, twoFactor.sendLoginEmailCode);
  router.post('/auth/2fa/login/verify', twoFactorLoginLimit, twoFactor.verifyLogin);
  router.post('/auth/forgot-password', ...emailLimits(), controller.forgotPassword);
  router.post('/auth/reset-password', controller.resetPassword);

  return router;
}
