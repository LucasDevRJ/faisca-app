import type { AuthUser } from '../middlewares/require-auth.js';

// Preenchido pelo requireAuth; só existe nas rotas que passam por ele.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
