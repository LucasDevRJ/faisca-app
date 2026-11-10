import type { RequestHandler } from 'express';
import type { RunAfterResponse } from '../../lib/background.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  clearSessionCookie,
  readSessionToken,
  SESSION_COOKIE,
  setMfaCookie,
  setSessionCookie,
} from '../../lib/session.js';
import {
  acceptPrivacySchema,
  addProfileSchema,
  announcementSeenSchema,
  deleteAccountSchema,
  logoutAllSchema,
  changePasswordSchema,
  loginAlertSchema,
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  confirmEmailSchema,
} from './auth.schema.js';
import { toPublicUser, type AuthService } from './auth.service.js';
import { hasTwoFactor, type TwoFactorService } from '../two-factor/two-factor.service.js';

// Cadastro, "esqueci a senha" e reenvio validam o pedido e respondem; buscar a conta e mandar o
// e-mail fica para depois da resposta, para o tempo não dizer se a conta existe (DEC-073).
export function createAuthController(
  service: AuthService,
  runAfterResponse: RunAfterResponse,
  twoFactor: TwoFactorService,
) {
  const signup: RequestHandler = async (req, res) => {
    const input = await service.prepareSignup(signupSchema.parse(req.body));
    await runAfterResponse('signup', () => service.signup(input));
    // 202: o pedido foi aceito, mas a conta só vale depois de confirmar o e-mail.
    res.status(202).json({
      message: 'Se estiver tudo certo, você vai receber um e-mail para confirmar sua conta.',
    });
  };

  const confirmEmail: RequestHandler = async (req, res) => {
    const { token, password } = confirmEmailSchema.parse(req.body);
    await service.confirmEmail(token, password);
    res.status(204).end();
  };

  const resendConfirmation: RequestHandler = async (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    await runAfterResponse('resend-confirmation', () => service.resendConfirmation(email));
    res.status(204).end();
  };

  // Um aviso pendente por conta; um login que chega nesse meio-tempo é avisado em seguida (DEC-091).
  async function queueLoginAlert(userId: string, userAgent: string | undefined, at = new Date()): Promise<void> {
    if (!service.claimLoginAlert(userId, userAgent, at.getTime())) return;
    await runAfterResponse('login-alert', async () => {
      try {
        await service.notifyLogin(userId, userAgent, at);
      } finally {
        const extra = service.releaseLoginAlert(userId);
        if (extra) await queueLoginAlert(userId, extra.userAgent, extra.at);
      }
    });
  }

  const login: RequestHandler = async (req, res) => {
    const user = await service.login(loginSchema.parse(req.body));
    // Com 2FA (DEC-092), a senha certa ainda não abre a sessão: abre o passo do código, num cookie
    // curto, e o aviso de login novo só sai depois do código.
    if (hasTwoFactor(user)) {
      const step = await twoFactor.beginLogin(user);
      await setMfaCookie(res, user.id, step.challengeId);
      res.status(200).json({
        twoFactor: { methods: step.methods, preferred: step.preferred, emailHint: step.emailHint },
      });
      return;
    }
    await setSessionCookie(res, user.id, user.sessionVersion);
    // Aviso de login novo (DEC-091) depois da resposta: não atrasa a entrada, e uma falha no envio
    // não derruba o login.
    await queueLoginAlert(user.id, req.get('user-agent'));
    res.status(200).json({ user: toPublicUser(user) });
  };

  const logout: RequestHandler = async (req, res) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const session = typeof token === 'string' ? await readSessionToken(token) : null;
    if (session) {
      await service.logoutSession(session.userId, session.sessionId);
    }
    clearSessionCookie(res);
    res.status(204).end();
  };

  const me: RequestHandler = (req, res) => {
    res.status(200).json({ user: toPublicUser(getAuthUser(req)) });
  };

  const addProfile: RequestHandler = async (req, res) => {
    const user = await service.addProfile(getAuthUser(req).id, addProfileSchema.parse(req.body));
    res.status(200).json({ user: toPublicUser(user) });
  };

  const acceptPrivacy: RequestHandler = async (req, res) => {
    acceptPrivacySchema.parse(req.body);
    const user = await service.acceptPrivacy(getAuthUser(req).id);
    res.status(200).json({ user: toPublicUser(user) });
  };

  const announcementSeen: RequestHandler = async (req, res) => {
    const { announcement } = announcementSeenSchema.parse(req.body);
    const user = await service.markAnnouncementSeen(getAuthUser(req).id, announcement);
    res.status(200).json({ user: toPublicUser(user) });
  };

  const deleteAccount: RequestHandler = async (req, res) => {
    const { password } = deleteAccountSchema.parse(req.body);
    await service.deleteAccount(getAuthUser(req).id, password);
    clearSessionCookie(res);
    res.status(204).end();
  };

  const logoutAll: RequestHandler = async (req, res) => {
    const { password } = logoutAllSchema.parse(req.body);
    await service.logoutAll(getAuthUser(req).id, password);
    clearSessionCookie(res);
    res.status(204).end();
  };

  // Os outros aparelhos caem (sessionVersion novo); este continua, com um cookie novo da mesma sessão.
  const changePassword: RequestHandler = async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const user = getAuthUser(req);
    const sessionVersion = await service.changePassword(user.id, input, req.sessionId);
    twoFactor.clearFailures(user.id);
    await setSessionCookie(res, user.id, sessionVersion, req.sessionId);
    res.status(204).end();
  };

  const loginAlert: RequestHandler = async (req, res) => {
    const { enabled } = loginAlertSchema.parse(req.body);
    const user = await service.setLoginAlert(getAuthUser(req).id, enabled);
    res.status(200).json({ user: toPublicUser(user) });
  };

  const forgotPassword: RequestHandler = async (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    await runAfterResponse('forgot-password', () => service.forgotPassword(email));
    res.status(204).end();
  };

  const resetPassword: RequestHandler = async (req, res) => {
    twoFactor.clearFailures(await service.resetPassword(resetPasswordSchema.parse(req.body)));
    res.status(204).end();
  };

  return {
    queueLoginAlert,
    signup,
    confirmEmail,
    resendConfirmation,
    login,
    logout,
    me,
    addProfile,
    acceptPrivacy,
    announcementSeen,
    deleteAccount,
    logoutAll,
    changePassword,
    loginAlert,
    forgotPassword,
    resetPassword,
  };
}
