import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  communityBodySchema,
  communityCommentSchema,
  communityIdSchema,
  communityInviteSchema,
  communityJoinSchema,
  communityMembershipDecisionSchema,
  communityModerationDecisionSchema,
  communityReportDecisionSchema,
  communityReportSchema,
} from './community.schema.js';
import type { CommunityService } from './community.service.js';

const routeId = (req: Parameters<RequestHandler>[0], key: string) => communityIdSchema.parse({ id: req.params[key] }).id;

export function createCommunityController(service: CommunityService) {
  const patientState: RequestHandler = async (req, res) => res.json(await service.patientState(getAuthUser(req).id));
  const joinOrRequest: RequestHandler = async (req, res) => {
    res.status(201).json(await service.joinOrRequest(getAuthUser(req).id, communityJoinSchema.parse(req.body)));
  };
  const leave: RequestHandler = async (req, res) => {
    await service.leave(getAuthUser(req).id);
    res.status(204).end();
  };
  const createPatientPost: RequestHandler = async (req, res) => {
    res.status(201).json(await service.createPatientPost(getAuthUser(req).id, communityBodySchema.parse(req.body)));
  };
  const createTherapistPost: RequestHandler = async (req, res) => {
    res.status(201).json(await service.createTherapistPost(getAuthUser(req).id, communityBodySchema.parse(req.body)));
  };
  const createPatientComment: RequestHandler = async (req, res) => {
    res.status(201).json(await service.createComment(
      getAuthUser(req).id,
      'PATIENT',
      routeId(req, 'postId'),
      communityCommentSchema.parse(req.body),
    ));
  };
  const createTherapistComment: RequestHandler = async (req, res) => {
    res.status(201).json(await service.createComment(
      getAuthUser(req).id,
      'THERAPIST',
      routeId(req, 'postId'),
      communityCommentSchema.parse(req.body),
    ));
  };
  const editPost: RequestHandler = async (req, res) => {
    res.json(await service.editPost(getAuthUser(req).id, routeId(req, 'postId'), communityBodySchema.parse(req.body)));
  };
  const editComment: RequestHandler = async (req, res) => {
    res.json(await service.editComment(getAuthUser(req).id, routeId(req, 'commentId'), communityCommentSchema.parse(req.body)));
  };
  const deletePost: RequestHandler = async (req, res) => {
    await service.deletePost(getAuthUser(req).id, routeId(req, 'postId'));
    res.status(204).end();
  };
  const deleteComment: RequestHandler = async (req, res) => {
    await service.deleteComment(getAuthUser(req).id, routeId(req, 'commentId'));
    res.status(204).end();
  };
  const report: RequestHandler = async (req, res) => {
    res.status(201).json(await service.report(getAuthUser(req).id, communityReportSchema.parse(req.body)));
  };
  const therapistState: RequestHandler = async (req, res) => res.json(await service.therapistState(getAuthUser(req).id));
  const therapistFeed: RequestHandler = async (req, res) => res.json(await service.therapistFeed(getAuthUser(req).id));
  const createCommunity: RequestHandler = async (req, res) => {
    res.status(201).json(await service.createCommunity(getAuthUser(req).id));
  };
  const invite: RequestHandler = async (req, res) => {
    res.status(201).json(await service.invite(getAuthUser(req).id, communityInviteSchema.parse(req.body).patientId));
  };
  const decideMembership: RequestHandler = async (req, res) => {
    const { decision } = communityMembershipDecisionSchema.parse(req.body);
    res.json(await service.decideMembership(getAuthUser(req).id, routeId(req, 'membershipId'), decision));
  };
  const moderationQueue: RequestHandler = async (_req, res) => res.json(await service.moderationQueue());
  const moderatePost: RequestHandler = async (req, res) => {
    res.json(await service.moderatePost(getAuthUser(req).id, routeId(req, 'postId'), communityModerationDecisionSchema.parse(req.body)));
  };
  const moderateComment: RequestHandler = async (req, res) => {
    res.json(await service.moderateComment(getAuthUser(req).id, routeId(req, 'commentId'), communityModerationDecisionSchema.parse(req.body)));
  };
  const reviewReport: RequestHandler = async (req, res) => {
    res.json(await service.reviewReport(
      getAuthUser(req).id,
      routeId(req, 'reportId'),
      communityReportDecisionSchema.parse(req.body).decision,
    ));
  };

  return {
    patientState, joinOrRequest, leave, createPatientPost, createTherapistPost,
    createPatientComment, createTherapistComment, editPost, editComment, deletePost,
    deleteComment, report, therapistState, therapistFeed, createCommunity, invite,
    decideMembership, moderationQueue, moderatePost, moderateComment, reviewReport,
  };
}
