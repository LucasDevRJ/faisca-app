import type { ApiErrorInfo } from './auth-api';
import type { CodeVia, TwoFactorStatus } from './two-factor-api';

// Funções das telas da verificação em duas etapas (DEC-092), fora dos componentes.

const CODE_ERRORS = new Set(['INVALID_CODE', 'CODE_EXPIRED', 'CODE_REQUIRED']);

// Separa o erro da API por campo: senha, código ou o topo da janela.
export function splitTwoFactorError(apiError: ApiErrorInfo | null) {
  return {
    password: apiError?.code === 'INVALID_PASSWORD' ? apiError.message : undefined,
    code: apiError && CODE_ERRORS.has(apiError.code) ? apiError.message : undefined,
    top:
      apiError && apiError.code !== 'INVALID_PASSWORD' && !CODE_ERRORS.has(apiError.code) ? apiError.message : null,
  };
}

// Jeitos que a pessoa pode usar para confirmar uma ação: os ligados e, se sobrar algum, um código
// de recuperação.
export function enabledVias(status: TwoFactorStatus): CodeVia[] {
  const vias: CodeVia[] = [];
  if (status.totpEnabled) vias.push('TOTP');
  if (status.emailEnabled) vias.push('EMAIL');
  if (status.recoveryCodesLeft > 0) vias.push('RECOVERY');
  return vias;
}

