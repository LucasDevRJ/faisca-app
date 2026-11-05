// Avisa a tela de entrar que a sessão terminou sem a pessoa pedir (DEC-087): "Sair de todos" em
// outro aparelho, senha trocada em outro aparelho ou sessão vencida. Vai no state da navegação,
// como os avisos de conta excluída e de "Sair de todos".
export type SessionEndedState = { sessionEnded: true };

export const sessionEndedState: SessionEndedState = { sessionEnded: true };

export function readSessionEnded(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'sessionEnded' in state;
}
