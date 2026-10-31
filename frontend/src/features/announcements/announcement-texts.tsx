import type { ReactNode } from 'react';

// Textos das novidades do app (DEC-054, DEC-055, DEC-060), por id. A API só diz qual novidade a
// pessoa ainda não viu; o card e a página "O que há de novo" leem daqui. Um id que o front não
// conhece não mostra nada.
export type AnnouncementText = {
  title: string;
  // Emoji ao lado do título, escondido do leitor de tela (senão ele lê "brilhos" no nome da região).
  icon?: string;
  // Dia em que a novidade entrou no ar (AAAA-MM-DD), mostrado na página "O que há de novo".
  date: string;
  // Texto para quem usa como paciente e para quem atende como terapeuta. Quem tem os dois perfis
  // vê os dois; sem texto para nenhum perfil da pessoa, a novidade não é para ela.
  patient?: ReactNode;
  therapist?: ReactNode;
  // Atalho para a parte nova, no perfil de paciente.
  link?: { to: string; label: string };
};

export type Profiles = { patient: boolean; therapist: boolean };

export const ANNOUNCEMENT_TEXTS: Record<string, AnnouncementText> = {
  '2026-10-explicacao-alternativa': {
    title: 'Novidade no Registro de Pensamentos',
    icon: '✨',
    date: '2026-10-15',
    patient: (
      <>
        <p>
          Agora você pode escrever uma <strong>explicação alternativa</strong>: outro jeito de olhar para a situação.
          Se quiser, depois diz <strong>como se sente agora</strong> em cada emoção.
        </p>
        <p>
          É opcional. Se a alternativa só vier depois, tudo bem: você pode adicioná-la ao registro até a hora da sua
          próxima consulta.
        </p>
      </>
    ),
    therapist: (
      <p>
        Nos registros dos seus pacientes, o Registro de Pensamentos agora pode trazer a{' '}
        <strong>explicação alternativa</strong> e a intensidade das emoções depois dela (antes → agora). Quando a
        alternativa é adicionada depois do dia do registro, aparece a data em que entrou.
      </p>
    ),
    link: { to: '/pensamentos', label: 'Ver meus pensamentos' },
  },
  // Só para a terapeuta (DEC-058): para a paciente, nada muda.
  '2026-10-lido': {
    title: 'Novidade: o que você ainda tem para ler',
    icon: '📋',
    date: '2026-10-25',
    therapist: (
      <>
        <p>
          Agora você pode marcar os Pensamentos, os Episódios de tensão e as Ações dos seus pacientes como{' '}
          <strong>lidos</strong>, e ver, fora do ciclo, tudo o que está para ler.
        </p>
        <p>
          Se um registro mudar depois que você leu, ele volta para a lista, com o aviso "atualizado". A marca é só sua: o
          paciente não a vê.
        </p>
      </>
    ),
  },
  // Fotos nas ações avaliadas (DEC-065).
  '2026-10-fotos-acao': {
    title: 'Novidade: fotos na Ação',
    icon: '📷',
    date: '2026-10-25',
    patient: (
      <>
        <p>
          Depois de contar como foi uma ação, você pode <strong>adicionar até 10 fotos</strong> a ela, como lembrança
          do que fez. É opcional.
        </p>
        <p>
          As fotos aparecem para a sua psicóloga. Dá para adicionar ou remover até a hora da sua próxima consulta.
        </p>
      </>
    ),
    therapist: (
      <p>
        Nas ações dos seus pacientes, agora podem aparecer <strong>fotos</strong> do que eles fizeram. Toque numa foto
        para vê-la maior.
      </p>
    ),
    link: { to: '/acao', label: 'Ver minhas ações' },
  },
  // Cópias de segurança e aviso de privacidade versão 7 (DEC-078).
  '2026-10-copias-seguranca': {
    title: 'Novidade: cópias de segurança',
    icon: '🔒',
    date: '2026-10-31',
    patient: (
      <>
        <p>
          Agora o Faísca faz uma <strong>cópia de segurança</strong> por dia, criptografada, para os seus registros não se
          perderem se acontecer um problema grave.
        </p>
        <p>
          Se você excluir a conta, ela some do app na hora, e as cópias expiram em até 5 semanas. O aviso de privacidade
          foi atualizado e pede o seu aceite de novo.
        </p>
      </>
    ),
    therapist: (
      <>
        <p>
          Agora o Faísca faz uma <strong>cópia de segurança</strong> por dia, criptografada, para os registros não se
          perderem se acontecer um problema grave.
        </p>
        <p>O aviso de privacidade foi atualizado e pede o seu aceite de novo.</p>
      </>
    ),
    link: { to: '/privacidade', label: 'Ler o aviso de privacidade' },
  },
  // Mural de avisos da terapeuta (DEC-080).
  '2026-10-mural': {
    title: 'Novidade: mural de avisos',
    icon: '📌',
    date: '2026-10-31',
    patient: (
      <p>
        Agora quem acompanha você pode deixar <strong>avisos</strong> no Faísca, como férias ou mudança de horário. Eles
        aparecem em Meus registros. Só você sabe quais já leu.
      </p>
    ),
    therapist: (
      <p>
        Agora você pode escrever <strong>avisos</strong> para todos os seus pacientes de uma vez, no Mural, em Meus
        pacientes. Eles não veem uns aos outros, e você não vê quem leu.
      </p>
    ),
  },
};

// A novidade tem texto para algum perfil da pessoa?
export function isFor(text: AnnouncementText, profiles: Profiles): boolean {
  return Boolean((profiles.patient && text.patient) || (profiles.therapist && text.therapist));
}

// As novidades da pessoa, da mais nova para a mais antiga. No mesmo dia, a que entrou depois na
// lista vem primeiro.
export function announcementsFor(profiles: Profiles): [string, AnnouncementText][] {
  return Object.entries(ANNOUNCEMENT_TEXTS)
    .filter(([, text]) => isFor(text, profiles))
    .reverse()
    .sort(([, a], [, b]) => b.date.localeCompare(a.date));
}
