import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { getApiError } from '../auth/auth-api';
import { useSession, useSetAnnouncementEmails } from '../auth/use-session';

// Avisos por e-mail de novidades importantes (DEC-119): ligado por padrão, separado de mensagens
// necessárias à conta e desligável sem afetar os demais avisos.
export function AnnouncementEmailSetting() {
  const { data: user } = useSession();
  const update = useSetAnnouncementEmails();
  const [status, setStatus] = useState('');
  const enabled = user?.announcementEmails ?? true;
  const apiError = update.error ? getApiError(update.error) : null;

  return (
    <section id="novidades-email" tabIndex={-1} aria-labelledby="announcement-email-title" className="flex flex-col gap-3">
      <h2 id="announcement-email-title" className="text-2xl font-semibold">
        Novidades por e-mail
      </h2>
      <p className="text-muted">
        Avisamos por e-mail quando uma novidade importante entrar no ar. Correções pequenas continuam apenas no app.
        O aviso é breve e não inclui registros nem informações de saúde. Você também pode ver tudo em{' '}
        <Link className="font-medium text-primary-text underline underline-offset-4" to="/novidades">
          O que há de novo
        </Link>
        .
      </p>
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}
      <label
        className={`flex min-h-11 items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft ${choiceCardClasses} ${update.isPending ? 'cursor-wait opacity-70' : ''}`}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={update.isPending}
          aria-labelledby="announcement-email-label"
          aria-describedby="announcement-email-hint"
          className="mt-0.5"
          onChange={(event) => {
            if (update.isPending) return;
            const next = event.target.checked;
            setStatus('');
            update.mutate(next, {
              onSuccess: () => setStatus(next ? 'Pronto, os avisos por e-mail estão ligados.' : 'Pronto, os avisos por e-mail foram desligados.'),
            });
          }}
        />
        <span className="flex flex-col">
          <span id="announcement-email-label" className="font-medium">
            Quero receber por e-mail avisos sobre novidades importantes do Faísca
          </span>
          <span id="announcement-email-hint" className="text-sm text-muted">
            Ligado por padrão. Você pode mudar esta escolha quando quiser; isso não altera e-mails da conta ou de segurança.
          </span>
        </span>
      </label>
      <p role="status" className="text-sm text-muted">
        {status}
      </p>
    </section>
  );
}
