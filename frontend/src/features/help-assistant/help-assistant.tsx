import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { TextAreaField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { useSession } from '../auth/use-session';
import { askHelp, HELP_ASSISTANT_ENABLED } from './help-assistant-api';

export function HelpAssistant() {
  const { data: user } = useSession();
  if (!HELP_ASSISTANT_ENABLED || !user) return null;
  return <HelpAssistantForm key={user.id} />;
}

function HelpAssistantForm() {
  const [question, setQuestion] = useState('');
  const [accepted, setAccepted] = useState(false);
  const mutation = useMutation({ mutationFn: askHelp, retry: false, gcTime: 0 });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accepted || mutation.isPending || question.trim().length < 3 || question.trim().length > 500) return;
    mutation.reset();
    try {
      await mutation.mutateAsync(question.trim());
    } catch {
      // A mensagem aparece na própria seção. O texto fica fora dos logs.
    } finally {
      setAccepted(false);
    }
  }

  return (
    <section aria-labelledby="help-assistant-title" className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-soft sm:p-7">
      <h2 id="help-assistant-title" className="text-xl font-semibold">Tire uma dúvida sobre o Faísca</h2>
      <p className="mt-2 text-muted">A IA encontra orientações deste guia para sua pergunta. Confira as fontes indicadas. Para conversar sobre seu tratamento, procure sua profissional.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4" aria-busy={mutation.isPending}>
        <TextAreaField label="Sua dúvida sobre o aplicativo" hint="Por exemplo, como ligar dois registros? Evite nomes, contatos e relatos pessoais." limit={500} value={question} onChange={(event) => { setQuestion(event.target.value); setAccepted(false); mutation.reset(); }} disabled={mutation.isPending} rows={3} />
        <p className="text-sm text-muted">Ao enviar, somente sua pergunta e trechos do guia são processados pela OpenAI. O Faísca guarda a contagem de uso e o aceite. O tratamento pelo provedor é explicado no <a href="/privacidade#ajuda-ia" target="_blank" rel="noreferrer" className="text-primary-text underline">aviso de privacidade (abre em outra aba)</a>.</p>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={mutation.isPending || question.trim().length < 3 || question.trim().length > 500} className="size-5 shrink-0 accent-primary" />
          <span>Li o aviso e autorizo enviar esta pergunta à OpenAI.</span>
        </label>
        <Button type="submit" disabled={!accepted || mutation.isPending || question.trim().length < 3 || question.trim().length > 500}>Enviar pergunta</Button>
        {mutation.isError && <p role="alert" className="break-words text-muted">{getApiError(mutation.error).message}</p>}
      </form>
      <p role="status" className="mt-3 text-sm text-muted">{mutation.isPending ? 'Consultando o guia…' : mutation.isSuccess ? 'Resposta disponível abaixo. Confira as fontes.' : 'Até 10 perguntas por dia. Tentativas com falha também contam.'}</p>
      {mutation.data && <div className="mt-5 min-w-0 border-t border-border pt-4">
        <h3 className="font-semibold">Orientações do guia encontradas com IA</h3>
        <p className="mt-2 whitespace-pre-wrap break-words">{mutation.data.answer}</p>
        {mutation.data.sources.length > 0 && <nav aria-label="Fontes da resposta" className="mt-3 flex flex-col items-start gap-1">
          {mutation.data.sources.map((source) => <Link key={source.href} to={source.href} className="inline-flex min-h-11 items-center text-primary-text underline">{source.title}</Link>)}
        </nav>}
        <Button type="button" variant="ghost" onClick={() => { mutation.reset(); setQuestion(''); setAccepted(false); }}>Limpar pergunta e resposta</Button>
      </div>}
    </section>
  );
}
