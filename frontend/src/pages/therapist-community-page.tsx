import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { TextAreaField } from '../components/ui/text-field';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { useLinkedPatients } from '../features/links/use-links';
import { useCreateTherapistCommunity, useCreateTherapistPost, useDecideCommunityRequest, useInviteToCommunity, useSetTherapistCommunityModeration, useTherapistCommunity, useTherapistCommunityFeed } from '../features/community/use-community';

export function TherapistCommunityPage() {
  const { data: session } = useSession();
  const state = useTherapistCommunity(Boolean(session?.privacyAreas.community));
  const feed = useTherapistCommunityFeed(Boolean(state.data?.community && session?.privacyAreas.community));
  const patients = useLinkedPatients();
  const createCommunity = useCreateTherapistCommunity();
  const invite = useInviteToCommunity();
  const decide = useDecideCommunityRequest();
  const createPost = useCreateTherapistPost();
  const setModeration = useSetTherapistCommunityModeration();
  const [body, setBody] = useState('');
  const [feedback, setFeedback] = useState('');
  const error = state.error ?? feed.error ?? patients.error ?? createCommunity.error ?? invite.error ?? decide.error ?? createPost.error ?? setModeration.error;
  const joined = new Set([...(state.data?.members ?? []), ...(state.data?.invitations ?? []), ...(state.data?.requests ?? [])].map((member) => member.patientId));

  if (session && !session.privacyAreas.community) return <PrivacyConsentGate area="community" audience="therapist" />;

  return <>
    <section className="flex flex-col gap-2"><Link to="/pacientes" className="min-h-11 self-start py-2 font-medium text-primary-text underline underline-offset-4">‹ Meus pacientes</Link><h1 className="text-3xl font-bold sm:text-4xl">Comunidade de apoio</h1><p className="text-muted">Uma comunidade opcional para pacientes adultos com vínculo ativo. Você vê apenas os apelidos e conteúdos da comunidade, não os registros clínicos por esta área.</p></section>
    {error && <Alert tone="attention">{getApiError(error).message}</Alert>}
    <p role="status" className="text-primary-text empty:hidden">{feedback}</p>
    {state.isPending && <p className="text-muted">Carregando…</p>}
    {state.data && !state.data.community && <section className="rounded-lg border border-border bg-surface p-4"><p>Crie sua comunidade para receber pedidos de entrada. Cada paciente escolhe um apelido, confirma ser maior de 18 anos e aceita as regras.</p><Button className="mt-3" disabled={createCommunity.isPending} onClick={() => createCommunity.mutate(undefined, { onSuccess: () => setFeedback('Comunidade criada.') })}>{createCommunity.isPending ? 'Criando…' : 'Criar comunidade'}</Button></section>}
    {state.data?.community && <>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"><h2 className="text-xl font-semibold">Pedidos de entrada</h2>{state.data.requests.length === 0 && <p className="text-muted">Nenhum pedido aguardando.</p>}{state.data.requests.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><p><strong>{member.displayName}</strong> <span className="text-sm text-muted">(conta: {member.patientName})</span></p><div className="flex gap-2"><Button disabled={decide.isPending} onClick={() => decide.mutate({ id: member.id, decision: 'APPROVE' }, { onSuccess: () => setFeedback('Pedido aprovado.') })}>{decide.isPending ? 'Salvando…' : 'Aprovar'}</Button><Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ id: member.id, decision: 'REJECT' }, { onSuccess: () => setFeedback('Pedido recusado.') })}>Recusar</Button></div></div>)}</section>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"><h2 className="text-xl font-semibold">Convidar paciente vinculado</h2><p className="text-sm text-muted">A pessoa ainda precisa confirmar a maioridade, escolher um apelido e aceitar as regras.</p>{patients.data?.filter((patient) => !joined.has(patient.id)).map((patient) => <div key={patient.id} className="flex flex-wrap items-center justify-between gap-2"><p>{patient.name}</p><Button variant="secondary" disabled={invite.isPending} onClick={() => invite.mutate(patient.id)}>Convidar</Button></div>)}{patients.data?.filter((patient) => !joined.has(patient.id)).length === 0 && <p className="text-muted">Todos os pacientes vinculados já receberam convite ou participam.</p>}</section>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"><h2 className="text-xl font-semibold">Escrever para a comunidade</h2><p className="text-sm text-muted">Publicações e comentários escritos por você são revisados pela equipe da plataforma antes de aparecer.</p><form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); createPost.mutate(body, { onSuccess: () => { setBody(''); setFeedback('Publicação enviada para revisão da equipe da plataforma.'); } }); }}><TextAreaField label="Publicação" value={body} onChange={(event) => setBody(event.target.value)} limit={2000} /><Button type="submit" disabled={createPost.isPending || !body.trim()}>{createPost.isPending ? 'Enviando…' : 'Enviar para revisão'}</Button></form></section>
      <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">Membros</h2>{state.data.members.map((member) => <p key={member.id} className="rounded-lg border border-border bg-surface p-3"><strong>{member.displayName || 'Apelido ainda não escolhido'}</strong> <span className="text-muted">· {member.status === 'ACTIVE' ? 'participando' : 'vínculo suspenso'}</span></p>)}</section>
      <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">Publicações aprovadas</h2>{feed.data?.posts.map((post) => <article key={post.id} className="rounded-lg border border-border bg-surface p-4"><p className="font-semibold">{post.authorDisplayName}</p><p className="mt-2 whitespace-pre-wrap break-words">{post.body}</p>{post.comments?.map((comment) => <p key={comment.id} className="mt-2 border-l-2 border-border pl-3"><strong>{comment.authorDisplayName}:</strong> {comment.body}</p>)}</article>)}</section>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"><h2 className="text-xl font-semibold">Revisão das publicações</h2><p className="text-muted">A equipe da plataforma revisa o conteúdo por padrão. Se preferir, você pode revisar as publicações e os comentários da sua própria comunidade. A equipe continua como apoio e pode cobrir ausências.</p>{!state.data.twoFactorEnabled && !state.data.community.moderationEnabled && <Alert tone="attention">Para ativar a revisão por você, primeiro ligue a verificação em duas etapas em <Link to="/conta" className="font-medium underline underline-offset-4">Conta</Link>.</Alert>}{state.data.community.moderationEnabled && !state.data.twoFactorEnabled && <Alert tone="attention">A revisão por você está pausada porque a verificação em duas etapas está desligada. A equipe da plataforma continua responsável pela fila.</Alert>}<Button variant={state.data.community.moderationEnabled ? 'secondary' : 'primary'} aria-pressed={state.data.community.moderationEnabled} disabled={setModeration.isPending || (!state.data.twoFactorEnabled && !state.data.community.moderationEnabled)} onClick={() => setModeration.mutate({ enabled: !state.data?.community?.moderationEnabled }, { onSuccess: (result) => setFeedback(result.enabled ? 'A revisão da sua comunidade foi ativada. Os membros foram avisados.' : 'A revisão voltou para a equipe da plataforma. Os membros foram avisados.') })}>{setModeration.isPending ? 'Salvando…' : state.data.community.moderationEnabled ? 'Desativar revisão por mim' : 'Ativar revisão por mim'}</Button>{state.data.community.moderationEnabled && state.data.twoFactorEnabled && <Link to="/comunidade-psicologa/moderacao" className="min-h-11 self-start py-2 font-medium text-primary-text underline underline-offset-4">Abrir fila de revisão</Link>}</section>
      <p className="text-sm text-muted">A equipe da plataforma mantém acesso à fila de todas as comunidades e pode assumir a revisão quando necessário. Denúncias sobre conteúdo escrito por você ficam com a equipe.</p>
    </>}
  </>;
}
