import { useId, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
};

// Campo com rótulo, dica e erro ligados ao input (aria-describedby), para leitores de tela.
export function TextField({ label, hint, error, className = '', ...props }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-md border border-border bg-bg px-3 text-text aria-invalid:border-accent-text"
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}

// Senha com botão "Mostrar": ajuda quem digita no celular a conferir o que escreveu.
export function PasswordField(props: Omit<TextFieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <TextField {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        // O nome falado contém o texto visível (WCAG 2.5.3) e diz de qual campo se trata.
        aria-label={visible ? 'Esconder senha' : 'Mostrar senha'}
        className="absolute top-0 right-0 rounded-sm px-2 py-0.5 text-sm font-medium text-primary-text"
      >
        {visible ? 'Esconder' : 'Mostrar'}
      </button>
    </div>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  // Limite com contador, no lugar do maxLength: o maxLength corta em silêncio o texto colado,
  // e assim a pessoa vê que passou e decide o que tirar (DEC-053). Quem barra é a validação.
  limit?: number;
};

// O contador só aparece perto do limite, para não pesar no formulário.
const COUNTER_FROM = 0.8;
const countFormat = new Intl.NumberFormat('pt-BR');

// Mesmo padrão do TextField, para textos mais longos (ex.: observação).
export function TextAreaField({ label, hint, error, limit, className = '', ...props }: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const counterId = `${id}-counter`;
  const length = typeof props.value === 'string' ? props.value.length : 0;
  const showCounter = limit !== undefined && length >= limit * COUNTER_FROM;
  const over = limit !== undefined && length > limit;
  const describedBy =
    [hint && hintId, showCounter && counterId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="rounded-md border border-border bg-bg px-3 py-2 text-text aria-invalid:border-accent-text"
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {showCounter && (
        <p id={counterId} className={`text-sm tabular-nums ${over ? 'text-accent-text' : 'text-muted'}`}>
          {countFormat.format(length)} de {countFormat.format(limit)} caracteres
          {over && ` (passou ${countFormat.format(length - limit)})`}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}
