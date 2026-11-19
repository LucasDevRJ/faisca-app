import { z } from 'zod';

export const COMMUNITY_NAME_MAX = 40;
export const COMMUNITY_POST_MAX = 2000;
export const COMMUNITY_COMMENT_MAX = 1000;
export const COMMUNITY_REASON_MAX = 500;

export const communityIdSchema = z.object({ id: z.uuid({ error: 'Identificador inválido.' }) });
export const communityBodySchema = z.strictObject({
  body: z.string({ error: 'Escreva sua mensagem.' }).trim().min(1).max(COMMUNITY_POST_MAX),
});
export const communityCommentSchema = z.strictObject({
  body: z.string({ error: 'Escreva seu comentário.' }).trim().min(1).max(COMMUNITY_COMMENT_MAX),
});
export const communityJoinSchema = z.strictObject({
  displayName: z.string({ error: 'Escolha como quer aparecer na comunidade.' }).trim().min(1).max(COMMUNITY_NAME_MAX),
  adultConfirmed: z.literal(true, { error: 'A comunidade é para pessoas com 18 anos ou mais.' }),
  rulesAccepted: z.literal(true, { error: 'Leia e aceite as regras para continuar.' }),
  announceOnJoin: z.boolean(),
});
export const communityInviteSchema = z.strictObject({ patientId: z.uuid({ error: 'Paciente inválido.' }) });
export const communityMembershipDecisionSchema = z.strictObject({ decision: z.enum(['APPROVE', 'REJECT']) });
export const communityModerationDecisionSchema = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT', 'HIDE', 'KEEP']),
  message: z.string().trim().max(COMMUNITY_REASON_MAX).optional(),
}).refine((input) => !['REJECT', 'HIDE'].includes(input.decision) || Boolean(input.message), {
  message: 'Explique em particular o motivo da decisão.',
  path: ['message'],
});
export const communityReportSchema = z.strictObject({
  postId: z.uuid().optional(),
  commentId: z.uuid().optional(),
  reason: z.enum(['HARASSMENT', 'PRIVACY', 'UNSAFE_ADVICE', 'OTHER']),
  details: z.string().trim().max(COMMUNITY_REASON_MAX).optional(),
}).refine((input) => Boolean(input.postId) !== Boolean(input.commentId), {
  message: 'Escolha uma publicação ou um comentário para denunciar.',
});
export const communityReportDecisionSchema = z.strictObject({ decision: z.enum(['REVIEWED', 'HIDE']) });

export type CommunityJoinInput = z.infer<typeof communityJoinSchema>;
export type CommunityBodyInput = z.infer<typeof communityBodySchema>;
export type CommunityCommentInput = z.infer<typeof communityCommentSchema>;
export type CommunityReportInput = z.infer<typeof communityReportSchema>;
export type CommunityModerationDecision = z.infer<typeof communityModerationDecisionSchema>;
