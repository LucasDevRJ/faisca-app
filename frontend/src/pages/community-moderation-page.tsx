import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { TextAreaField } from '../components/ui/text-field';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { formatDate } from '../features/links/link-format';
import { useCommunityModeration, useModerateCommunityContent, useReviewCommunityReport } from '../features/community/use-community';

const reportReasons: Record<string, string> = {
  HARASSMENT: 'Desrespeito ou assédio',
  PRIVACY: 'Privacidade',
  UNSAFE_ADVICE: 'Orientação arriscada',
  OTHER: 'Outro motivo',
};

export function CommunityModerationPage() {
  const [pendingDecision, setPendingDecision] = useState<{ kind: 'posts' | 'comments'; id: string; decision: 'REJECT' | 'HIDE' } | null>(null);
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const { data: session } = useSession();
  const queue = useCommunityModeration(Boolean(session?.privacyAreas.community));
  const moderate = useModerateCommunityContent();
  const review = useReviewCommunityReport();
  const error = queue.error ?? moderate.error ?? review.error;
  if (session && !session.privacyAreas.community) return <PrivacyConsentGate area="community" audience="moderator" />;
  function decide(kind: 'posts' | 'comments', id: string, decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'KEEP') {
    if (decision === 'REJECT' || decision === 'HIDE') { setPendingDecision({ kind, id, decision }); setMessage(''); return; }
    moderate.mutate({ kind, id, decision }, { onSuccess: () => setFeedback('Revisão salva.') });
  }
  return <>
    <section className="flex flex-col gap-2"><Link to="/" className="min-h-11 self-start py-2 font-medium text-primary-text underline underline-offset-4">‹ Início</Link><h1 className="text-3xl font-bold sm:text-4xl">Revisão da comunidade</h1><p className="text-muted">Esta área mostra apenas publicações, comentários e denúncias da comunidade. Não dá acesso a registros clínicos.</p></section>
    {error && <Alert tone="attention">{getApiError(error).message}</Alert>}
    <p role="status" className="text-primary-text empty:hidden">{feedback}</p>
    {queue.isPending && <p className="text-muted">Carregando…</p>}
    {queue.data && <>
      <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">Publicações para revisar</h2>{queue.data.posts.length === 0 && <p className="text-muted">Nenhuma publicação pendente.</p>}{queue.data.posts.map((post) => <article key={post.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"><p className="font-semibold">{post.authorDisplayName} · {formatDate(post.createdAt)}</p><p className="whitespace-pre-wrap break-words">{post.body}</p><div className="flex flex-wrap gap-2"><Button disabled={moderate.isPending} onClick={() => decide('posts', post.id, 'APPROVE')}>{moderate.isPending ? 'Salvando…' : 'Aprovar'}</Button><Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('posts', post.id, 'REJECT')}>Recusar com mensagem privada</Button><Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('posts', post.id, 'HIDE')}>Ocultar</Button></div></article>)}</section>
      <section className="mt-6 flex flex-col gap-3"><h2 className="text-xl font-semibold">Comentários para revisar</h2>{queue.data.comments.length === 0 && <p className="text-muted">Nenhum comentário pendente.</p>}{queue.data.comments.map((comment) => <article key={comment.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"><p className="font-semibold">{comment.authorDisplayName} · {formatDate(comment.createdAt)}</p><p className="whitespace-pre-wrap break-words">{comment.body}</p><div className="flex flex-wrap gap-2"><Button disabled={moderate.isPending} onClick={() => decide('comments', comment.id, 'APPROVE')}>{moderate.isPending ? 'Salvando…' : 'Aprovar'}</Button><Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('comments', comment.id, 'REJECT')}>Recusar com mensagem privada</Button><Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('comments', comment.id, 'HIDE')}>Ocultar</Button></div></article>)}</section>
      <section className="mt-6 flex flex-col gap-3"><h2 className="text-xl font-semibold">Denúncias</h2>{queue.data.reports.length === 0 && <p className="text-muted">Nenhuma denúncia aberta.</p>}{queue.data.reports.map((report) => <article key={report.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"><p className="font-semibold">Motivo: {reportReasons[report.reason] ?? 'Outro motivo'}</p>{report.details && <p>{report.details}</p>}<p className="whitespace-pre-wrap break-words">{report.post?.body ?? report.comment?.body}</p><div className="flex flex-wrap gap-2"><Button disabled={review.isPending} onClick={() => review.mutate({ id: report.id, decision: 'REVIEWED' }, { onSuccess: () => setFeedback('Denúncia concluída.') })}>{review.isPending ? 'Salvando…' : 'Manter e concluir'}</Button><Button variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ id: report.id, decision: 'HIDE' }, { onSuccess: () => setFeedback('Conteúdo ocultado e denúncia concluída.') })}>Ocultar conteúdo</Button></div></article>)}</section>
    </>}
    {pendingDecision && <Dialog title={pendingDecision.decision === 'REJECT' ? 'Recusar conteúdo' : 'Ocultar conteúdo'} description="Escreva uma mensagem privada para explicar a decisão à pessoa autora." onClose={() => setPendingDecision(null)}>
      <DialogForm onSubmit={(event) => { event.preventDefault(); const text = message.trim(); if (!text) return; moderate.mutate({ ...pendingDecision, message: text }, { onSuccess: () => { setPendingDecision(null); setFeedback('Decisão salva e mensagem enviada em privado.'); } }); }} error={moderate.error ? getApiError(moderate.error).message : null}>
        <TextAreaField label="Mensagem privada" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={4} required />
        <DialogActions submitLabel={pendingDecision.decision === 'REJECT' ? 'Recusar conteúdo' : 'Ocultar conteúdo'} pending={moderate.isPending} onCancel={() => setPendingDecision(null)} />
      </DialogForm>
    </Dialog>}
  </>;
}
