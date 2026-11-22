import { AppError } from '../../errors/app-error.js';

// Versões do aviso de privacidade (DEC-036), da mais antiga para a mais nova. A última é a atual,
// gravada no cadastro e no novo aceite. Muda junto com o texto da página /privacidade no front
// (frontend/src/pages/privacy-page.tsx).
// - 2026-10: primeira versão, aceita no cadastro.
// - 2026-10.2: entra o Registro de Pensamentos (DEC-039).
// - 2026-10.3: entram os Episódios de tensão (DEC-042).
// - 2026-10.4: entra a agenda, com hora, motivos e pausas (DEC-045).
// - 2026-10.5: entra a Ação (DEC-051).
// - 2026-10.6: entram as fotos da Ação (DEC-064).
// - 2026-10.7: entram as cópias de segurança (DEC-075, DEC-078). Sem área nova: nada é bloqueado.
// - 2026-11: entra o "Sobre mim" (DEC-081).
// - 2026-11.2: entra o Meus Planos (DEC-094).
// - 2026-11.3: dados da verificação em duas etapas, mensagens ao suporte (Zoho Mail) e o contato
//   suporte@ (DEC-096). Sem área nova: nada é bloqueado.
// - 2026-11.4: até duas profissionais (psicóloga e psiquiatra), cada uma vendo só as áreas que o
//   paciente escolhe (DEC-097, DEC-098). Sem área nova: nada é bloqueado.
// - 2026-11.5: entram as fotos nas atividades (DEC-103), com área própria.
// - 2026-11.6: entram as Tarefas e suas respostas (DEC-106), com área própria.
// - 2026-11.7: entram o Sono e humor e o Remédio do dia (DEC-107), cada um com área própria.
// - 2026-11.8: entra a Comunidade de apoio entre pacientes (DEC-113), com área própria.
// - 2026-11.9: entram os remédios, as mudanças e o que o paciente sente (DEC-114), com área própria.
// - 2026-11.10: o paciente pode pedir para ver quando a profissional leu, e ela pode ativar (DEC-117).
//   A área cobre o pedido, a resposta dela e o que o paciente vê.
export const PRIVACY_VERSIONS = [
  '2026-10',
  '2026-10.2',
  '2026-10.3',
  '2026-10.4',
  '2026-10.5',
  '2026-10.6',
  '2026-10.7',
  '2026-11',
  '2026-11.2',
  '2026-11.3',
  '2026-11.4',
  '2026-11.5',
  '2026-11.6',
  '2026-11.7',
  '2026-11.8',
  '2026-11.9',
  '2026-11.10',
  '2026-11.11',
] as const;

export type PrivacyVersion = (typeof PRIVACY_VERSIONS)[number];

// A versão atual: a que o cadastro e o novo aceite gravam e a que o app pede. Fica explícita, e não
// "a última da lista", porque a API conhece uma versão antes de o texto dela estar no ar (DEC-064):
// a 2026-10.6 (fotos da Ação) só virou a atual no PR das telas, junto com o texto do aviso
// (DEC-065). Sem isso, alguém aceitaria uma versão cujo texto ainda não viu. O mesmo vale para a
// 2026-11 ("Sobre mim", DEC-081): conhecida antes, virou a atual no PR das telas (DEC-082). E
// para a 2026-11.2 (Meus Planos, DEC-094): conhecida na API, virou a atual no PR das telas (DEC-095).
// A 2026-11.3 (DEC-096) e a 2026-11.4 (DEC-098) entraram de uma vez, API e texto no mesmo PR.
// A 2026-11.5 (fotos das atividades, DEC-103) foi conhecida na API antes e virou a atual no PR das
// telas, com o texto (DEC-104). A 2026-11.6 (Tarefas, DEC-106) segue o mesmo fluxo, e a 2026-11.7
// (sono, humor e remédio, DEC-107) também: conhecida na API, vira a atual no PR das telas (DEC-108).
// A 2026-11.8 (Comunidade, DEC-113) entrou com API e texto no mesmo PR. A 2026-11.9 (remédios e o que
// sinto, DEC-114) foi conhecida na API antes e virou a atual no PR das telas, com o texto (DEC-115).
// A 2026-11.10 ("Lido" para o paciente, DEC-117) seguiu o mesmo fluxo: virou a atual no PR das telas,
// com o texto (DEC-118).
// A API conhece a versão de Mensagens antes da publicação das telas (DEC-056, DEC-125).
export const PRIVACY_VERSION: PrivacyVersion = '2026-11.10';
export const MESSAGES_PRIVACY_VERSION: PrivacyVersion = '2026-11.11';

