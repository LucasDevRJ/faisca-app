import { useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { getApiError } from '../auth/auth-api';
import { formatDate, formatDateTime } from './link-format';
import type { GeneratedCode, LinkStatus } from './links-api';
import { InviteDialog, RevokeLinkDialog } from './link-dialogs';
import { useCancelInvite, useGenerateLinkCode, useLinkStatus } from './use-links';

// "Minha terapeuta" em /conta (SPEC, "Vínculo"). A tela segue a situação que a API devolve:
// vínculo ativo, convite pendente, código gerado agora ou nada ainda.
export function TherapistLinkSection() {
  const status = useLinkStatus();
  const generate = useGenerateLinkCode();
  const [dialog, setDialog] = useState<'invite' | 'revoke' | null>(null);

  return (
    <section aria-labelledby="therapist-link-title" className="flex flex-col gap-4">
      <h2 id="therapist-link-title" className="text-2xl font-semibold">
        Minha terapeuta
      </h2>

      {status.isPending && <p className="text-muted">Carregando…</p>}
      {status.isError && <Alert tone="attention">{getApiError(status.error).message}</Alert>}
      {status.data && (
        <LinkState
          status={status.data}
          // Só vale enquanto o vínculo não existe: depois dele o código já foi usado.
          generated={status.data.link ? null : (generate.data ?? null)}
          generating={generate.isPending}
          generateError={generate.error ? getApiError(generate.error).message : null}
          onGenerate={() => generate.mutate()}
          onInvite={() => setDialog('invite')}
          onRevoke={() => setDialog('revoke')}
        />
      )}

      {dialog === 'invite' && (
        <InviteDialog
          onClose={() => setDialog(null)}
          // Um convite apaga o código que estava valendo (DEC-031): some da tela também.
          onSent={() => generate.reset()}
        />
      )}
      {dialog === 'revoke' && status.data?.link && (
        <RevokeLinkDialog therapistName={status.data.link.therapist.name} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}

type LinkStateProps = {
  status: LinkStatus;
  generated: GeneratedCode | null;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
  onInvite: () => void;
  onRevoke: () => void;
};

function LinkState({ status, generated, generating, generateError, onGenerate, onInvite, onRevoke }: LinkStateProps) {
  if (status.link) {
    const { therapist, createdAt } = status.link;
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft">
        <dl className="flex flex-col gap-1">
          <dt className="sr-only">Nome</dt>
          <dd className="text-lg font-semibold">{therapist.name}</dd>
          <dt className="sr-only">E-mail</dt>
          <dd className="break-all text-muted">{therapist.email}</dd>
          <dt className="sr-only">Vínculo desde</dt>
          <dd className="text-sm text-muted">Acompanha seus registros desde {formatDate(createdAt)}</dd>
        </dl>
        <p className="text-sm text-muted">O acesso é só de leitura: registros e consultas, sem alterar nada.</p>
        <div>
          <Button variant="secondary" onClick={onRevoke}>
            Desfazer vínculo
          </Button>
        </div>
      </div>
    );
  }

  if (status.invite) return <PendingInvite email={status.invite.therapistEmail} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        Quer compartilhar seus registros com quem acompanha sua terapia? O acesso é só de leitura, sem alterar nada. Você pode desfazer o
        vínculo quando quiser.
      </p>

      {generated ? (
        <GeneratedCodeCard code={generated.code} expiresAt={generated.expiresAt} />
      ) : (
        status.code && (
          <Alert>
            Você gerou um código que vale até {formatDateTime(status.code.expiresAt)}. Por segurança, ele só aparece na
            hora em que é criado: se não anotou, gere outro (o anterior deixa de valer).
          </Alert>
        )
      )}

      {generateError && <Alert tone="attention">{generateError}</Alert>}

      <div className="grid grid-cols-1 gap-3 sm:flex">
        <Button disabled={generating} onClick={onGenerate}>
          {generating ? 'Gerando…' : generated || status.code ? 'Gerar outro código' : 'Gerar código'}
        </Button>
        <Button variant="secondary" onClick={onInvite}>
          Convidar por e-mail
        </Button>
      </div>
    </div>
  );
}

function PendingInvite({ email }: { email: string }) {
  const cancel = useCancelInvite();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <p>
        Convite enviado para <strong className="break-all">{email}</strong>. Quando o convite for aceito, você recebe um aviso.
      </p>
      <p className="text-sm text-muted">Enquanto o convite estiver pendente, não dá para gerar código nem outro convite.</p>
      {cancel.isError && <Alert tone="attention">{getApiError(cancel.error).message}</Alert>}
      <div>
        <Button variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          {cancel.isPending ? 'Cancelando…' : 'Cancelar convite'}
        </Button>
      </div>
    </div>
  );
}

// O código só existe em texto nesta resposta (DEC-031): a tela avisa para anotar ou enviar agora.
function GeneratedCodeCard({ code, expiresAt }: { code: string; expiresAt: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const shareText = `Meu código de vínculo no Faísca: ${code} (vale até ${formatDateTime(expiresAt)}).`;
  // O menu de compartilhar só existe em alguns navegadores (principalmente no celular).
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  async function share() {
    try {
      await navigator.share({ text: shareText });
    } catch {
      // Fechar o menu sem escolher nada também cai aqui: não é erro para mostrar.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-primary bg-surface p-4 shadow-soft">
      <p className="text-sm text-muted">Passe este código para quem acompanha sua terapia:</p>
      <p aria-label={`Código ${code.split('').join(' ')}`} className="font-mono text-4xl font-bold tracking-widest">
        {code}
      </p>
      <p className="text-sm text-muted">
        Vale até {formatDateTime(expiresAt)} e uma vez só. Ele não aparece de novo depois que você sair desta tela.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <Button variant="secondary" onClick={copy}>
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
        {canShare && (
          <Button variant="secondary" onClick={share}>
            Compartilhar
          </Button>
        )}
      </div>
      {copyFailed && <p className="text-sm text-accent-text">Não deu para copiar. Anote o código acima.</p>}
    </div>
  );
}
