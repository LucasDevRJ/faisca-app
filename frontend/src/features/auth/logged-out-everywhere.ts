// Avisa a tela de entrar que a pessoa acabou de sair de todos os aparelhos (DEC-085). Vai no
// state da navegação, como o aviso de conta excluída: uma visita nova a /entrar não mostra nada.
export type LoggedOutEverywhereState = { loggedOutEverywhere: true };

export const loggedOutEverywhereState: LoggedOutEverywhereState = { loggedOutEverywhere: true };

export function readLoggedOutEverywhere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'loggedOutEverywhere' in state;
}
