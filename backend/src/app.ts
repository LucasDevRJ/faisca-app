import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { runDetached, type RunAfterResponse } from './lib/background.js';
import { logger } from './lib/logger.js';
import { createPrivateFileStore, readPrivateFileStorageConfig } from './lib/private-file-store.js';
import type { ActionVideoProcessingStore } from './lib/action-video-processing.js';
import { createResendMailer, type Mailer } from './lib/mailer.js';
import { createWebPushSender, type PushSender } from './lib/web-push.js';
import { createSecurityAlerts, securityAlertsMiddleware, type SecurityAlerts } from './lib/security-alerts.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { createActivitiesRoutes } from './modules/activities/activities.routes.js';
import { createAppointmentsRoutes } from './modules/appointments/appointments.routes.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createLinksRoutes } from './modules/links/links.routes.js';
import { createProfileRoutes } from './modules/profile/profile.routes.js';
import { createRemindersRoutes } from './modules/reminders/reminders.routes.js';
import { createTensionEpisodesRoutes } from './modules/tension-episodes/tension-episodes.routes.js';
import { createAboutMeRoutes } from './modules/about-me/about-me.routes.js';
import { createPlansRoutes } from './modules/plans/plans.routes.js';
import { createSummaryRoutes } from './modules/summary/summary.routes.js';
import { createActionsRoutes } from './modules/actions/actions.routes.js';
import { createActionVideosService } from './modules/actions/action-videos.service.js';
import { createTherapistRoutes } from './modules/therapist/therapist.routes.js';
import { createNoticesRoutes } from './modules/notices/notices.routes.js';
import { createReadMarksRoutes } from './modules/read-marks/read-marks.routes.js';
import { createReadReceiptsRoutes } from './modules/read-receipts/read-receipts.routes.js';
import { createThoughtRecordsRoutes } from './modules/thought-records/thought-records.routes.js';
import { createTasksRoutes } from './modules/tasks/tasks.routes.js';
import { createDailyCheckInsRoutes } from './modules/daily-check-ins/daily-check-ins.routes.js';
import { createMedicationsRoutes } from './modules/medications/medications.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { createRecordLinksRoutes } from './modules/record-links/record-links.routes.js';
import { createRecordSearchRoutes } from './modules/record-search/record-search.routes.js';
import { createCommunityRoutes } from './modules/community/community.routes.js';
import { createMessagesRoutes } from './modules/messages/messages.routes.js';

export type AppDependencies = {
  // Os testes passam um mailer em memória; em dev e produção é o Resend.
  mailer?: Mailer;
  // Os testes passam um pushSender em memória; em dev e produção é o Web Push (VAPID).
  pushSender?: PushSender;
  // Os testes que leem o e-mail logo depois da requisição rodam o trabalho antes de responder (DEC-073).
  runAfterResponse?: RunAfterResponse;
  actionVideoStorage?: ActionVideoProcessingStore;
  // Os testes passam contadores com relógio próprio; em dev e produção, um por app (DEC-141).
  securityAlerts?: SecurityAlerts;
};

// O app fica separado do server.ts para os testes usarem o Supertest sem abrir porta.
export function createApp({
  mailer = createResendMailer(),
  pushSender = createWebPushSender(),
  runAfterResponse = runDetached,
  actionVideoStorage = env.ACTION_VIDEOS_ENABLED === 'true'
    ? createPrivateFileStore(readPrivateFileStorageConfig(process.env))
    : undefined,
  securityAlerts,
}: AppDependencies = {}) {
  const app = express();
  const actionVideos = actionVideoStorage ? createActionVideosService(actionVideoStorage) : undefined;

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

  // Alertas de segurança (DEC-141): contam 401 do login, 403, 429 e 500 depois de cada resposta.
  app.use(securityAlertsMiddleware(securityAlerts ?? createSecurityAlerts({ mailer })));
  app.use(helmet());
  // As respostas trazem registros de terapia: nada fica guardado no aparelho nem em proxies
  // (DEC-073). Quem precisa de outro valor, como a foto de perfil, troca na própria rota.
  // Logo no começo, para valer também nos erros do CORS e do express.json.
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // credentials: true porque a autenticação usa cookie httpOnly (DEC-010).
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(healthRoutes);
  app.use(createAuthRoutes(mailer, runAfterResponse, pushSender));
  app.use(createActivitiesRoutes());
  app.use(createAppointmentsRoutes());
  app.use(createThoughtRecordsRoutes());
  app.use(createTensionEpisodesRoutes());
  app.use(createActionsRoutes(actionVideos));
  app.use(createAboutMeRoutes());
  app.use(createPlansRoutes());
  app.use(createTasksRoutes());
  app.use(createDailyCheckInsRoutes());
  app.use(createMedicationsRoutes());
  app.use(createRecordLinksRoutes());
  app.use(createRecordSearchRoutes());
  app.use(createCommunityRoutes());
  app.use(createMessagesRoutes(mailer, pushSender, runAfterResponse));
  app.use(createSummaryRoutes());
  app.use(createLinksRoutes(mailer));
  app.use(createProfileRoutes());
  app.use(createRemindersRoutes(mailer, pushSender));
  app.use(createTherapistRoutes(actionVideos));
  // Marcas de leitura da terapeuta (DEC-057), num prefixo próprio, fora do só leitura.
  app.use(createReadMarksRoutes());
  app.use(createReadReceiptsRoutes());
  // Mural de avisos (DEC-079): escritas da terapeuta só no próprio aviso, fora de /therapist/patients.
  app.use(createNoticesRoutes());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
