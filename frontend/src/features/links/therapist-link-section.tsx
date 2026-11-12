import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { getApiError } from '../auth/auth-api';
import { formatDate, formatDateTime } from './link-format';
import { SHARED_AREAS, type GeneratedCode, type LinkStatus, type PatientLink, type SharedArea } from './links-api';
import { InviteDialog, RevokeLinkDialog } from './link-dialogs';
import { AREA_LABEL, firstName, KIND_LABEL } from './professional-labels';
import { useCancelInvite, useGenerateLinkCode, useLinkStatus, useSetSharedAreas } from './use-links';
import { Avatar } from '../profile/avatar';
import { avatarUrls } from '../profile/profile-api';

// "Quem me acompanha" em /conta (SPEC, "Vínculo"; DEC-097, DEC-098): um cartão por profissional
// vinculada, com o que cada uma pode ver, e o caminho para vincular mais uma enquanto houver vaga
// (uma psicóloga e uma psiquiatra). A tela segue a situação que a API devolve.
const MAX_LINKS = 2;

export function TherapistLinkSection() {
  const status = useLinkStatus();
  const generate = useGenerateLinkCode();
  const [dialog, setDialog] = useState<{ kind: 'invite' } | { kind: 'revoke'; link: PatientLink } | null>(null);
  // Quantas profissionais havia quando o código foi gerado: quando ele vira vínculo, a lista cresce
  // e o código (já usado) sai da tela.
  const [linksWhenGenerated, setLinksWhenGenerated] = useState<number | null>(null);
  // O vínculo cujo "Salvar" acabou de dar certo: o formulário renasce com o que veio do servidor, e
  // a confirmação fica aqui para não sumir junto.
  const [savedLinkId, setSavedLinkId] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const links = status.data?.links ?? [];

  return (
    <section aria-labelledby="therapist-link-title" className="flex flex-col gap-4">
      <h2 id="therapist-link-title" ref={titleRef} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        Quem me acompanha
      </h2>

      {status.isPending && <p className="text-muted">Carregando…</p>}
      {status.isError && <Alert tone="attention">{getApiError(status.error).message}</Alert>}

      {links.map((link) => (
        <ProfessionalCard
          key={link.id}
          link={link}
          saved={savedLinkId === link.id}
          onSaved={() => setSavedLinkId(link.id)}
          onEdit={() => setSavedLinkId(null)}
          onRevoke={() => setDialog({ kind: 'revoke', link })}
        />
      ))}

      {status.data && links.length < MAX_LINKS && (
        <LinkStarter
          status={status.data}
          generated={linksWhenGenerated === links.length ? (generate.data ?? null) : null}
          generating={generate.isPending}
          generateError={generate.error ? getApiError(generate.error).message : null}
          onGenerate={() => generate.mutate(undefined, { onSuccess: () => setLinksWhenGenerated(links.length) })}
          onInvite={() => setDialog({ kind: 'invite' })}
        />
      )}

      {dialog?.kind === 'invite' && (
        <InviteDialog
          onClose={() => setDialog(null)}
          // Um convite apaga o código que estava valendo (DEC-031): some da tela também.
          onSent={() => generate.reset()}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeLinkDialog
          linkId={dialog.link.id}
          therapistName={dialog.link.therapist.name}
          onClose={() => setDialog(null)}
          // O cartão do botão some com o vínculo: o foco vai para o título da seção.
          onRevoked={() => requestAnimationFrame(() => titleRef.current?.focus())}
        />
      )}
    </section>
  );
}

// Uma profissional vinculada: quem é e o que ela pode ver. A foto e o tipo ajudam a conferir que é
// a pessoa certa antes de liberar alguma área (o tipo é declarado por ela, DEC-097).
type ProfessionalCardProps = {
  link: PatientLink;
  saved: boolean;
  onSaved: () => void;
  onEdit: () => void;
  onRevoke: () => void;
};

function ProfessionalCard({ link, saved, onSaved, onEdit, onRevoke }: ProfessionalCardProps) {
  const { therapist, createdAt, kind } = link;
  const titleId = useId();
  // Para o leitor de tela: há sempre uma de cada tipo, então nome e tipo juntos não se repetem.
  const who = `${firstName(therapist.name)}, ${KIND_LABEL[kind].toLowerCase()}`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft"
    >
      <div className="flex items-center gap-4">
        <Avatar
          name={therapist.name}
          src={therapist.avatarVersion ? avatarUrls.linked(link.id, therapist.avatarVersion) : null}
          size="md"
        />
        <dl className="flex min-w-0 flex-col gap-1">
          <dt className="sr-only">Nome</dt>
          <dd id={titleId} className="text-lg font-semibold break-words">
            {therapist.name}
          </dd>
          <dt className="sr-only">Profissão</dt>
          <dd className="text-sm font-medium">
            {KIND_LABEL[kind]}
            {therapist.councilNumber && <span className="text-muted"> · {therapist.councilNumber}</span>}
          </dd>
          <dt className="sr-only">E-mail</dt>
          <dd className="break-all text-muted">{therapist.email}</dd>
          <dt className="sr-only">Vínculo desde</dt>
          <dd className="text-sm text-muted">Acompanha você desde {formatDate(createdAt)}</dd>
        </dl>
      </div>
      {/* O tipo e o conselho não são conferidos pelo Faísca (DEC-097). */}
      <p className="text-sm text-muted">O tipo e o conselho são informados pela própria profissional.</p>

      {/* Renasce quando o que está gravado muda (outra aba ou aparelho): um "Salvar" de uma tela antiga
          não reabre uma área fechada em outro lugar (achado do revisor-seguranca). */}
      <SharedAreasForm
        key={link.sharedAreas.join(',')}
        link={link}
        who={who}
        saved={saved}
        onSaved={onSaved}
        onEdit={onEdit}
      />

      <div>
        <Button variant="secondary" className="break-words" onClick={onRevoke}>
          Desfazer o vínculo com {firstName(therapist.name)}
          <span className="sr-only"> ({KIND_LABEL[kind].toLowerCase()})</span>
        </Button>
      </div>
    </article>
  );
}

