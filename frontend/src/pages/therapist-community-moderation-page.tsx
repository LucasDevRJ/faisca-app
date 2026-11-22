import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { formatDate } from '../features/links/link-format';
import {
  useModerateTherapistCommunityContent,
  useReviewTherapistCommunityReport,
  useTherapistCommunityModeration,
} from '../features/community/use-community';

const privateMessages = [
  { label: 'Privacidade', text: 'Para proteger a privacidade, evite detalhes que identifiquem você ou outra pessoa. Se quiser, você pode editar e enviar novamente.' },
  { label: 'Convivência', text: 'Vamos manter este espaço respeitoso e acolhedor. Se quiser, você pode editar e enviar novamente.' },
  { label: 'Orientações', text: 'Este espaço é para compartilhar experiências, sem orientar sobre tratamento ou medicação. Se quiser, você pode editar e enviar novamente.' },
] as const;

export function TherapistCommunityModerationPage() {
  const { data: session } = useSession();
  const queue = useTherapistCommunityModeration(Boolean(session?.privacyAreas.community));
  const moderate = useModerateTherapistCommunityContent();
  const review = useReviewTherapistCommunityReport();
  const [pendingDecision, setPendingDecision] = useState<{ kind: 'posts' | 'comments'; id: string; decision: 'REJECT' | 'HIDE' } | null>(null);
  const [message, setMessage] = useState<string>(privateMessages[0].text);
  const [feedback, setFeedback] = useState('');
  const error = queue.error ?? moderate.error ?? review.error;

  if (session && !session.privacyAreas.community) return <PrivacyConsentGate area="community" audience="therapist" />;

  function decide(kind: 'posts' | 'comments', id: string, decision: 'APPROVE' | 'REJECT' | 'HIDE') {
    if (decision !== 'APPROVE') {
      setPendingDecision({ kind, id, decision });
      setMessage(privateMessages[0].text);
      return;
    }
    moderate.mutate({ kind, id, decision }, { onSuccess: () => setFeedback('Revisão salva.') });
  }

  return <>
    <section className="flex flex-col gap-2">
      <Link to="/comunidade-psicologa" className="min-h-11 self-start py-2 font-medium text-primary-text underline underline-offset-4">‹ Gerenciar comunidade</Link>
      <h1 className="text-3xl font-bold sm:text-4xl">Revisão da sua comunidade</h1>
      <p className="text-muted">Aqui aparecem apenas publicações, comentários e denúncias do seu grupo. A equipe da plataforma continua disponível como apoio.</p>
    </section>
    {error && <Alert tone="attention">{getApiError(error).message}</Alert>}
    <p role="status" className="text-primary-text empty:hidden">{feedback}</p>
    {queue.isPending && <p className="text-muted">Carregando…</p>}
    {queue.data && <>
      <section className="mt-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Publicações para revisar</h2>
        {queue.data.posts.length === 0 && <p className="text-muted">Nenhuma publicação aguardando revisão.</p>}
        {queue.data.posts.map((post) => <article key={post.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="font-semibold">{post.authorDisplayName} · {formatDate(post.createdAt)}</p>
          <p className="whitespace-pre-wrap break-words">{post.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={moderate.isPending} onClick={() => decide('posts', post.id, 'APPROVE')}>Aprovar</Button>
            <Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('posts', post.id, 'REJECT')}>Recusar com mensagem</Button>
            <Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('posts', post.id, 'HIDE')}>Ocultar</Button>
          </div>
        </article>)}
      </section>
      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Comentários para revisar</h2>
        {queue.data.comments.length === 0 && <p className="text-muted">Nenhum comentário aguardando revisão.</p>}
        {queue.data.comments.map((comment) => <article key={comment.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="font-semibold">{comment.authorDisplayName} · {formatDate(comment.createdAt)}</p>
          <p className="whitespace-pre-wrap break-words">{comment.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={moderate.isPending} onClick={() => decide('comments', comment.id, 'APPROVE')}>Aprovar</Button>
            <Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('comments', comment.id, 'REJECT')}>Recusar com mensagem</Button>
            <Button variant="secondary" disabled={moderate.isPending} onClick={() => decide('comments', comment.id, 'HIDE')}>Ocultar</Button>
          </div>
        </article>)}
      </section>
      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Denúncias</h2>
        {queue.data.reports.length === 0 && <p className="text-muted">Nenhuma denúncia aberta.</p>}
        {queue.data.reports.map((report) => <article key={report.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="font-semibold">Motivo: {report.reason}</p>
          {report.details && <p className="whitespace-pre-wrap break-words">{report.details}</p>}
          <p className="whitespace-pre-wrap break-words">{report.post?.body ?? report.comment?.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={review.isPending} onClick={() => review.mutate({ id: report.id, decision: 'REVIEWED' }, { onSuccess: () => setFeedback('Denúncia concluída.') })}>Manter e concluir</Button>
            <Button variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ id: report.id, decision: 'HIDE' }, { onSuccess: () => setFeedback('Conteúdo ocultado e denúncia concluída.') })}>Ocultar conteúdo denunciado</Button>
          </div>
        </article>)}
      </section>
    </>}
    {pendingDecision && <Dialog title={pendingDecision.decision === 'REJECT' ? 'Recusar conteúdo' : 'Ocultar conteúdo'} description="Escolha uma mensagem privada para explicar a decisão com cuidado." onClose={() => setPendingDecision(null)}>
      <DialogForm onSubmit={(event) => {
        event.preventDefault();
        moderate.mutate({ ...pendingDecision, message }, { onSuccess: () => { setPendingDecision(null); setFeedback('Decisão salva e mensagem enviada em privado.'); } });
      }} error={moderate.error ? getApiError(moderate.error).message : null}>
        <fieldset className="flex flex-col gap-3">
          <legend className="font-semibold">Mensagem para a pessoa</legend>
          {privateMessages.map((option) => <label key={option.label} className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3">
            <input type="radio" name="moderation-message" checked={message === option.text} onChange={() => setMessage(option.text)} className="mt-1 size-5 accent-primary" />
            <span>{option.text}</span>
          </label>)}
        </fieldset>
        <DialogActions submitLabel={pendingDecision.decision === 'REJECT' ? 'Recusar conteúdo' : 'Ocultar conteúdo'} pending={moderate.isPending} onCancel={() => setPendingDecision(null)} />
      </DialogForm>
    </Dialog>}
  </>;
}
