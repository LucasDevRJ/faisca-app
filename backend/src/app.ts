import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { healthRoutes } from './modules/health/health.routes.js';

// O app fica separado do server.ts para os testes usarem o Supertest sem abrir porta.
export function createApp() {
  const app = express();

  // No Railway a API fica atrás de um proxy; isso mantém req.ip e req.secure corretos.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(helmet());
  // credentials: true porque a autenticação usa cookie httpOnly (DEC-010).
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(healthRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
