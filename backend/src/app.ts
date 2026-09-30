import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { createResendMailer, type Mailer } from './lib/mailer.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { createActivitiesRoutes } from './modules/activities/activities.routes.js';
import { createAppointmentsRoutes } from './modules/appointments/appointments.routes.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createLinksRoutes } from './modules/links/links.routes.js';
import { createTherapistRoutes } from './modules/therapist/therapist.routes.js';
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
  // Para acertar o TRUST_PROXY_HOPS no deploy (DEC-037): com LOG_LEVEL=debug, mostra quantos
  // endereços chegam no X-Forwarded-For. Só a contagem, nunca os IPs.
  app.use((req, _res, next) => {
    if (logger.isLevelEnabled('debug')) {
      const header = req.headers['x-forwarded-for'];
      const entries = typeof header === 'string' ? header.split(',').length : 0;
      logger.debug({ xForwardedForEntries: entries, trustProxyHops: env.TRUST_PROXY_HOPS }, 'Proxies na frente da API');
    }
    next();
  });

  app.use(helmet());
  // credentials: true porque a autenticação usa cookie httpOnly (DEC-010).
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(healthRoutes);
  app.use(createAuthRoutes(mailer));
  app.use(createActivitiesRoutes());
  app.use(createAppointmentsRoutes());
  app.use(createLinksRoutes(mailer));
  app.use(createTherapistRoutes());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
