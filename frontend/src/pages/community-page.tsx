import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { TextAreaField, TextField } from '../components/ui/text-field';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { formatDate } from '../features/links/link-format';
import { usePatientCommunity, useJoinCommunity, useLeaveCommunity, useCreateCommunityPost, useCreateCommunityComment, useReportCommunityContent, useDeleteCommunityPost, useDeleteCommunityComment, useEditCommunityPost, useEditCommunityComment } from '../features/community/use-community';
import type { CommunityPost } from '../features/community/community-api';

const postLimit = 2000;

export function CommunityPage() {
  const { data: user } = useSession();
  const state = usePatientCommunity(Boolean(user?.privacyAreas.community));
  const join = useJoinCommunity();
  const leave = useLeaveCommunity();
  const create = useCreateCommunityPost();
  const comment = useCreateCommunityComment();
  const report = useReportCommunityContent();
  const deletePost = useDeleteCommunityPost();
  const deleteComment = useDeleteCommunityComment();
  const editPost = useEditCommunityPost();
  const editComment = useEditCommunityComment();
  const [displayName, setDisplayName] = useState('');
  const [adult, setAdult] = useState(false);
  const [rules, setRules] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [body, setBody] = useState('');
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [editing, setEditing] = useState<{ kind: 'POST' | 'COMMENT'; id: string; body: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ postId?: string; commentId?: string } | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [confirmation, setConfirmation] = useState<
    | { kind: 'DELETE'; contentKind: 'POST' | 'COMMENT'; id: string }
    | { kind: 'LEAVE' }
    | null
  >(null);

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    join.mutate({ displayName: displayName.trim(), adultConfirmed: true, rulesAccepted: true, announceOnJoin: announce }, { onSuccess: () => setFeedback('Pedido enviado. A psicóloga precisa aprovar sua entrada.') });
  }
  function handlePost(event: FormEvent) {
    event.preventDefault();
    create.mutate(body, { onSuccess: () => { setBody(''); setFeedback('Sua publicação foi enviada para revisão humana. Ela aparecerá depois de aprovada.'); } });
  }
  function handleComment(event: FormEvent, postId: string) {
    event.preventDefault();
    const text = draftComments[postId] ?? '';
    comment.mutate({ postId, body: text }, { onSuccess: () => { setDraftComments((current) => ({ ...current, [postId]: '' })); setFeedback('Seu comentário foi enviado para revisão.'); } });
  }
  function handleReport(target: { postId: string } | { commentId: string }) {
    setReportTarget(target);
  }

  const error = state.error ?? join.error ?? leave.error ?? create.error ?? comment.error ?? report.error ?? deletePost.error ?? deleteComment.error ?? editPost.error ?? editComment.error;
  const membership = state.data?.membership;
  const canJoin = !membership || ['LEFT', 'REJECTED', 'INVITED'].includes(membership.status);

  if (user && !user.privacyAreas.community) return <PrivacyConsentGate area="community" />;

  return <>
    <section className="flex flex-col gap-2">
      <Link to="/registros" className="min-h-11 self-start py-2 font-medium text-primary-text underline underline-offset-4">‹ Meus registros</Link>
      <h1 className="text-3xl font-bold sm:text-4xl">Comunidade de apoio</h1>
      <p className="text-muted">Um espaço opcional para trocar experiências com pessoas acompanhadas pela mesma psicóloga.</p>
    </section>
    {error && <Alert tone="attention">{getApiError(error).message}</Alert>}
    <p role="status" className="text-primary-text empty:hidden">{feedback}</p>
    {state.isPending && <p className="text-muted">Carregando…</p>}
    {state.data && !state.data.available && <Alert>Esta comunidade aparece quando sua psicóloga tiver criado uma e seu vínculo estiver ativo.</Alert>}
    {state.data?.available && !membership && <Alert>Você pode pedir para participar. A psicóloga aprova a entrada.</Alert>}
    {state.data?.available && membership?.status === 'REQUESTED' && <Alert>Seu pedido está aguardando a aprovação da psicóloga.</Alert>}
    {state.data?.available && membership?.status === 'SUSPENDED' && <Alert>Seu acesso está suspenso enquanto o vínculo com a psicóloga estiver inativo.</Alert>}
    {state.data?.available && canJoin && <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6">
      <h2 className="text-xl font-semibold">{membership?.status === 'INVITED' ? 'Aceitar convite' : 'Pedir para participar'}</h2>
      <p className="text-muted">Você pode escolher um apelido. Seu nome e e-mail da conta não aparecem para os outros pacientes. Pessoas da comunidade podem ler o histórico aprovado, inclusive publicações anteriores à sua entrada.</p>
      <form onSubmit={handleJoin} className="flex flex-col gap-4">
        <TextField label="Apelido na comunidade" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required />
        <label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} className="mt-1 size-5 accent-primary" /><span>Confirmo que tenho 18 anos ou mais.</span></label>
        <div className="rounded-lg border border-border p-4"><h3 className="font-semibold">Regras da comunidade</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-muted"><li>Respeite os limites e a privacidade das outras pessoas.</li><li>Não publique dados que identifiquem você ou outra pessoa.</li><li>Compartilhe sua experiência sem orientar, diagnosticar ou substituir a conversa com profissionais.</li><li>As publicações e os comentários passam por revisão humana antes de aparecer.</li></ul></div>
        <label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={rules} onChange={(event) => setRules(event.target.checked)} className="mt-1 size-5 accent-primary" /><span>Li e aceito as regras da comunidade.</span></label>
        <label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={announce} onChange={(event) => setAnnounce(event.target.checked)} className="mt-1 size-5 accent-primary" /><span>Se eu entrar, mostrar no feed uma mensagem de boas-vindas com meu apelido. (Opcional)</span></label>
        <Button type="submit" disabled={!adult || !rules || displayName.trim().length === 0 || join.isPending}>{join.isPending ? 'Enviando…' : membership?.status === 'INVITED' ? 'Aceitar e entrar' : 'Enviar pedido'}</Button>
      </form>
    </section>}
    {state.data?.membership?.status === 'ACTIVE' && <>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6">
        <h2 className="text-xl font-semibold">Escrever para a comunidade</h2>
        <p className="text-muted">As publicações passam por revisão humana antes de aparecer. Evite informações que identifiquem você ou outras pessoas.</p>
        <form onSubmit={handlePost} className="flex flex-col gap-3">
          <TextAreaField label="Sua publicação" value={body} onChange={(event) => setBody(event.target.value)} limit={postLimit} rows={5} required />
          <Button type="submit" disabled={create.isPending || !body.trim() || body.trim().length > postLimit}>{create.isPending ? 'Enviando…' : 'Enviar para revisão'}</Button>
        </form>
      </section>
      <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">Publicações</h2>
        {state.data.feed?.events.map((event) => <p key={event.id} className="rounded-lg border border-border bg-surface p-4 text-muted">{event.body} <span className="text-sm">· {formatDate(event.createdAt)}</span></p>)}
        {state.data.feed?.posts.map((post: CommunityPost) => <article key={post.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6">
          <header className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{post.authorDisplayName}{post.authorKind === 'THERAPIST' ? ' · Psicóloga' : ''}</p><time className="text-sm text-muted">{formatDate(post.createdAt)}</time></header>
          {post.status === 'DELETED' ? <p className="text-muted">{post.body}</p> : <p className="whitespace-pre-wrap break-words">{post.body}</p>}
          {post.comments?.map((item) => <div key={item.id} className="ml-2 border-l-2 border-border pl-3"><p className="text-sm font-semibold">{item.authorDisplayName}</p><p className="whitespace-pre-wrap break-words">{item.body}</p><button type="button" className="min-h-11 text-sm text-primary-text underline" onClick={() => handleReport({ commentId: item.id })}>Denunciar comentário</button></div>)}
          <form onSubmit={(event) => handleComment(event, post.id)} className="flex flex-col gap-2"><TextAreaField label="Comentar" rows={2} value={draftComments[post.id] ?? ''} onChange={(event) => setDraftComments((current) => ({ ...current, [post.id]: event.target.value }))} /><Button variant="secondary" type="submit" disabled={comment.isPending || !(draftComments[post.id] ?? '').trim()}>Enviar comentário para revisão</Button></form>
          <button type="button" className="min-h-11 self-start text-sm text-primary-text underline" onClick={() => handleReport({ postId: post.id })}>Denunciar publicação</button>
        </article>)}
        {state.data.feed?.posts.length === 0 && <p className="text-muted">Ainda não há publicações aprovadas. Você também pode consultar seu conteúdo enviado para revisão abaixo.</p>}
      </section>
      {state.data.myContent.length > 0 && <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">Seu conteúdo</h2>{state.data.myContent.map((item) => <article key={`${item.kind}-${item.id}`} className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted">{item.kind === 'POST' ? 'Publicação' : 'Comentário'} · {item.status === 'PENDING' ? 'Aguardando revisão' : item.status === 'REJECTED' ? 'Não aprovado' : item.status === 'HIDDEN' ? 'Ocultado' : 'Publicado'} · {formatDate(item.createdAt)}</p>{editing?.id === item.id ? <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); const mutation = editing.kind === 'POST' ? editPost : editComment; mutation.mutate({ id: editing.id, body: editing.body }, { onSuccess: () => { setEditing(null); setFeedback('Conteúdo atualizado e enviado novamente para revisão.'); } }); }}><TextAreaField label="Editar conteúdo" value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} limit={item.kind === 'POST' ? 2000 : 1000} /><div className="flex flex-wrap gap-2"><Button type="submit" disabled={item.kind === 'POST' ? editPost.isPending : editComment.isPending}>{(item.kind === 'POST' ? editPost.isPending : editComment.isPending) ? 'Salvando…' : 'Salvar e enviar para revisão'}</Button><Button variant="secondary" disabled={item.kind === 'POST' ? editPost.isPending : editComment.isPending} onClick={() => setEditing(null)}>Cancelar</Button></div></form> : <p className="mt-2 whitespace-pre-wrap break-words">{item.body}</p>}{item.moderationMessage && <p className="mt-2 text-sm text-muted">Mensagem privada: {item.moderationMessage}</p>}{item.status !== 'DELETED' && !editing && <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={editPost.isPending || editComment.isPending || deletePost.isPending || deleteComment.isPending} onClick={() => setEditing({ kind: item.kind, id: item.id, body: item.body })}>Editar</Button><Button variant="secondary" disabled={deletePost.isPending || deleteComment.isPending} onClick={() => setConfirmation({ kind: 'DELETE', contentKind: item.kind, id: item.id })}>{deletePost.isPending || deleteComment.isPending ? 'Apagando…' : 'Apagar meu conteúdo'}</Button></div>}</article>)}</section>}
      <Button variant="secondary" disabled={leave.isPending} onClick={() => setConfirmation({ kind: 'LEAVE' })}>{leave.isPending ? 'Saindo…' : 'Sair da comunidade'}</Button>
    </>}
    {reportTarget && <Dialog title="Denunciar conteúdo" description="A denúncia será revisada em privado. Não inclua informações pessoais desnecessárias." onClose={() => setReportTarget(null)}>
      <DialogForm onSubmit={(event) => { event.preventDefault(); report.mutate({ ...reportTarget, reason: 'OTHER', ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}) }, { onSuccess: () => { setReportTarget(null); setReportDetails(''); setFeedback('Denúncia enviada para revisão privada.'); } }); }} error={report.error ? getApiError(report.error).message : null}>
        <TextAreaField label="O que preocupa você? (opcional)" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={500} rows={4} />
        <DialogActions submitLabel="Enviar denúncia" pending={report.isPending} onCancel={() => setReportTarget(null)} />
      </DialogForm>
    </Dialog>}
    {confirmation && <Dialog
      title={confirmation.kind === 'LEAVE' ? 'Sair da comunidade?' : 'Apagar seu conteúdo?'}
      description={confirmation.kind === 'LEAVE' ? 'Você poderá pedir para participar novamente depois.' : 'O conteúdo será removido da comunidade. Essa ação não pode ser desfeita.'}
      onClose={() => setConfirmation(null)}
    >
      <DialogForm
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmation.kind === 'LEAVE') {
            leave.mutate(undefined, { onSuccess: () => { setConfirmation(null); setFeedback('Você saiu da comunidade. Pode pedir para voltar depois.'); } });
          } else if (confirmation.contentKind === 'POST') {
            deletePost.mutate(confirmation.id, { onSuccess: () => { setConfirmation(null); setFeedback('Seu conteúdo foi apagado.'); } });
          } else {
            deleteComment.mutate(confirmation.id, { onSuccess: () => { setConfirmation(null); setFeedback('Seu conteúdo foi apagado.'); } });
          }
        }}
        error={confirmation.kind === 'LEAVE' ? (leave.error ? getApiError(leave.error).message : null) : confirmation.contentKind === 'POST' ? (deletePost.error ? getApiError(deletePost.error).message : null) : (deleteComment.error ? getApiError(deleteComment.error).message : null)}
      >
        <DialogActions
          submitLabel={confirmation.kind === 'LEAVE' ? 'Sair da comunidade' : 'Apagar meu conteúdo'}
          pending={confirmation.kind === 'LEAVE' ? leave.isPending : confirmation.contentKind === 'POST' ? deletePost.isPending : deleteComment.isPending}
          onCancel={() => setConfirmation(null)}
        />
      </DialogForm>
    </Dialog>}
  </>;
}
