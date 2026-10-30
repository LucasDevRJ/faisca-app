import type { RequestHandler } from 'express';
import type { RunAfterResponse } from '../../lib/background.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { clearSessionCookie, setSessionCookie } from '../../lib/session.js';
import {
  acceptPrivacySchema,
  addProfileSchema,
  announcementSeenSchema,
  deleteAccountSchema,
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  confirmEmailSchema,
} from './auth.schema.js';
import { toPublicUser, type AuthService } from './auth.service.js';

// Cadastro, "esqueci a senha" e reenvio validam o pedido e respondem; buscar a conta e mandar o
// e-mail fica para depois da resposta, para o tempo não dizer se a conta existe (DEC-073).
export function createAuthController(service: AuthService, runAfterResponse: RunAfterResponse) {
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

  const login: RequestHandler = async (req, res) => {
    const user = await service.login(loginSchema.parse(req.body));
    await setSessionCookie(res, user.id, user.sessionVersion);
    res.status(200).json({ user: toPublicUser(user) });
  };

  const logout: RequestHandler = (_req, res) => {
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

  const forgotPassword: RequestHandler = async (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    await runAfterResponse('forgot-password', () => service.forgotPassword(email));
    res.status(204).end();
  };

  const resetPassword: RequestHandler = async (req, res) => {
    await service.resetPassword(resetPasswordSchema.parse(req.body));
    res.status(204).end();
  };

  return {
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
    forgotPassword,
    resetPassword,
  };
}
