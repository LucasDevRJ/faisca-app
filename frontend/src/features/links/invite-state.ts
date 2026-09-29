// O token do convite viaja entre /convite, /entrar e /cadastro no state da navegação: nunca na
// URL nem no localStorage (frontend/CLAUDE.md, DEC-027). O state sobrevive a recarregar a página.
export type InviteState = { inviteToken: string };

export function readInviteToken(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('inviteToken' in state)) return null;
  const token = (state as { inviteToken: unknown }).inviteToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export function inviteState(token: string | null): InviteState | undefined {
  return token ? { inviteToken: token } : undefined;
}
