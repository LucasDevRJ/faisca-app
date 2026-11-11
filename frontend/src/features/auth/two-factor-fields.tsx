import { useState, type ButtonHTMLAttributes } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { TextField } from '../../components/ui/text-field';
import { getApiError } from './auth-api';
import type { CodeVia, TwoFactorStatus } from './two-factor-api';
import { enabledVias } from './two-factor-helpers';
import { useSendActionEmailCode } from './use-two-factor';

// Peças comuns das telas da verificação em duas etapas (DEC-092), em Conta e no login.

// Código de 6 números (e-mail ou app) ou de recuperação (8 letras e números, com ou sem traço).
export function CodeField({
  via,
  value,
  onChange,
  error,
  label = 'Código',
}: {
  via: CodeVia;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
}) {
  const recovery = via === 'RECOVERY';
  return (
    <TextField
      label={label}
      hint={recovery ? 'Um dos códigos de recuperação, como ABCD-2345.' : '6 números.'}
      // O celular sugere o código que chegou por SMS ou e-mail, e abre o teclado certo.
      autoComplete="one-time-code"
      inputMode={recovery ? 'text' : 'numeric'}
      autoCapitalize={recovery ? 'characters' : undefined}
      spellCheck={false}
      maxLength={20}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
    />
  );
}

const VIA_LABELS: Record<CodeVia, string> = {
  EMAIL: 'Código por e-mail',
  TOTP: 'App autenticador',
  RECOVERY: 'Código de recuperação',
};

// Prova de que é a dona da conta, com um jeito já ligado: escolhe o jeito e digita o código. Com o
// e-mail, o código só sai quando a pessoa pede.
export function ProofFields({
  status,
  via,
  onViaChange,
  otp,
  onOtpChange,
  codeError,
}: {
  status: TwoFactorStatus;
  via: CodeVia;
  onViaChange: (via: CodeVia) => void;
  otp: string;
  onOtpChange: (otp: string) => void;
  codeError?: string;
}) {
  const send = useSendActionEmailCode();
  const [sentTo, setSentTo] = useState('');
  const vias = enabledVias(status);

  return (
    <>
      {vias.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-medium">Como você quer confirmar?</legend>
          {vias.map((option) => (
            <label key={option} className={`flex min-h-11 items-center gap-3 px-3 ${choiceCardClasses}`}>
              <input
                type="radio"
                name="two-factor-via"
                value={option}
                checked={via === option}
                onChange={() => {
                  onViaChange(option);
                  onOtpChange('');
                }}
              />
              {VIA_LABELS[option]}
            </label>
          ))}
        </fieldset>
      )}
      {via === 'EMAIL' && (
        <div className="flex flex-col gap-2">
          <div>
            <Button
              variant="secondary"
              disabled={send.isPending}
              onClick={() => send.mutate(undefined, { onSuccess: ({ emailHint }) => setSentTo(emailHint) })}
            >
              {sentTo ? 'Reenviar código' : 'Enviar código por e-mail'}
            </Button>
          </div>
          <p role="status" className="text-sm text-muted">
            {sentTo ? `Enviamos um código de 6 números para ${sentTo}.` : ''}
          </p>
          {send.error && <Alert tone="attention">{getApiError(send.error).message}</Alert>}
        </div>
      )}
      <CodeField via={via} value={otp} onChange={onOtpChange} error={codeError} />
    </>
  );
}

// Os códigos de recuperação, mostrados uma vez só: copiar, baixar e "Já guardei".
export function RecoveryCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState('');
  const text = codes.join('\n');

  function copy() {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied('Códigos copiados.'))
      .catch(() => setCopied('Não deu para copiar. Selecione os códigos e copie à mão.'));
  }

  // Arquivo de texto gerado no próprio aparelho: os códigos não passam por nenhum servidor.
  function download() {
    const url = URL.createObjectURL(
      new Blob([`Códigos de recuperação do Faísca\nCada um vale uma vez só.\n\n${text}\n`], { type: 'text/plain' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'faisca-codigos-de-recuperacao.txt';
    // No documento e com a URL viva por um instante: alguns Safari ignoram o clique sem isso.
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-col gap-4">
      <p>
        Se um dia você perder o celular ou o acesso ao e-mail, use um destes códigos para entrar. Cada um vale uma vez
        só.
      </p>
      <ul
        aria-label="Códigos de recuperação"
        className="grid grid-cols-2 gap-2 rounded-md border border-border bg-bg p-4 font-mono text-lg tracking-wider"
      >
        {codes.map((code) => (
          <li key={code} className="text-center">
            {code}
          </li>
        ))}
      </ul>
      <p className="text-muted">
        Guarde num lugar seguro, como um gerenciador de senhas ou um papel guardado em casa. Eles não aparecem de novo.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={copy}>
          Copiar
        </Button>
        <Button variant="secondary" onClick={download}>
          Baixar
        </Button>
      </div>
      <p role="status" className="text-sm text-muted">
        {copied}
      </p>
      <div>
        <Button onClick={onDone}>Já guardei</Button>
      </div>
    </div>
  );
}

// Ação secundária com cara de link ("Usar outro jeito", "Reenviar código"), alinhada ao texto.
export function LinkButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-11 self-start text-left font-medium text-primary-text underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
