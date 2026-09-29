// Avisa a tela de entrar que a conta acabou de ser excluída (DEC-035). Vai no state da
// navegação, como o token do convite: só existe na entrada vinda da exclusão, e uma visita
// nova a /entrar não mostra o aviso.
export type AccountDeletedState = { accountDeleted: true };

export const accountDeletedState: AccountDeletedState = { accountDeleted: true };

export function readAccountDeleted(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'accountDeleted' in state;
}
