// Card de Novidades (DEC-054): avisa uma melhoria do app uma vez, até a pessoa tocar em "Entendi".
// Os textos ficam no front; a API só diz qual novidade a pessoa ainda não viu. Para anunciar outra
// melhoria, acrescente o id no fim da lista, com o público, e o texto no front.
// - 2026-10-explicacao-alternativa: explicação alternativa e "como me sinto agora" no RPD (todos).
// - 2026-10-lido: marcas de leitura da terapeuta (DEC-058), só para a terapeuta.
// - 2026-10-fotos-acao: fotos nas ações avaliadas (DEC-065), para todos.
// - 2026-10-copias-seguranca: cópias de segurança e aviso de privacidade versão 7 (DEC-078), para todos.
// - 2026-10-mural: mural de avisos da terapeuta (DEC-080), para todos.
export const ANNOUNCEMENTS = [
  '2026-10-explicacao-alternativa',
  '2026-10-lido',
  '2026-10-fotos-acao',
  '2026-10-copias-seguranca',
  '2026-10-mural',
] as const;

export type Announcement = (typeof ANNOUNCEMENTS)[number];

// Para quem é cada novidade (DEC-058): uma melhoria só da terapeuta não pode esconder, de quem é só
// paciente, uma novidade anterior que ela ainda não viu.
type Audience = 'TODOS' | 'TERAPEUTA';
const AUDIENCE: Record<Announcement, Audience> = {
  '2026-10-explicacao-alternativa': 'TODOS',
  '2026-10-lido': 'TERAPEUTA',
  '2026-10-fotos-acao': 'TODOS',
  '2026-10-copias-seguranca': 'TODOS',
  '2026-10-mural': 'TODOS',
};

export type Profiles = { patient: boolean; therapist: boolean };

// A mais nova de todas: conta nova nasce com ela vista, porque já conhece o app como ele está.
export const CURRENT_ANNOUNCEMENT: Announcement = ANNOUNCEMENTS[ANNOUNCEMENTS.length - 1]!;

function isFor(announcement: Announcement, profiles: Profiles): boolean {
  return AUDIENCE[announcement] === 'TODOS' || profiles.therapist;
}

// A novidade mais recente que vale para o perfil da pessoa e que veio depois da última que ela
// viu. Só uma aparece: quem não viu uma antiga não precisa mais dela.
export function pendingAnnouncement(seen: string | null, profiles: Profiles): Announcement | null {
  const seenIndex = ANNOUNCEMENTS.indexOf(seen as Announcement);
  for (let i = ANNOUNCEMENTS.length - 1; i > seenIndex; i--) {
    const announcement = ANNOUNCEMENTS[i]!;
    if (isFor(announcement, profiles)) return announcement;
  }
  return null;
}
