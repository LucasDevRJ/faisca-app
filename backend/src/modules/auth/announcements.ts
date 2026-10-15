// Card de Novidades (DEC-054): avisa uma melhoria do app uma vez, até a pessoa tocar em "Entendi".
// Os textos ficam no front; a API só diz qual novidade a pessoa ainda não viu. Para anunciar outra
// melhoria, acrescente o id no fim da lista e o texto no front.
// - 2026-10-explicacao-alternativa: explicação alternativa e "como me sinto agora" no RPD.
export const ANNOUNCEMENTS = ['2026-10-explicacao-alternativa'] as const;

export type Announcement = (typeof ANNOUNCEMENTS)[number];

export const CURRENT_ANNOUNCEMENT: Announcement = ANNOUNCEMENTS[ANNOUNCEMENTS.length - 1]!;

// Só a novidade atual aparece: quem não viu uma antiga não precisa mais dela.
export function pendingAnnouncement(seen: string | null): Announcement | null {
  return seen === CURRENT_ANNOUNCEMENT ? null : CURRENT_ANNOUNCEMENT;
}
