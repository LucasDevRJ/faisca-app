import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as community from './community-api';

export const COMMUNITY_KEY = ['community'] as const;
export const THERAPIST_COMMUNITY_KEY = ['community', 'therapist'] as const;
export const COMMUNITY_MODERATION_KEY = ['community', 'moderation'] as const;

export function usePatientCommunity(enabled = true) { return useQuery({ queryKey: COMMUNITY_KEY, queryFn: community.fetchCommunity, enabled }); }
export function useTherapistCommunity(enabled = true) { return useQuery({ queryKey: THERAPIST_COMMUNITY_KEY, queryFn: community.fetchTherapistCommunity, enabled }); }
export function useTherapistCommunityFeed(enabled: boolean) { return useQuery({ queryKey: [...THERAPIST_COMMUNITY_KEY, 'feed'], queryFn: community.fetchTherapistFeed, enabled }); }
export function useCommunityModeration(enabled = true) { return useQuery({ queryKey: COMMUNITY_MODERATION_KEY, queryFn: community.fetchCommunityModeration, enabled }); }

function useCommunityMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSettled: async () => { await Promise.all([client.invalidateQueries({ queryKey: COMMUNITY_KEY }), client.invalidateQueries({ queryKey: THERAPIST_COMMUNITY_KEY }), client.invalidateQueries({ queryKey: COMMUNITY_MODERATION_KEY })]); } });
}

export const useJoinCommunity = () => useCommunityMutation(community.joinCommunity);
export const useLeaveCommunity = () => useCommunityMutation(community.leaveCommunity);
export const useCreateCommunityPost = () => useCommunityMutation(community.createCommunityPost);
export const useEditCommunityPost = () => useCommunityMutation(({ id, body }: { id: string; body: string }) => community.editCommunityPost(id, body));
export const useDeleteCommunityPost = () => useCommunityMutation(community.deleteCommunityPost);
export const useEditCommunityComment = () => useCommunityMutation(({ id, body }: { id: string; body: string }) => community.editCommunityComment(id, body));
export const useDeleteCommunityComment = () => useCommunityMutation(community.deleteCommunityComment);
export const useCreateCommunityComment = () => useCommunityMutation(({ postId, body }: { postId: string; body: string }) => community.createCommunityComment(postId, body));
export const useReportCommunityContent = () => useCommunityMutation(community.reportCommunityContent);
export const useCreateTherapistCommunity = () => useCommunityMutation(community.createTherapistCommunity);
export const useInviteToCommunity = () => useCommunityMutation(community.inviteToCommunity);
export const useDecideCommunityRequest = () => useCommunityMutation(({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) => community.decideCommunityRequest(id, decision));
export const useCreateTherapistPost = () => useCommunityMutation(community.createTherapistPost);
export const useModerateCommunityContent = () => useCommunityMutation(({ kind, id, decision, message }: { kind: 'posts' | 'comments'; id: string; decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'KEEP'; message?: string }) => community.moderateCommunityContent(kind, id, decision, message));
export const useReviewCommunityReport = () => useCommunityMutation(({ id, decision }: { id: string; decision: 'REVIEWED' | 'HIDE' }) => community.reviewCommunityReport(id, decision));
