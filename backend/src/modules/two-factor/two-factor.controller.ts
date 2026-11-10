import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import { clearMfaCookie, MFA_COOKIE, readMfaToken, setSessionCookie } from '../../lib/session.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { toPublicUser } from '../auth/auth.service.js';
import {
  confirmSetupSchema,
  disableSchema,
  loginVerifySchema,
  regenerateCodesSchema,
  startSetupSchema,
} from './two-factor.schema.js';
import type { TwoFactorService } from './two-factor.service.js';

// Rotas do 2FA (DEC-092). As de Conta usam a sessão; as do login usam o cookie curto do passo entre
// a senha e o código (MFA_COOKIE), que ainda não é a sessão.
export function createTwoFactorController(
  service: TwoFactorService,
  queueLoginAlert: (userId: string, userAgent: string | undefined) => Promise<void>,
) {
  async function currentUser(req: Parameters<RequestHandler>[0]) {
    return prisma.user.findUniqueOrThrow({ where: { id: getAuthUser(req).id } });
  }

  async function mfaFromCookie(req: Parameters<RequestHandler>[0]) {
    const token: unknown = req.cookies?.[MFA_COOKIE];
    const mfa = typeof token === 'string' ? await readMfaToken(token) : null;
    if (!mfa) {
      throw new AppError(401, 'TWO_FACTOR_EXPIRED', 'O tempo para confirmar acabou. Entre de novo com o seu e-mail e a sua senha.');
    }
    return mfa;
  }

  const status: RequestHandler = async (req, res) => {
    res.status(200).json(await service.status(getAuthUser(req).id));
  };

  const startSetup: RequestHandler = async (req, res) => {
    const { password, method, via, otp } = startSetupSchema.parse(req.body);
    const user = await currentUser(req);
    await service.checkPassword(user, password);
    res.status(200).json(await service.startSetup(user, method, via && otp ? { via, otp } : null));
  };

  const confirmSetup: RequestHandler = async (req, res) => {
    const { method, otp } = confirmSetupSchema.parse(req.body);
    const { user, recoveryCodes } = await service.confirmSetup(await currentUser(req), method, otp);
    // No primeiro método, o sessionVersion subiu: os outros aparelhos saem, e este ganha um cookie
    // novo da mesma sessão (como ao trocar a senha, DEC-085).
    await setSessionCookie(res, user.id, user.sessionVersion, req.sessionId);
    res.status(200).json({ recoveryCodes });
  };

  const regenerateCodes: RequestHandler = async (req, res) => {
    const { password, via, otp } = regenerateCodesSchema.parse(req.body);
    const user = await currentUser(req);
    await service.checkPassword(user, password);
    res.status(200).json({ recoveryCodes: await service.regenerateRecoveryCodes(user, via, otp) });
  };

  const sendActionEmailCode: RequestHandler = async (req, res) => {
    res.status(200).json(await service.sendActionEmailCode(await currentUser(req)));
  };

  const disable: RequestHandler = async (req, res) => {
    const { password, via, otp } = disableSchema.parse(req.body);
    const user = await currentUser(req);
    await service.checkPassword(user, password);
    await service.disable(user, via, otp);
    res.status(204).end();
  };

  const sendLoginEmailCode: RequestHandler = async (req, res) => {
    const mfa = await mfaFromCookie(req);
    await service.sendLoginEmailCode(mfa.userId, mfa.challengeId);
    res.status(204).end();
  };

  // Código certo: abre a sessão, apaga o cookie curto e só agora manda o aviso de login novo (DEC-091).
  const verifyLogin: RequestHandler = async (req, res) => {
    const { via, otp } = loginVerifySchema.parse(req.body);
    const mfa = await mfaFromCookie(req);
    const user = await service.verifyLogin(mfa.userId, mfa.challengeId, via, otp);
    await setSessionCookie(res, user.id, user.sessionVersion);
    clearMfaCookie(res);
    await queueLoginAlert(user.id, req.get('user-agent'));
    res.status(200).json({ user: toPublicUser(user) });
  };

  return {
    status,
    startSetup,
    confirmSetup,
    regenerateCodes,
    sendActionEmailCode,
    disable,
    sendLoginEmailCode,
    verifyLogin,
  };
}
