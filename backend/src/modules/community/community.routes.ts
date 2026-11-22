import { Router } from 'express';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requireCommunityModerator } from '../../middlewares/require-community-moderator.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { createCommunityController } from './community.controller.js';
import { createCommunityService } from './community.service.js';

// Issue #220 / DEC-113: as rotas da comunidade ficam fora de /therapist/patients. Elas só tratam
// conteúdo criado para o grupo, com consentimento específico; não leem nem alteram registros clínicos.
export function createCommunityRoutes() {
  const router = Router();
  const controller = createCommunityController(createCommunityService());
  const patient = [requireAuth, requirePatient, requirePrivacy('community')];
  const therapist = [requireAuth, requireTherapist, requirePrivacy('community')];
  const moderator = [requireAuth, requireCommunityModerator, requirePrivacy('community')];
  const postLimit = createRateLimit({ windowMinutes: 60, limit: 10, key: 'user' });
  const commentLimit = createRateLimit({ windowMinutes: 60, limit: 20, key: 'user' });
  const reportLimit = createRateLimit({ windowMinutes: 60, limit: 10, key: 'user' });

  router.get('/community', ...patient, controller.patientState);
  router.post('/community/join', ...patient, postLimit, controller.joinOrRequest);
  router.post('/community/leave', ...patient, controller.leave);
  router.post('/community/posts', ...patient, postLimit, controller.createPatientPost);
  router.patch('/community/posts/:postId', ...patient, postLimit, controller.editPost);
  router.delete('/community/posts/:postId', ...patient, controller.deletePost);
  router.post('/community/posts/:postId/comments', ...patient, commentLimit, controller.createPatientComment);
  router.patch('/community/comments/:commentId', ...patient, commentLimit, controller.editComment);
  router.delete('/community/comments/:commentId', ...patient, controller.deleteComment);
  router.post('/community/reports', ...patient, reportLimit, controller.report);

  router.get('/therapist/community', ...therapist, controller.therapistState);
  router.get('/therapist/community/feed', ...therapist, controller.therapistFeed);
  router.post('/therapist/community', ...therapist, controller.createCommunity);
  router.post('/therapist/community/invitations', ...therapist, postLimit, controller.invite);
  router.post('/therapist/community/requests/:membershipId/decision', ...therapist, controller.decideMembership);
  router.post('/therapist/community/posts', ...therapist, postLimit, controller.createTherapistPost);
  router.post('/therapist/community/posts/:postId/comments', ...therapist, commentLimit, controller.createTherapistComment);
  router.patch('/therapist/community/posts/:postId', ...therapist, postLimit, controller.editPost);
  router.delete('/therapist/community/posts/:postId', ...therapist, controller.deletePost);
  router.patch('/therapist/community/comments/:commentId', ...therapist, commentLimit, controller.editComment);
  router.delete('/therapist/community/comments/:commentId', ...therapist, controller.deleteComment);
  router.patch('/therapist/community/moderation', ...therapist, controller.setTherapistModeration);
  router.get('/therapist/community/moderation', ...therapist, controller.therapistModerationQueue);
  router.patch('/therapist/community/moderation/posts/:postId', ...therapist, controller.moderateTherapistPost);
  router.patch('/therapist/community/moderation/comments/:commentId', ...therapist, controller.moderateTherapistComment);
  router.patch('/therapist/community/moderation/reports/:reportId', ...therapist, controller.reviewTherapistReport);

  router.get('/community/moderation', ...moderator, controller.moderationQueue);
  router.patch('/community/moderation/posts/:postId', ...moderator, controller.moderatePost);
  router.patch('/community/moderation/comments/:commentId', ...moderator, controller.moderateComment);
  router.patch('/community/moderation/reports/:reportId', ...moderator, controller.reviewReport);
  return router;
}
