import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { createResendMailer, type Mailer } from './lib/mailer.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { createActivitiesRoutes } from './modules/activities/activities.routes.js';
import { createAppointmentsRoutes } from './modules/appointments/appointments.routes.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';

export type AppDependencies = {
  // Os testes passam um mailer em memória; em dev e produção é o Resend.
  mailer?: Mailer;
};

// O app fica separado do server.ts para os testes usarem o Supertest sem abrir porta.
export function createApp({ mailer = createResendMailer() }: AppDependencies = {}) {
  const app = express();

  // Número de proxies na frente da API (DEC-023). Mantém req.ip, usado no rate limit,
  // com o IP real de quem fez a requisição.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(helmet());
  // credentials: true porque a autenticação usa cookie httpOnly (DEC-010).
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(healthRoutes);
  app.use(createAuthRoutes(mailer));
  app.use(createActivitiesRoutes());
  app.use(createAppointmentsRoutes());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
