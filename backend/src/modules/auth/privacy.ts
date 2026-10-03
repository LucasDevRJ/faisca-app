// Versões do aviso de privacidade (DEC-036), da mais antiga para a mais nova. A última é a atual,
// gravada no cadastro e no novo aceite. Muda junto com o texto da página /privacidade no front
// (frontend/src/pages/privacy-page.tsx).
// - 2026-10: primeira versão, aceita no cadastro.
// - 2026-10.2: entra o Registro de Pensamentos (DEC-039).
// - 2026-10.3: entram os Episódios de tensão (DEC-042).
export const PRIVACY_VERSIONS = ['2026-10', '2026-10.2', '2026-10.3'] as const;

export type PrivacyVersion = (typeof PRIVACY_VERSIONS)[number];

export const PRIVACY_VERSION: PrivacyVersion = PRIVACY_VERSIONS[PRIVACY_VERSIONS.length - 1]!;

// Cada área de dado novo exige a versão do aviso que passou a citá-la (DEC-042). Assim, uma versão
// nova não bloqueia de novo o que a pessoa já tinha liberado: quem aceitou a 2026-10.2 segue no RPD
// e só precisa do novo aceite para os episódios de tensão.
export const PRIVACY_AREAS = {
  thoughtRecords: '2026-10.2',
  tensionEpisodes: '2026-10.3',
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
  };
}
