import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { useRedeemLinkCode } from './use-links';

// Mesmo alfabeto do backend (DEC-031): 8 caracteres, sem 0/O, 1/I/L, U/V.
const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

function normalize(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

// Campo de código em "Meus pacientes" (SPEC, "Código de vínculo").
export function RedeemCodeForm() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const redeem = useRedeemLinkCode();
  const apiError = redeem.error ? getApiError(redeem.error) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = CODE_PATTERN.test(normalize(code))
      ? undefined
      : 'O código tem 8 letras e números, como K7M4-P9QX.';
    setError(invalid);
    if (invalid) return;
    redeem.mutate(code.trim(), { onSuccess: () => setCode('') });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="redeem-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft"
    >
      <div className="flex flex-col gap-1">
        <h2 id="redeem-title" className="text-lg font-semibold">
          Vincular paciente
        </h2>
        <p className="text-sm text-muted">Digite o código que o paciente gerou no Faísca. Ele vale por 24 horas.</p>
      </div>

      {redeem.isSuccess && (
        <Alert>
          Pronto! Agora você acompanha os registros de <strong>{redeem.data.name}</strong>.
        </Alert>
      )}
      {apiError && !apiError.fields.code && <Alert tone="attention">{apiError.message}</Alert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Código do paciente"
          placeholder="K7M4-P9QX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (!redeem.isPending) redeem.reset();
          }}
          error={error ?? apiError?.fields.code}
          className="sm:flex-1"
        />
        <Button type="submit" disabled={redeem.isPending} className="sm:mt-8">
          {redeem.isPending ? 'Vinculando…' : 'Vincular'}
        </Button>
      </div>
    </form>
  );
}
