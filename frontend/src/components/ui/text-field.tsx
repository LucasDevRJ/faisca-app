import { useId, useState, type InputHTMLAttributes } from 'react';

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
