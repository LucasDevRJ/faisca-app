// Versões do aviso de privacidade (DEC-036), da mais antiga para a mais nova. A última é a atual,
// gravada no cadastro e no novo aceite. Muda junto com o texto da página /privacidade no front
// (frontend/src/pages/privacy-page.tsx).
// - 2026-10: primeira versão, aceita no cadastro.
// - 2026-10.2: entra o Registro de Pensamentos (DEC-039).
// - 2026-10.3: entram os Episódios de tensão (DEC-042).
// - 2026-10.4: entra a agenda, com hora, motivos e pausas (DEC-045).
// - 2026-10.5: entra a Ação (DEC-051).
// - 2026-10.6: entram as fotos da Ação (DEC-064).
export const PRIVACY_VERSIONS = ['2026-10', '2026-10.2', '2026-10.3', '2026-10.4', '2026-10.5', '2026-10.6'] as const;

export type PrivacyVersion = (typeof PRIVACY_VERSIONS)[number];

// A versão atual: a que o cadastro e o novo aceite gravam e a que o app pede. Fica explícita, e não
// "a última da lista", porque a API conhece uma versão antes de o texto dela estar no ar (DEC-064):
// a 2026-10.6 (fotos da Ação) só vira a atual no PR das telas, junto com o texto do aviso. Sem
// isso, alguém aceitaria uma versão cujo texto ainda não viu.
export const PRIVACY_VERSION: PrivacyVersion = '2026-10.5';

// Cada área de dado novo exige a versão do aviso que passou a citá-la (DEC-042). Assim, uma versão
// nova não bloqueia de novo o que a pessoa já tinha liberado: quem aceitou a 2026-10.2 segue no RPD
// e só precisa do novo aceite para os episódios de tensão.
export const PRIVACY_AREAS = {
  thoughtRecords: '2026-10.2',
  tensionEpisodes: '2026-10.3',
  // Agenda (DEC-045): hora das consultas, motivos de desmarcar e remarcar e pausas.
  appointmentSchedule: '2026-10.4',
  // Ação (DEC-051): as ações, as notas de expectativa, prazer e realização e as observações.
  actions: '2026-10.5',
  // Fotos da Ação (DEC-064): fazem parte do registro de saúde e podem mostrar outras pessoas.
  actionPhotos: '2026-10.6',
} as const satisfies Record<string, PrivacyVersion>;

export type PrivacyArea = keyof typeof PRIVACY_AREAS;

// A versão aceita cobre a área? Versão desconhecida ou nenhuma (conta de antes do aviso) não cobre.
// Compara pela posição na lista, e não como texto: '2026-10.10' viria antes de '2026-10.9'.
export function coversArea(acceptedVersion: string | null, area: PrivacyArea): boolean {
  const accepted = PRIVACY_VERSIONS.indexOf(acceptedVersion as PrivacyVersion);
  return accepted >= 0 && accepted >= PRIVACY_VERSIONS.indexOf(PRIVACY_AREAS[area]);
}

export function privacyAreas(acceptedVersion: string | null): Record<PrivacyArea, boolean> {
  return {
    thoughtRecords: coversArea(acceptedVersion, 'thoughtRecords'),
    tensionEpisodes: coversArea(acceptedVersion, 'tensionEpisodes'),
    appointmentSchedule: coversArea(acceptedVersion, 'appointmentSchedule'),
    actions: coversArea(acceptedVersion, 'actions'),
    actionPhotos: coversArea(acceptedVersion, 'actionPhotos'),
  };
}
