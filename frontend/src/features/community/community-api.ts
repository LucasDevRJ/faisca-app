import { api } from '../../lib/api';

export type CommunityContentStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN' | 'DELETED';
export type CommunityComment = { id: string; postId: string; authorKind: 'PATIENT' | 'THERAPIST'; authorDisplayName: string; body: string; status: CommunityContentStatus; moderationMessage: string | null; createdAt: string; updatedAt: string };
export type CommunityPost = { id: string; authorKind: 'PATIENT' | 'THERAPIST'; authorDisplayName: string; body: string; status: CommunityContentStatus; moderationMessage: string | null; createdAt: string; updatedAt: string; comments?: CommunityComment[] };
export type CommunityFeed = { posts: CommunityPost[]; events: { id: string; body: string; createdAt: string }[] };
export type CommunityState = { available: boolean; community: { id: string; moderationReviewer: 'THERAPIST' | 'PLATFORM' } | null; membership: { id: string; status: string; displayName: string | null; announceOnJoin: boolean; canSeeHistoryBeforeJoining: boolean } | null; feed: CommunityFeed | null; myContent: ((CommunityPost & { kind: 'POST' }) | (CommunityComment & { kind: 'COMMENT' }))[] };
export type TherapistCommunityState = { community: { id: string; moderationEnabled: boolean } | null; twoFactorEnabled: boolean; requests: { id: string; patientId: string; patientName: string; displayName: string | null; status: string }[]; invitations: { id: string; patientId: string; patientName: string; displayName: string | null; status: string }[]; members: { id: string; patientId: string; patientName: string; displayName: string | null; status: string }[] };
export type ModerationQueue = { posts: CommunityPost[]; comments: CommunityComment[]; reports: { id: string; reason: string; details: string | null; post: CommunityPost | null; comment: CommunityComment | null }[] };

export async function fetchCommunity(): Promise<CommunityState> { return (await api.get<CommunityState>('/community')).data; }
export async function joinCommunity(input: { displayName: string; adultConfirmed: true; rulesAccepted: true; announceOnJoin: boolean }) { return (await api.post('/community/join', input)).data; }
export async function leaveCommunity() { await api.post('/community/leave'); }
export async function createCommunityPost(body: string) { return (await api.post<{ post: CommunityPost }>('/community/posts', { body })).data; }
export async function editCommunityPost(id: string, body: string) { return (await api.patch(`/community/posts/${id}`, { body })).data; }
export async function deleteCommunityPost(id: string) { await api.delete(`/community/posts/${id}`); }
export async function editCommunityComment(id: string, body: string) { return (await api.patch(`/community/comments/${id}`, { body })).data; }
export async function deleteCommunityComment(id: string) { await api.delete(`/community/comments/${id}`); }
export async function createCommunityComment(postId: string, body: string) { return (await api.post(`/community/posts/${postId}/comments`, { body })).data; }
export async function reportCommunityContent(input: { postId?: string; commentId?: string; reason: 'HARASSMENT' | 'PRIVACY' | 'UNSAFE_ADVICE' | 'OTHER'; details?: string }) { await api.post('/community/reports', input); }

export async function fetchTherapistCommunity(): Promise<TherapistCommunityState> { return (await api.get<TherapistCommunityState>('/therapist/community')).data; }
export async function createTherapistCommunity() { return (await api.post('/therapist/community')).data; }
export async function fetchTherapistFeed(): Promise<CommunityFeed> { return (await api.get<CommunityFeed>('/therapist/community/feed')).data; }
export async function inviteToCommunity(patientId: string) { return (await api.post('/therapist/community/invitations', { patientId })).data; }
export async function decideCommunityRequest(id: string, decision: 'APPROVE' | 'REJECT') { return (await api.post(`/therapist/community/requests/${id}/decision`, { decision })).data; }
export async function createTherapistPost(body: string) { return (await api.post('/therapist/community/posts', { body })).data; }
export async function setTherapistCommunityModeration(enabled: boolean): Promise<{ enabled: boolean }> { return (await api.patch<{ enabled: boolean }>('/therapist/community/moderation', { enabled })).data; }
export async function fetchTherapistCommunityModeration(): Promise<ModerationQueue> { return (await api.get<ModerationQueue>('/therapist/community/moderation')).data; }
export async function moderateTherapistCommunityContent(kind: 'posts' | 'comments', id: string, decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'KEEP', message?: string) { return api.patch(`/therapist/community/moderation/${kind}/${id}`, { decision, ...(message ? { message } : {}) }); }
export async function reviewTherapistCommunityReport(id: string, decision: 'REVIEWED' | 'HIDE') { return api.patch(`/therapist/community/moderation/reports/${id}`, { decision }); }
export async function fetchCommunityModeration(): Promise<ModerationQueue> { return (await api.get<ModerationQueue>('/community/moderation')).data; }
export async function moderateCommunityContent(kind: 'posts' | 'comments', id: string, decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'KEEP', message?: string) { return api.patch(`/community/moderation/${kind}/${id}`, { decision, ...(message ? { message } : {}) }); }
export async function reviewCommunityReport(id: string, decision: 'REVIEWED' | 'HIDE') { return api.patch(`/community/moderation/reports/${id}`, { decision }); }
