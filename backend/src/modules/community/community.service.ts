import { AppError } from '../../errors/app-error.js';
import type { CommunityComment, CommunityPost, CommunityReport } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import type {
  CommunityBodyInput,
  CommunityCommentInput,
  CommunityJoinInput,
  CommunityModerationDecision,
  CommunityReportInput,
} from './community.schema.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'Você não tem acesso a esta comunidade.');
const notFound = () => new AppError(404, 'COMMUNITY_NOT_FOUND', 'Comunidade não encontrada.');
const conflict = (message: string) => new AppError(409, 'COMMUNITY_CONFLICT', message);

function toPublicPost(post: CommunityPost) {
  return {
    id: post.id,
    authorKind: post.authorKind,
    authorDisplayName: post.authorDisplayName,
    body: post.body,
    status: post.status,
    moderationMessage: post.moderationMessage,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function toPublicComment(comment: CommunityComment) {
  return {
    id: comment.id,
    postId: comment.postId,
    authorKind: comment.authorKind,
    authorDisplayName: comment.authorDisplayName,
    body: comment.body,
    status: comment.status,
    moderationMessage: comment.moderationMessage,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

function toPublicReport(report: CommunityReport & { post: CommunityPost | null; comment: CommunityComment | null }) {
  return {
    id: report.id,
    reason: report.reason,
    details: report.details,
    createdAt: report.createdAt.toISOString(),
    post: report.post ? toPublicPost(report.post) : null,
    comment: report.comment ? toPublicComment(report.comment) : null,
  };
}

async function activePsychologyLink(patientId: string) {
  return prisma.therapistLink.findFirst({
    where: { patientId, kind: 'PSICOLOGIA', revokedAt: null },
    select: { therapistId: true },
  });
}

async function patientCommunity(patientId: string) {
  const link = await activePsychologyLink(patientId);
  if (!link) return null;
  return prisma.community.findUnique({ where: { therapistId: link.therapistId } });
}

async function ownerCommunity(therapistId: string) {
  const therapist = await prisma.user.findUnique({
    where: { id: therapistId },
    select: { hasTherapistProfile: true, professionalKind: true },
  });
  if (!therapist?.hasTherapistProfile || therapist.professionalKind !== 'PSICOLOGIA') throw forbidden();
  return prisma.community.findUnique({ where: { therapistId } });
}

async function requireActiveMembership(patientId: string, communityId: string) {
  const membership = await prisma.communityMembership.findUnique({
    where: { communityId_patientId: { communityId, patientId } },
  });
  if (!membership || membership.status !== 'ACTIVE') throw forbidden();
  const community = await patientCommunity(patientId);
  if (!community || community.id !== communityId) throw forbidden();
  return membership;
}

async function addJoinEvent(communityId: string, membership: { status: string; announceOnJoin: boolean; displayName: string | null }) {
  if (membership.status !== 'ACTIVE' || !membership.announceOnJoin || !membership.displayName) return;
  await prisma.communityEvent.create({
    data: { communityId, body: `${membership.displayName} chegou à comunidade.` },
  });
}

async function feedFor(communityId: string) {
  const [posts, events] = await Promise.all([
    prisma.communityPost.findMany({
      where: { communityId, status: { in: ['PUBLISHED', 'DELETED'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        comments: {
          where: { status: { in: ['PUBLISHED', 'DELETED'] } },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.communityEvent.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true, createdAt: true },
    }),
  ]);
  return {
    posts: posts.map(({ comments, ...post }) => ({
      ...toPublicPost(post),
      comments: comments.map(toPublicComment),
    })),
    events: events.map((event) => ({ id: event.id, body: event.body, createdAt: event.createdAt.toISOString() })),
  };
}

export function createCommunityService() {
  return {
    // ——— Paciente ———

    async patientState(patientId: string) {
      const link = await activePsychologyLink(patientId);
      if (!link) return { available: false, community: null, membership: null, feed: null, myContent: [] };
      const community = await prisma.community.findUnique({ where: { therapistId: link.therapistId } });
      if (!community) return { available: false, community: null, membership: null, feed: null, myContent: [] };

      const membership = await prisma.communityMembership.findUnique({
        where: { communityId_patientId: { communityId: community.id, patientId } },
      });
      if (!membership) return { available: true, community: { id: community.id }, membership: null, feed: null, myContent: [] };

      const active = membership.status === 'ACTIVE';
      const [feed, posts, comments] = await Promise.all([
        active ? feedFor(community.id) : Promise.resolve(null),
        prisma.communityPost.findMany({ where: { communityId: community.id, authorId: patientId, status: { in: ['PENDING', 'REJECTED', 'PUBLISHED', 'HIDDEN'] } }, orderBy: { createdAt: 'desc' }, take: 50 }),
        prisma.communityComment.findMany({ where: { post: { communityId: community.id }, authorId: patientId, status: { in: ['PENDING', 'REJECTED', 'PUBLISHED', 'HIDDEN'] } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      ]);
      return {
        available: true,
        community: { id: community.id },
        membership: {
          id: membership.id,
          status: membership.status,
          displayName: membership.displayName,
          announceOnJoin: membership.announceOnJoin,
          canSeeHistoryBeforeJoining: true,
        },
        feed,
        myContent: [
          ...posts.map((post) => ({ kind: 'POST' as const, ...toPublicPost(post) })),
          ...comments.map((comment) => ({ kind: 'COMMENT' as const, ...toPublicComment(comment) })),
        ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    },

    async joinOrRequest(patientId: string, input: CommunityJoinInput) {
      const community = await patientCommunity(patientId);
      if (!community) throw notFound();
      const existing = await prisma.communityMembership.findUnique({
        where: { communityId_patientId: { communityId: community.id, patientId } },
      });
      if (existing?.status === 'ACTIVE') throw conflict('Você já participa desta comunidade.');
      if (existing?.status === 'REQUESTED') throw conflict('Seu pedido já está aguardando aprovação.');

      const invited = existing?.status === 'INVITED';
      const now = new Date();
      const data = {
        displayName: input.displayName,
        acceptedRulesAt: now,
        adultConfirmedAt: now,
        announceOnJoin: input.announceOnJoin,
        status: invited ? ('ACTIVE' as const) : ('REQUESTED' as const),
        requestedAt: invited ? null : now,
        joinedAt: invited ? now : null,
        leftAt: null,
      };
      const membership = existing
        ? await prisma.communityMembership.update({ where: { id: existing.id }, data })
        : await prisma.communityMembership.create({ data: { communityId: community.id, patientId, ...data } });
      if (invited) await addJoinEvent(community.id, membership);
      logger.info({ communityId: community.id, membershipId: membership.id, patientId }, invited ? 'Entrada na comunidade aceita' : 'Pedido de entrada enviado');
      return { status: membership.status };
    },

    async leave(patientId: string) {
      const community = await patientCommunity(patientId);
      if (!community) throw notFound();
      const membership = await prisma.communityMembership.findUnique({
        where: { communityId_patientId: { communityId: community.id, patientId } },
      });
      if (!membership || membership.status !== 'ACTIVE') throw forbidden();
      await prisma.communityMembership.update({ where: { id: membership.id }, data: { status: 'LEFT', leftAt: new Date() } });
    },

    async createPatientPost(patientId: string, input: CommunityBodyInput) {
      const community = await patientCommunity(patientId);
      if (!community) throw notFound();
      const membership = await requireActiveMembership(patientId, community.id);
      const post = await prisma.communityPost.create({
        data: {
          communityId: community.id,
          authorId: patientId,
          authorKind: 'PATIENT',
          authorDisplayName: membership.displayName ?? 'Pessoa da comunidade',
          body: input.body,
        },
      });
      logger.info({ communityId: community.id, postId: post.id, patientId }, 'Publicação enviada para revisão');
      return { post: toPublicPost(post) };
    },

    async createTherapistPost(therapistId: string, input: CommunityBodyInput) {
      const community = await ownerCommunity(therapistId);
      if (!community) throw notFound();
      const therapist = await prisma.user.findUniqueOrThrow({ where: { id: therapistId }, select: { name: true } });
      const post = await prisma.communityPost.create({
        data: {
          communityId: community.id,
          authorId: therapistId,
          authorKind: 'THERAPIST',
          authorDisplayName: therapist.name,
          body: input.body,
        },
      });
      return { post: toPublicPost(post) };
    },

    async createComment(authorId: string, authorKind: 'PATIENT' | 'THERAPIST', postId: string, input: CommunityCommentInput) {
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post || post.status !== 'PUBLISHED') throw notFound();
      let displayName: string;
      if (authorKind === 'PATIENT') {
        const membership = await requireActiveMembership(authorId, post.communityId);
        displayName = membership.displayName ?? 'Pessoa da comunidade';
      } else {
        const community = await ownerCommunity(authorId);
        if (!community || community.id !== post.communityId) throw forbidden();
        const therapist = await prisma.user.findUniqueOrThrow({ where: { id: authorId }, select: { name: true } });
        displayName = therapist.name;
      }
      const comment = await prisma.communityComment.create({
        data: { postId, authorId, authorKind, authorDisplayName: displayName, body: input.body },
      });
      logger.info({ communityId: post.communityId, postId, commentId: comment.id, authorId }, 'Comentário enviado para revisão');
      return { comment: toPublicComment(comment) };
    },

    async editPost(authorId: string, postId: string, input: CommunityBodyInput) {
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post || post.authorId !== authorId || post.status === 'DELETED') throw forbidden();
      if (post.authorKind === 'PATIENT') await requireActiveMembership(authorId, post.communityId);
      else {
        const community = await ownerCommunity(authorId);
        if (!community || community.id !== post.communityId) throw forbidden();
      }
      const updated = await prisma.communityPost.update({
        where: { id: postId },
        data: { body: input.body, status: 'PENDING', moderationMessage: null, reviewedAt: null, moderatorId: null },
      });
      return { post: toPublicPost(updated) };
    },

    async editComment(authorId: string, commentId: string, input: CommunityCommentInput) {
      const comment = await prisma.communityComment.findUnique({ where: { id: commentId }, include: { post: true } });
      if (!comment || comment.authorId !== authorId || comment.status === 'DELETED') throw forbidden();
      if (comment.authorKind === 'PATIENT') await requireActiveMembership(authorId, comment.post.communityId);
      else {
        const community = await ownerCommunity(authorId);
        if (!community || community.id !== comment.post.communityId) throw forbidden();
      }
      const updated = await prisma.communityComment.update({
        where: { id: commentId },
        data: { body: input.body, status: 'PENDING', moderationMessage: null, reviewedAt: null, moderatorId: null },
      });
      return { comment: toPublicComment(updated) };
    },

    async deletePost(authorId: string, postId: string) {
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post || post.authorId !== authorId) throw forbidden();
      await prisma.communityPost.update({
        where: { id: postId },
        data: { body: 'Esta publicação foi apagada pela pessoa autora.', authorDisplayName: 'Pessoa da comunidade', status: 'DELETED', moderationMessage: null },
      });
    },

    async deleteComment(authorId: string, commentId: string) {
      const comment = await prisma.communityComment.findUnique({ where: { id: commentId } });
      if (!comment || comment.authorId !== authorId) throw forbidden();
      await prisma.communityComment.update({
        where: { id: commentId },
        data: { body: 'Este comentário foi apagado pela pessoa autora.', authorDisplayName: 'Pessoa da comunidade', status: 'DELETED', moderationMessage: null },
      });
    },

    async report(patientId: string, input: CommunityReportInput) {
      const community = await patientCommunity(patientId);
      if (!community) throw forbidden();
      await requireActiveMembership(patientId, community.id);
      if (input.postId) {
        const post = await prisma.communityPost.findUnique({ where: { id: input.postId } });
        if (!post || post.status !== 'PUBLISHED' || post.communityId !== community.id || post.authorId === patientId) throw forbidden();
        const prior = await prisma.communityReport.findFirst({ where: { reporterId: patientId, postId: input.postId, status: 'OPEN' } });
        if (prior) throw conflict('Você já denunciou este conteúdo.');
      }
      if (input.commentId) {
        const comment = await prisma.communityComment.findUnique({ where: { id: input.commentId }, include: { post: true } });
        if (!comment || comment.status !== 'PUBLISHED' || comment.post.communityId !== community.id || comment.authorId === patientId) throw forbidden();
        const prior = await prisma.communityReport.findFirst({ where: { reporterId: patientId, commentId: input.commentId, status: 'OPEN' } });
        if (prior) throw conflict('Você já denunciou este conteúdo.');
      }
      const report = await prisma.communityReport.create({
        data: {
          communityId: community.id,
          reporterId: patientId,
          postId: input.postId,
          commentId: input.commentId,
          reason: input.reason,
          details: input.details || null,
        },
      });
      logger.info({ communityId: community.id, reportId: report.id, reporterId: patientId }, 'Denúncia recebida');
      return { received: true };
    },

    // ——— Psicóloga: a própria comunidade e a entrada de pacientes vinculados ———

    async therapistState(therapistId: string) {
      const community = await ownerCommunity(therapistId);
      if (!community) return { community: null, requests: [], invitations: [], members: [] };
      const memberships = await prisma.communityMembership.findMany({
        where: { communityId: community.id, status: { in: ['REQUESTED', 'INVITED', 'ACTIVE', 'SUSPENDED'] } },
        orderBy: { createdAt: 'asc' },
        include: { patient: { select: { id: true, name: true } } },
      });
      const mapped = memberships.map((membership) => ({
        id: membership.id,
        patientId: membership.patient.id,
        patientName: membership.patient.name,
        displayName: membership.displayName,
        status: membership.status,
        requestedAt: membership.requestedAt?.toISOString() ?? null,
      }));
      return {
        community: { id: community.id },
        requests: mapped.filter((item) => item.status === 'REQUESTED'),
        invitations: mapped.filter((item) => item.status === 'INVITED'),
        members: mapped.filter((item) => ['ACTIVE', 'SUSPENDED'].includes(item.status)),
      };
    },

    async therapistFeed(therapistId: string) {
      const community = await ownerCommunity(therapistId);
      if (!community) throw notFound();
      return feedFor(community.id);
    },

    async createCommunity(therapistId: string) {
      await ownerCommunity(therapistId);
      const existing = await prisma.community.findUnique({ where: { therapistId } });
      if (existing) throw conflict('Você já tem uma comunidade.');
      const community = await prisma.community.create({ data: { therapistId } });
      return { community: { id: community.id } };
    },

    async invite(therapistId: string, patientId: string) {
      const community = await ownerCommunity(therapistId);
      if (!community) throw notFound();
      const link = await prisma.therapistLink.findFirst({ where: { therapistId, patientId, kind: 'PSICOLOGIA', revokedAt: null } });
      if (!link) throw forbidden();
      const existing = await prisma.communityMembership.findUnique({ where: { communityId_patientId: { communityId: community.id, patientId } } });
      if (existing?.status === 'ACTIVE' || existing?.status === 'REQUESTED' || existing?.status === 'INVITED') {
        throw conflict('Essa pessoa já participa ou tem um pedido pendente.');
      }
      const membership = existing
        ? await prisma.communityMembership.update({ where: { id: existing.id }, data: { status: 'INVITED', invitedAt: new Date(), requestedAt: null, leftAt: null } })
        : await prisma.communityMembership.create({ data: { communityId: community.id, patientId, status: 'INVITED', invitedAt: new Date() } });
      logger.info({ communityId: community.id, membershipId: membership.id, therapistId, patientId }, 'Convite para a comunidade criado');
      return { membershipId: membership.id };
    },

    async decideMembership(therapistId: string, membershipId: string, decision: 'APPROVE' | 'REJECT') {
      const community = await ownerCommunity(therapistId);
      if (!community) throw notFound();
      const membership = await prisma.communityMembership.findUnique({ where: { id: membershipId } });
      if (!membership || membership.communityId !== community.id || membership.status !== 'REQUESTED') throw forbidden();
      const link = await prisma.therapistLink.findFirst({ where: { therapistId, patientId: membership.patientId, kind: 'PSICOLOGIA', revokedAt: null } });
      if (!link) throw forbidden();
      const active = decision === 'APPROVE';
      const updated = await prisma.communityMembership.update({
        where: { id: membershipId },
        data: { status: active ? 'ACTIVE' : 'REJECTED', joinedAt: active ? new Date() : null, leftAt: null },
      });
      if (active) await addJoinEvent(community.id, updated);
      return { status: updated.status };
    },

    // ——— Moderação da plataforma: conteúdo comunitário pendente ou denunciado, sem perfil clínico ———

    async moderationQueue() {
      const [posts, comments, reports] = await Promise.all([
        prisma.communityPost.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 }),
        prisma.communityComment.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 }),
        prisma.communityReport.findMany({
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'asc' },
          take: 100,
          include: { post: true, comment: true },
        }),
      ]);
      return {
        posts: posts.map(toPublicPost),
        comments: comments.map(toPublicComment),
        reports: reports.map((report) => toPublicReport(report as typeof report & { post: CommunityPost | null; comment: CommunityComment | null })),
      };
    },

    async moderatePost(moderatorId: string, postId: string, input: CommunityModerationDecision) {
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post || post.status === 'DELETED') throw notFound();
      const status = input.decision === 'APPROVE' || input.decision === 'KEEP'
        ? 'PUBLISHED'
        : input.decision === 'REJECT' ? 'REJECTED' : 'HIDDEN';
      const updated = await prisma.communityPost.update({
        where: { id: postId },
        data: {
          status,
          moderationMessage: ['REJECT', 'HIDE'].includes(input.decision) ? input.message ?? null : null,
          reviewedAt: new Date(),
          moderatorId,
        },
      });
      logger.info({ communityId: post.communityId, postId, moderatorId, decision: input.decision }, 'Publicação moderada');
      return { post: toPublicPost(updated) };
    },

    async moderateComment(moderatorId: string, commentId: string, input: CommunityModerationDecision) {
      const comment = await prisma.communityComment.findUnique({ where: { id: commentId } });
      if (!comment || comment.status === 'DELETED') throw notFound();
      const status = input.decision === 'APPROVE' || input.decision === 'KEEP'
        ? 'PUBLISHED'
        : input.decision === 'REJECT' ? 'REJECTED' : 'HIDDEN';
      const updated = await prisma.communityComment.update({
        where: { id: commentId },
        data: {
          status,
          moderationMessage: ['REJECT', 'HIDE'].includes(input.decision) ? input.message ?? null : null,
          reviewedAt: new Date(),
          moderatorId,
        },
      });
      logger.info({ commentId, moderatorId, decision: input.decision }, 'Comentário moderado');
      return { comment: toPublicComment(updated) };
    },

    async reviewReport(moderatorId: string, reportId: string, decision: 'REVIEWED' | 'HIDE') {
      const report = await prisma.communityReport.findUnique({ where: { id: reportId } });
      if (!report || report.status !== 'OPEN') throw notFound();
      const now = new Date();
      if (decision === 'HIDE') {
        if (report.postId) await prisma.communityPost.update({ where: { id: report.postId }, data: { status: 'HIDDEN', moderationMessage: 'A equipe retirou este conteúdo da comunidade após uma denúncia.', reviewedAt: now, moderatorId } });
        if (report.commentId) await prisma.communityComment.update({ where: { id: report.commentId }, data: { status: 'HIDDEN', moderationMessage: 'A equipe retirou este conteúdo da comunidade após uma denúncia.', reviewedAt: now, moderatorId } });
      }
      await prisma.communityReport.update({ where: { id: reportId }, data: { status: 'REVIEWED', reviewedAt: now, moderatorId } });
      logger.info({ communityId: report.communityId, reportId, moderatorId, decision }, 'Denúncia revisada');
      return { reviewed: true };
    },
  };
}

export type CommunityService = ReturnType<typeof createCommunityService>;