// "O que [nome] pode ver" (DEC-098): uma caixa por área. As fotos da Ação só aparecem com a Ação
// marcada, e desmarcar a Ação leva as fotos junto. Só "Salvar" grava; até lá, a tela diz que não
// está salvo, e um erro volta as caixas ao que está gravado.
type SharedAreasFormProps = {
  link: PatientLink;
  who: string;
  saved: boolean;
  onSaved: () => void;
  onEdit: () => void;
};

function SharedAreasForm({ link, who, saved, onSaved, onEdit }: SharedAreasFormProps) {
  const save = useSetSharedAreas();
  const [areas, setAreas] = useState<SharedArea[]>(link.sharedAreas);
  const name = firstName(link.therapist.name);
  const hintId = useId();
  const dirty = areas.length !== link.sharedAreas.length || areas.some((area) => !link.sharedAreas.includes(area));

  function toggle(area: SharedArea, checked: boolean) {
    onEdit();
    save.reset();
    setAreas((current) => {
      const next = checked ? [...current, area] : current.filter((item) => item !== area);
      // Sem a Ação, as fotos dela também saem.
      return area === 'ACTIONS' && !checked ? next.filter((item) => item !== 'ACTION_PHOTOS') : next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ordered = SHARED_AREAS.filter((area) => areas.includes(area));
    save.mutate({ linkId: link.id, areas: ordered }, { onSuccess: onSaved, onError: () => setAreas(link.sharedAreas) });
  }

  const visible = SHARED_AREAS.filter((area) => area !== 'ACTION_PHOTOS' || areas.includes('ACTIONS'));
  const nothingShared = link.sharedAreas.length === 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <fieldset aria-describedby={nothingShared ? hintId : undefined} className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">
          O que {name} pode ver<span className="sr-only"> ({who})</span>
        </legend>
        {nothingShared && (
          <p id={hintId} className="text-sm text-muted">
            {name} ainda não vê nenhum registro seu. Marque o que quiser compartilhar.
          </p>
        )}
        <ul className="grid gap-1 sm:grid-cols-2">
          {visible.map((area) => (
            <li key={area}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={areas.includes(area)}
                  onChange={(e) => toggle(area, e.target.checked)}
                />
                <span>{AREA_LABEL[area]}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {save.isError && <Alert tone="attention">{getApiError(save.error).message}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : `Salvar o que ${name} vê`}
          <span className="sr-only"> ({who})</span>
        </Button>
        <p role="status" className="text-sm text-muted">
          {dirty ? 'Ainda não salvo.' : saved ? 'Salvo. Já vale.' : 'Vale assim que você salvar.'}
        </p>
      </div>
    </form>
  );
}

type LinkStarterProps = {
  status: LinkStatus;
  generated: GeneratedCode | null;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
  onInvite: () => void;
};

// Código ou convite para vincular uma profissional (a primeira ou a segunda).
function LinkStarter({ status, generated, generating, generateError, onGenerate, onInvite }: LinkStarterProps) {
  if (status.invite) return <PendingInvite email={status.invite.therapistEmail} />;
  const first = status.links.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {first ? (
        <p className="text-muted">
          Quer compartilhar seus registros com quem acompanha sua terapia? O acesso é só de leitura, sem alterar nada, e
          você escolhe o que cada profissional vê. Você pode desfazer o vínculo quando quiser.
        </p>
      ) : (
        <>
          <h3 className="text-lg font-semibold">Vincular outra profissional</h3>
          <p className="text-muted">
            Você pode ter uma psicóloga e uma psiquiatra. A nova profissional começa sem ver nada, e você escolhe o que
            compartilhar.
          </p>
        </>
      )}

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
        Convite enviado para <strong className="break-all">{email}</strong>. Quando o convite for aceito, você recebe um
        aviso.
      </p>
      <p className="text-sm text-muted">
        Enquanto o convite estiver pendente, não dá para gerar código nem outro convite.
      </p>
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
