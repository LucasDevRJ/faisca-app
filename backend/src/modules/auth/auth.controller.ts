import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { clearSessionCookie, setSessionCookie } from '../../lib/session.js';
import {
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  tokenOnlySchema,
} from './auth.schema.js';
import { toPublicUser, type AuthService } from './auth.service.js';

export function createAuthController(service: AuthService) {
  const signup: RequestHandler = async (req, res) => {
    await service.signup(signupSchema.parse(req.body));
    // 202: o pedido foi aceito, mas a conta só vale depois de confirmar o e-mail.
    res.status(202).json({
      message: 'Se estiver tudo certo, você vai receber um e-mail para confirmar sua conta.',
    });
  };

  const confirmEmail: RequestHandler = async (req, res) => {
    await service.confirmEmail(tokenOnlySchema.parse(req.body).token);
    res.status(204).end();
  };

  const resendConfirmation: RequestHandler = async (req, res) => {
    await service.resendConfirmation(emailOnlySchema.parse(req.body).email);
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

  const forgotPassword: RequestHandler = async (req, res) => {
    await service.forgotPassword(emailOnlySchema.parse(req.body).email);
    res.status(204).end();
  };

  const resetPassword: RequestHandler = async (req, res) => {
    await service.resetPassword(resetPasswordSchema.parse(req.body));
    res.status(204).end();
  };

  return { signup, confirmEmail, resendConfirmation, login, logout, me, forgotPassword, resetPassword };
}