export function privacyUpToDate(acceptedVersion: string | null): boolean {
  return PRIVACY_VERSIONS.indexOf(acceptedVersion as PrivacyVersion) >= PRIVACY_VERSIONS.indexOf(PRIVACY_VERSION);
}

// Qual versão gravar no aceite (DEC-105). O app manda a versão que mostrou; o servidor só grava a que
// a pessoa leu. Sem versão é um app de antes dessa regra (instalado e ainda não atualizado, ou nos
// minutos em que a API nova já está no ar e o front ainda não): grava a última versão que esses apps
// mostram, e não a atual, para ninguém aceitar sem ler um texto novo. A faixa continua até atualizar.
export const LEGACY_SHOWN_VERSION: PrivacyVersion = '2026-11.4';

// current: a versão que a conta já tem. O aceite de um app antigo nunca rebaixa um aceite mais novo
// (achado do revisor-seguranca): a pessoa que aceitou a atual noutro aparelho continua com ela.
export function versionToRecord(shownVersion: string | undefined, current: string | null = null): PrivacyVersion {
  const shown = shownVersion ?? LEGACY_SHOWN_VERSION;
  // A Vercel e o Railway publicam separadamente. Preserve o aceite mais novo e grave
  // apenas a versão enviada pelo app, inclusive quando o PWA ainda mostra a anterior.
  if (shownVersion === undefined || shown === '2026-11.10' || shown === MESSAGES_PRIVACY_VERSION) {
    const kept = PRIVACY_VERSIONS.indexOf(current as PrivacyVersion);
    const displayed = PRIVACY_VERSIONS.indexOf(shown as PrivacyVersion);
    return PRIVACY_VERSIONS[Math.max(kept, displayed)]!;
  }
  if (shownVersion === PRIVACY_VERSION) return PRIVACY_VERSION;
  throw new AppError(
    409,
    'PRIVACY_VERSION_OUTDATED',
    'O aviso de privacidade mudou. Atualize o app para ler a versão nova antes de aceitar.',
  );
}

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
  // "Sobre mim" (DEC-081): o que o paciente conta sobre si, o que quer trabalhar e os hábitos.
  aboutMe: '2026-11',
  // Meus Planos (DEC-094): os planos de ação, as perguntas e cada registro com as respostas.
  plans: '2026-11.2',
  // Fotos das atividades (DEC-103): fazem parte do registro de saúde e podem mostrar outras pessoas.
  activityPhotos: '2026-11.5',
  // Tarefas e respostas (DEC-106): conteúdo de saúde escrito pelo paciente.
  tasks: '2026-11.6',
  // Sono e humor (DEC-107): horários de deitar e acordar, notas do sono e do humor e a palavra do dia.
  sleepMood: '2026-11.7',
  // Remédio (DEC-107): só se tomou como combinado em cada dia, sem nome nem dose.
  medication: '2026-11.7',
  community: '2026-11.8',
  // Remédios e o que sinto (DEC-114): nome, dose e horário dos remédios, as mudanças com data e o que
  // o paciente sente, com a intensidade.
  medications: '2026-11.9',
  // "Lido" para o paciente (DEC-117): a data em que a profissional leu, se os dois ligarem.
  readReceipts: '2026-11.10',
  messages: MESSAGES_PRIVACY_VERSION,
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
    aboutMe: coversArea(acceptedVersion, 'aboutMe'),
    plans: coversArea(acceptedVersion, 'plans'),
    activityPhotos: coversArea(acceptedVersion, 'activityPhotos'),
    tasks: coversArea(acceptedVersion, 'tasks'),
    sleepMood: coversArea(acceptedVersion, 'sleepMood'),
    medication: coversArea(acceptedVersion, 'medication'),
    community: coversArea(acceptedVersion, 'community'),
    medications: coversArea(acceptedVersion, 'medications'),
    readReceipts: coversArea(acceptedVersion, 'readReceipts'),
    messages: coversArea(acceptedVersion, 'messages'),
  };
}
