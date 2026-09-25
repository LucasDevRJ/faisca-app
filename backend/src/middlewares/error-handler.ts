import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

// No Express 5, erros lançados em handlers async chegam aqui sem try/catch.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    // Devolve só o caminho e a mensagem de cada problema, sem ecoar o valor enviado.
    const issues = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', issues } });
    return;
  }

  // JSON malformado no body (lançado pelo express.json).
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido.' } });
    return;
  }

  logger.error({ err }, 'Erro não tratado');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } });
};
