import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter, DialogForm } from '../../components/ui/dialog';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { PasswordField } from '../../components/ui/text-field';
import { useAccessibility } from '../profile/use-profile';
import { getApiError } from './auth-api';
import type { CodeVia, TwoFactorMethod, TwoFactorStatus } from './two-factor-api';
import { CodeField, LinkButton, ProofFields, RecoveryCodesView } from './two-factor-fields';
import { enabledVias, splitTwoFactorError } from './two-factor-helpers';
import {
  useConfirmTwoFactorSetup,
  useDisableTwoFactor,
  useRegenerateRecoveryCodes,
  useStartTwoFactorSetup,
  useTwoFactorStatus,
} from './use-two-factor';

// Verificação em duas etapas em Conta → Segurança (DEC-092): ligar, adicionar o outro jeito, gerar
// códigos de recuperação novos e desligar. Tudo pede a senha; com um jeito ligado, também um código.

const FEW_CODES = 3;
const METHOD_NAMES: Record<TwoFactorMethod, string> = {
  EMAIL: 'código por e-mail',
  TOTP: 'app autenticador',
};

type OpenDialog = 'setup' | 'codes' | 'disable' | null;

export function TwoFactorCard() {
  const { directLanguage } = useAccessibility();
  const { data: status, error } = useTwoFactorStatus();
  const [open, setOpen] = useState<OpenDialog>(null);
  const [message, setMessage] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitle = useRef(false);

  // Ao fechar uma janela, o foco volta ao título do cartão: o botão que a abriu pode ter sumido. O
  // foco vai depois que a janela sai da tela; antes disso, o navegador o devolveria ao botão.
  function close(done?: string) {
    focusTitle.current = true;
    setOpen(null);
    if (done) setMessage(done);
  }

  useEffect(() => {
    if (open !== null || !focusTitle.current) return;
    focusTitle.current = false;
    titleRef.current?.focus();
  }, [open]);

  const enabled = status ? status.emailEnabled || status.totpEnabled : false;
  const methods = status
    ? (['EMAIL', 'TOTP'] as const).filter((method) => (method === 'EMAIL' ? status.emailEnabled : status.totpEnabled))
    : [];

  return (
    <div
      role="group"
      aria-labelledby="two-factor-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
    >
      <h3 id="two-factor-title" ref={titleRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
        Verificação em duas etapas
      </h3>
      <p className="text-muted">
        {directLanguage
          ? 'Ao entrar na conta, o Faísca pede a senha e um código. Sem o código, ninguém entra, mesmo com a senha.'
          : 'Além da senha, o Faísca pede um código quando alguém entra na sua conta. Assim, mesmo que a senha vaze, ninguém entra sem o código.'}
      </p>
      {error && <Alert tone="attention">{getApiError(error).message}</Alert>}
      {status && !status.available && (
        <Alert tone="attention">A verificação em duas etapas está indisponível agora. Tente de novo mais tarde.</Alert>
      )}
      {status && (
        <>
          <p className="font-medium">
            {enabled ? `Ligada: ${methods.map((method) => METHOD_NAMES[method]).join(' · ')}` : 'Desligada'}
          </p>
          {enabled && (
            <p className="text-muted">
              Restam {status.recoveryCodesLeft} de 10 códigos de recuperação.
              {status.recoveryCodesLeft <= FEW_CODES && ' Restam poucos códigos. Gere novos para não ficar sem.'}
            </p>
          )}
          {status.available && (
            <div className="flex flex-wrap gap-3">
              {!enabled && <Button onClick={() => setOpen('setup')}>Ativar</Button>}
              {enabled && methods.length < 2 && (
                <Button variant="secondary" onClick={() => setOpen('setup')}>
                  Adicionar outro jeito
                </Button>
              )}
              {enabled && (
                <>
                  <Button variant="secondary" onClick={() => setOpen('codes')}>
                    Códigos de recuperação
                  </Button>
                  <Button variant="secondary" onClick={() => setOpen('disable')}>
                    Desligar
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
      <p role="status" className="text-sm text-muted">
        {message}
      </p>
      {status && open === 'setup' && <SetupDialog status={status} onClose={close} />}
      {status && open === 'codes' && <RegenerateDialog status={status} onClose={close} />}
      {status && open === 'disable' && <DisableDialog status={status} onClose={close} />}
    </div>
  );
}

// Ao trocar de passo, o foco vai para o começo do passo novo: o botão clicado sumiu.
// O foco vai para o título da janela, que muda a cada passo: o leitor de tela diz onde a pessoa está.
function Step({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const title = ref.current?.closest('dialog')?.querySelector('h2');
    if (title) {
      title.tabIndex = -1;
      title.focus();
    } else ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-5 focus:outline-none">
      {children}
    </div>
  );
}

type SetupStep = 'password' | 'choose' | 'email' | 'totp' | 'codes' | 'done';

// "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP", mais fácil de digitar no app.
function groupKey(secret: string) {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

// Configuração guiada, um passo por vez. No primeiro jeito: senha → escolher → código → códigos de
// recuperação → pronto. No segundo: senha e um código do jeito ligado → código do novo → pronto.
function SetupDialog({ status, onClose }: { status: TwoFactorStatus; onClose: (done?: string) => void }) {
  const { directLanguage } = useAccessibility();
  // Fixo ao abrir: depois de confirmar, o estado recarrega com o jeito novo já ligado.
  const [adding] = useState(status.emailEnabled || status.totpEnabled);
  const [step, setStep] = useState<SetupStep>('password');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<TwoFactorMethod>(adding ? (status.emailEnabled ? 'TOTP' : 'EMAIL') : 'EMAIL');
  const [via, setVia] = useState<CodeVia>(enabledVias(status)[0] ?? 'RECOVERY');
  const [proofOtp, setProofOtp] = useState('');
  const [otp, setOtp] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [totp, setTotp] = useState<{ secret: string; qr: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [localError, setLocalError] = useState<{
    password?: string;
    code?: string;
  }>({});
  const [keyCopied, setKeyCopied] = useState('');
  const [resent, setResent] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const start = useStartTwoFactorSetup();
  const confirm = useConfirmTwoFactorSetup();

  const startErrors = splitTwoFactorError(start.error ? getApiError(start.error) : null);
  const confirmErrors = splitTwoFactorError(confirm.error ? getApiError(confirm.error) : null);
  const title = adding ? 'Adicionar outro jeito de confirmar' : 'Ativar a verificação em duas etapas';

  function begin(chosen: TwoFactorMethod, onSent?: () => void) {
    confirm.reset();
    setResent(false);
    setQrError(null);
    start.mutate(
      {
        password,
        method: chosen,
        proof: adding ? { via, otp: proofOtp.trim() } : undefined,
      },
      {
        onSuccess: (result) => {
          setOtp('');
          if (result.method === 'EMAIL') {
            setEmailHint(result.emailHint);
            setStep('email');
            onSent?.();
            return;
          }
          // O QR é desenhado no próprio aparelho: o segredo não vai para nenhum outro serviço.
          void QRCode.toDataURL(result.uri, {
            margin: 2,
            width: 208,
            errorCorrectionLevel: 'M',
          })
            .then((qr) => {
              setTotp({ secret: result.secret, qr });
              setStep('totp');
            })
            .catch(() => setQrError('Não deu para mostrar o código do app. Tente de novo.'));
        },
        // Senha errada no passo de escolher: volta para o passo da senha, com o erro no campo.
        onError: (error) => {
          if (getApiError(error).code === 'INVALID_PASSWORD') setStep('password');
        },
      },
    );
  }

  function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = {
      password: password ? undefined : 'Digite sua senha para confirmar.',
      code: adding && !proofOtp.trim() ? 'Digite o código.' : undefined,
    };
    setLocalError(errors);
    if (errors.password || errors.code) return;
    if (adding) begin(method);
    else {
      start.reset();
      setStep('choose');
    }
  }

  function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otp.trim()) {
      setLocalError({ code: 'Digite o código.' });
      return;
    }
    setLocalError({});
    confirm.mutate(
      { method, otp: otp.trim() },
      {
        onSuccess: (codes) => {
          if (codes) {
            setRecoveryCodes(codes);
            setStep('codes');
          } else setStep('done');
        },
      },
    );
  }

  function copyKey() {
    if (!totp) return;
    navigator.clipboard
      .writeText(totp.secret)
      .then(() => setKeyCopied('Chave copiada.'))
      .catch(() => setKeyCopied('Não deu para copiar. Digite a chave à mão.'));
  }

  const cancel = (
    <Button variant="secondary" onClick={() => onClose()}>
      Cancelar
    </Button>
  );

  if (step === 'password') {
    return (
      <Dialog
        title={title}
        description={
          adding
            ? 'Confirme a sua senha e um código do jeito que já está ligado.'
            : 'Para começar, confirme a sua senha.'
        }
        onClose={() => onClose()}
      >
        <DialogForm onSubmit={handlePassword} error={qrError ?? startErrors.top}>
          <PasswordField
            label="Sua senha"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              start.reset();
            }}
            error={localError.password ?? startErrors.password}
          />
          {adding && (
            <ProofFields
              status={status}
              via={via}
              onViaChange={setVia}
              otp={proofOtp}
              onOtpChange={(value) => {
                setProofOtp(value);
                start.reset();
              }}
              codeError={localError.code ?? startErrors.code}
            />
          )}
          <DialogFooter>
            {cancel}
            <Button type="submit" disabled={start.isPending}>
              {start.isPending ? 'Confirmando…' : 'Continuar'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </Dialog>
    );
  }

  if (step === 'choose') {
    return (
      <Dialog title="Como você quer receber o código?" onClose={() => onClose()}>
        <DialogForm
          onSubmit={(event) => {
            event.preventDefault();
            begin(method);
          }}
          error={qrError ?? startErrors.top}
        >
          <Step key={step}>
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Como você quer receber o código?</legend>
              <label className={`flex items-start gap-3 p-3 ${choiceCardClasses}`}>
                <input
                  type="radio"
                  name="two-factor-method"
                  value="EMAIL"
                  checked={method === 'EMAIL'}
                  onChange={() => setMethod('EMAIL')}
                  aria-describedby="method-email-hint"
                  className="mt-1"
                />
                <span className="flex flex-col">
                  <span className="font-medium">Por e-mail (recomendado para começar)</span>
                  <span id="method-email-hint" className="text-sm text-muted">
                    Enviamos um código para o seu e-mail quando você entrar.
                  </span>
                </span>
              </label>
              <label className={`flex items-start gap-3 p-3 ${choiceCardClasses}`}>
                <input
                  type="radio"
                  name="two-factor-method"
                  value="TOTP"
                  checked={method === 'TOTP'}
                  onChange={() => setMethod('TOTP')}
                  aria-describedby="method-totp-hint"
                  className="mt-1"
                />
                <span className="flex flex-col">
                  <span className="font-medium">Por um app autenticador</span>
                  <span id="method-totp-hint" className="text-sm text-muted">
                    O código aparece num app do celular, como Google Authenticator, Microsoft Authenticator ou
                    Bitwarden. Funciona até sem internet.
                  </span>
                </span>
              </label>
            </fieldset>
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer content-center font-medium text-primary-text">
                Precisa de ajuda?
              </summary>
              <p className="mt-1 text-muted">
                <strong className="font-medium text-text">O que é um app autenticador?</strong> É um app que mostra um
                código novo a cada 30 segundos. Os mais usados são Google Authenticator e Microsoft Authenticator, e o
                Bitwarden também tem. Se preferir não instalar nada, escolha “Por e-mail”.
              </p>
            </details>
          </Step>
          <DialogFooter>
            {cancel}
            <Button type="submit" disabled={start.isPending}>
              {start.isPending ? 'Preparando…' : 'Continuar'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </Dialog>
    );
  }

  if (step === 'email' || step === 'totp') {
    return (
      <Dialog title={title} onClose={() => onClose()}>
        <DialogForm onSubmit={handleCode} error={confirmErrors.top ?? startErrors.top}>
          <Step key={step}>
            {step === 'email' ? (
              <>
                <p>
                  {directLanguage
                    ? `Digite o código de 6 números enviado para o seu e-mail (${emailHint}).`
                    : `Enviamos um código de 6 números para ${emailHint}. Digite aqui para confirmar que chegou.`}
                </p>
                <CodeField
                  via="EMAIL"
                  value={otp}
                  onChange={(value) => {
                    setOtp(value);
                    confirm.reset();
                  }}
                  error={localError.code ?? confirmErrors.code}
                />
                {/* Com um jeito já ligado, reenviar pede de novo o código dele: volta ao começo. */}
                <div className="flex flex-col gap-1">
                  <LinkButton
                    disabled={start.isPending}
                    onClick={() => {
                      if (adding) {
                        setProofOtp('');
                        setStep('password');
                      } else begin('EMAIL', () => setResent(true));
                    }}
                  >
                    {adding ? 'Não chegou? Começar de novo' : 'Não chegou? Reenviar código'}
                  </LinkButton>
                  <p role="status" className="text-sm text-muted">
                    {resent ? 'Código reenviado.' : ''}
                  </p>
                </div>
              </>
            ) : (
              totp && (
                <>
                  <ol className="flex list-decimal flex-col gap-3 pl-5">
                    <li>Abra o app autenticador e toque em “Adicionar” (ou “+”).</li>
                    <li>
                      <div className="flex flex-col gap-2">
                        <span>Aponte a câmera para este código:</span>
                        <img
                          src={totp.qr}
                          alt="QR code para adicionar o Faísca no app autenticador"
                          width={208}
                          height={208}
                          className="self-start rounded-md border border-border"
                        />
                        <span className="text-sm text-muted">Não consegue ler? Digite esta chave no app:</span>
                        <span className="flex flex-wrap items-center gap-3">
                          <code className="font-mono text-base tracking-wider break-all">{groupKey(totp.secret)}</code>
                          <Button variant="secondary" onClick={copyKey}>
                            Copiar
                          </Button>
                        </span>
                        <span role="status" className="text-sm text-muted">
                          {keyCopied}
                        </span>
                      </div>
                    </li>
                    <li>Digite o código de 6 números que aparece no app.</li>
                  </ol>
                  <CodeField
                    via="TOTP"
                    value={otp}
                    onChange={(value) => {
                      setOtp(value);
                      confirm.reset();
                    }}
                    error={localError.code ?? confirmErrors.code}
                  />
                </>
              )
            )}
          </Step>
          <DialogFooter>
            {cancel}
            <Button type="submit" disabled={confirm.isPending}>
              {confirm.isPending ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </Dialog>
    );
  }

  if (step === 'codes') {
    return (
      <Dialog title="Guarde os seus códigos de recuperação" onClose={() => setStep('done')}>
        <Step key={step}>
          <RecoveryCodesView codes={recoveryCodes} onDone={() => setStep('done')} />
        </Step>
        <div className="pb-6" />
      </Dialog>
    );
  }

  const enabledMessage = 'Pronto, a verificação em duas etapas está ligada.';
  const addedMessage = 'Pronto, agora você tem dois jeitos de confirmar.';
  return (
    <Dialog
      title={adding ? addedMessage : enabledMessage}
      onClose={() => onClose(adding ? addedMessage : enabledMessage)}
    >
      <Step key={step}>
        {!adding && (
          <>
            <p>Por segurança, os outros aparelhos saíram da sua conta. Este continua conectado.</p>
            <p className="text-muted">
              Dica: ative também o outro jeito (por e-mail ou pelo app). Assim, se perder um, você entra pelo outro.
            </p>
          </>
        )}
      </Step>
      <DialogFooter>
        <Button className="col-span-2" onClick={() => onClose(adding ? addedMessage : enabledMessage)}>
          Fechar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// Senha e código de um jeito ligado, usados para gerar códigos novos e para desligar.
function useProof(status: TwoFactorStatus) {
  const [password, setPassword] = useState('');
  const [via, setVia] = useState<CodeVia>(enabledVias(status)[0] ?? 'RECOVERY');
  const [otp, setOtp] = useState('');
  const [localError, setLocalError] = useState<{
    password?: string;
    code?: string;
  }>({});

  function validate() {
    const errors = {
      password: password ? undefined : 'Digite sua senha para confirmar.',
      code: otp.trim() ? undefined : 'Digite o código.',
    };
    setLocalError(errors);
    return !errors.password && !errors.code;
  }

  return {
    password,
    setPassword,
    via,
    setVia,
    otp,
    setOtp,
    localError,
    validate,
  };
}

function ProofForm({
  status,
  proof,
  apiError,
  onEdit,
  onSubmit,
  submitLabel,
  pendingLabel,
  pending,
  onCancel,
}: {
  status: TwoFactorStatus;
  proof: ReturnType<typeof useProof>;
  apiError: unknown;
  onEdit: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onCancel: () => void;
}) {
  const errors = splitTwoFactorError(apiError ? getApiError(apiError) : null);
  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        if (proof.validate()) onSubmit();
      }}
      error={errors.top}
    >
      <PasswordField
        label="Sua senha"
        autoComplete="current-password"
        autoFocus
        value={proof.password}
        onChange={(event) => {
          proof.setPassword(event.target.value);
          onEdit();
        }}
        error={proof.localError.password ?? errors.password}
      />
      <ProofFields
        status={status}
        via={proof.via}
        onViaChange={proof.setVia}
        otp={proof.otp}
        onOtpChange={(value) => {
          proof.setOtp(value);
          onEdit();
        }}
        codeError={proof.localError.code ?? errors.code}
      />
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}

function RegenerateDialog({ status, onClose }: { status: TwoFactorStatus; onClose: (done?: string) => void }) {
  const proof = useProof(status);
  const regenerate = useRegenerateRecoveryCodes();
  const [codes, setCodes] = useState<string[] | null>(null);
  const done = 'Pronto, os códigos novos estão valendo.';

  if (codes) {
    return (
      <Dialog title="Guarde os seus códigos de recuperação" onClose={() => onClose(done)}>
        <Step>
          <RecoveryCodesView codes={codes} onDone={() => onClose(done)} />
        </Step>
        <div className="pb-6" />
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Gerar códigos novos"
      description="Os códigos antigos deixam de valer. Para confirmar, digite a sua senha e um código."
      onClose={() => onClose()}
    >
      <ProofForm
        status={status}
        proof={proof}
        apiError={regenerate.error}
        onEdit={() => regenerate.reset()}
        onSubmit={() =>
          regenerate.mutate(
            { password: proof.password, via: proof.via, otp: proof.otp.trim() },
            { onSuccess: setCodes },
          )
        }
        submitLabel="Gerar códigos novos"
        pendingLabel="Gerando…"
        pending={regenerate.isPending}
        onCancel={() => onClose()}
      />
    </Dialog>
  );
}

function DisableDialog({ status, onClose }: { status: TwoFactorStatus; onClose: (done?: string) => void }) {
  const proof = useProof(status);
  const disable = useDisableTwoFactor();

  return (
    <Dialog
      title="Desligar a verificação em duas etapas?"
      description="Sem ela, só a senha basta para entrar na sua conta. Os códigos de recuperação deixam de valer."
      onClose={() => onClose()}
    >
      <ProofForm
        status={status}
        proof={proof}
        apiError={disable.error}
        onEdit={() => disable.reset()}
        onSubmit={() =>
          disable.mutate(
            { password: proof.password, via: proof.via, otp: proof.otp.trim() },
            {
              onSuccess: () => onClose('Pronto, a verificação em duas etapas foi desligada.'),
            },
          )
        }
        submitLabel="Desligar"
        pendingLabel="Desligando…"
        pending={disable.isPending}
        onCancel={() => onClose()}
      />
    </Dialog>
  );
}
