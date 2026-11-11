import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { useAccessibility } from '../profile/use-profile';
import { getApiError } from './auth-api';
import { sendLoginEmailCode, type CodeVia, type TwoFactorLoginStep } from './two-factor-api';
import { CodeField, LinkButton } from './two-factor-fields';
import { splitTwoFactorError } from './two-factor-helpers';
import { useVerifyTwoFactorLogin } from './use-two-factor';

// Passo do login entre a senha e a sessão (DEC-092): "Confirme que é você", com o último jeito usado
// e "Usar outro jeito". O e-mail aparece escondido em parte: quem chegou aqui só mostrou que sabe a
// senha.

const SUPPORT_EMAIL = 'suporte@minhafaisca.com.br';

const OTHER_LABELS: Record<CodeVia, string> = {
  EMAIL: 'Código por e-mail',
  TOTP: 'App autenticador',
  RECOVERY: 'Código de recuperação',
};

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

export function TwoFactorLogin({
  step,
  onDone,
  onRestart,
}: {
  step: TwoFactorLoginStep;
  onDone: () => void;
  // Volta para o e-mail e a senha, com um aviso quando o passo venceu.
  onRestart: (message?: string) => void;
}) {
  const { directLanguage } = useAccessibility();
  const [via, setVia] = useState<CodeVia>(step.preferred);
  const [otp, setOtp] = useState('');
  const [emptyError, setEmptyError] = useState<string>();
  const [showOthers, setShowOthers] = useState(false);
  const [sentStatus, setSentStatus] = useState('');
  const verify = useVerifyTwoFactorLogin();
  const send = useMutation({ mutationFn: sendLoginEmailCode, gcTime: 0 });
  const sentOnce = useRef(false);
  const codeRef = useRef<HTMLDivElement>(null);

  const errors = splitTwoFactorError(verify.error ? getApiError(verify.error) : null);
  const sendError = send.error ? getApiError(send.error) : null;

  function sendEmail(resend: boolean) {
    send.mutate(undefined, {
      onSuccess: () => setSentStatus(resend ? 'Código reenviado.' : ''),
      onError: (error) => {
        const apiError = getApiError(error);
        if (apiError.code === 'TWO_FACTOR_EXPIRED') onRestart(apiError.message);
      },
    });
  }

  // O formulário da senha saiu da tela: o foco vai para o campo do código (no celular, o teclado abre).
  useEffect(() => {
    codeRef.current?.querySelector('input')?.focus();
  }, []);

  // Com o e-mail como jeito preferido, o código sai assim que o passo abre (uma vez só).
  useEffect(() => {
    if (step.preferred !== 'EMAIL' || sentOnce.current) return;
    sentOnce.current = true;
    send.mutate(undefined);
  }, [step.preferred, send]);

  function choose(next: CodeVia) {
    setVia(next);
    setOtp('');
    setEmptyError(undefined);
    setShowOthers(false);
    setSentStatus('');
    verify.reset();
    send.reset();
    if (next === 'EMAIL') sendEmail(false);
    // O botão clicado some: o foco vai para o campo do código.
    requestAnimationFrame(() => codeRef.current?.querySelector('input')?.focus());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otp.trim()) {
      setEmptyError('Digite o código.');
      return;
    }
    setEmptyError(undefined);
    verify.mutate(
      { via, otp: otp.trim() },
      {
        onSuccess: onDone,
        onError: (error) => {
          const apiError = getApiError(error);
          if (apiError.code === 'TWO_FACTOR_EXPIRED') onRestart(apiError.message);
        },
      },
    );
  }

  const instructions =
    via === 'EMAIL'
      ? directLanguage
        ? `Digite o código de 6 números enviado para o seu e-mail (${step.emailHint}).`
        : `Enviamos um código de 6 números para ${step.emailHint}.`
      : via === 'TOTP'
        ? 'Digite o código que aparece no seu app autenticador.'
        : 'Digite um dos seus códigos de recuperação.';

  const others = (['EMAIL', 'TOTP', 'RECOVERY'] as const).filter(
    (option) => option !== via && (option === 'RECOVERY' || step.methods.includes(option)),
  );

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {errors.top && <Alert tone="attention">{errors.top}</Alert>}
        {sendError && sendError.code !== 'TWO_FACTOR_EXPIRED' && <Alert tone="attention">{sendError.message}</Alert>}
        <p>{instructions}</p>
        <div ref={codeRef}>
          <CodeField
            via={via}
            value={otp}
            onChange={(value) => {
              setOtp(value);
              verify.reset();
            }}
            error={emptyError ?? errors.code}
          />
        </div>
        {via === 'EMAIL' && (
          <div className="flex flex-col gap-1">
            <LinkButton disabled={send.isPending} onClick={() => sendEmail(true)}>
              Não chegou? Reenviar código
            </LinkButton>
            <p role="status" className="text-sm text-muted">
              {sentStatus}
            </p>
          </div>
        )}
        <Button type="submit" disabled={verify.isPending}>
          {verify.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>

      <div className="flex flex-col gap-3 text-sm">
        <LinkButton
          aria-expanded={showOthers}
          aria-controls="two-factor-others"
          onClick={() => setShowOthers((open) => !open)}
        >
          Usar outro jeito
        </LinkButton>
        {showOthers && (
          <ul id="two-factor-others" className="flex flex-col gap-2">
            {others.map((option) => (
              <li key={option}>
                <Button variant="secondary" className="w-full sm:w-auto" onClick={() => choose(option)}>
                  {OTHER_LABELS[option]}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer content-center font-medium text-primary-text">
            Não consigo entrar
          </summary>
          <div className="mt-1 flex flex-col gap-2 text-muted">
            <p>
              Use um dos seus <strong className="font-medium text-text">códigos de recuperação</strong>, em “Usar outro
              jeito”. Se ligou os dois jeitos, tente o outro.
            </p>
            <p>
              Se perdeu tudo, fale com quem cuida do Faísca:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        </details>
        <LinkButton onClick={() => onRestart()}>Voltar</LinkButton>
      </div>
    </div>
  );
}
