import type { AuthUser } from '../middlewares/require-auth.js';

// Preenchido pelo requireAuth; só existe nas rotas que passam por ele.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      // A sessão (o aparelho) desde o login, mesmo depois das renovações: separa os aparelhos no
      // limite de erros de senha por sessão (DEC-085).
      sessionId?: string;
    }
  }
}

export {};
