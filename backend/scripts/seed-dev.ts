// Contas fictícias para testar o vínculo e a visão da terapeuta no navegador, sem precisar de
// um segundo e-mail de verdade (DEC-032, DEC-033). Só roda em desenvolvimento.
// Uso: npm run db:seed-dev (com a API de dev configurada no .env).
//
// - terapeuta.dev@faisca.test: terapeuta, sem dados;
// - paciente.dev@faisca.test: paciente vinculada à terapeuta dev, com ~3 semanas de atividades,
//   Registros de Pensamentos, Episódios de tensão (um deles no dia da última consulta, para aparecer
//   no gráfico) e consultas fictícias em volta de hoje (última há 7 dias, próxima daqui a 3);
// - aviso-antigo.dev@faisca.test: paciente que só aceitou o aviso de privacidade de antes do RPD,
//   para testar o pedido do novo aceite no Registro de Pensamentos (DEC-039);
// - aviso-rpd.dev@faisca.test: paciente que aceitou a versão do RPD, mas não a dos episódios, para
//   testar o aceite por área (DEC-042): o RPD aberto e a Tensão pedindo o aceite.
// As duas primeiras já aceitaram a versão atual do aviso.
// Rodar de novo recria os registros da paciente dev (as datas acompanham o dia de hoje).

import type { ActivityStatus, Emotion } from '../src/generated/prisma/client.js';

// Dados fictícios (regra 5). A senha é pública de propósito: as contas só existem no banco local.
const PASSWORD = 'senha-ficticia-123';
const DEV_THERAPIST = { name: 'Terapeuta Dev (fictícia)', email: 'terapeuta.dev@faisca.test' };
const DEV_PATIENT = { name: 'Paciente Dev (fictícia)', email: 'paciente.dev@faisca.test' };
const DEV_OLD_PRIVACY = { name: 'Aviso Antigo Dev (fictícia)', email: 'aviso-antigo.dev@faisca.test' };
const DEV_RPD_PRIVACY = { name: 'Aviso RPD Dev (fictícia)', email: 'aviso-rpd.dev@faisca.test' };
// Versão do aviso de antes do Registro de Pensamentos.
const OLD_PRIVACY_VERSION = '2026-10';
// Versão do aviso do RPD, de antes dos Episódios de tensão.
const RPD_PRIVACY_VERSION = '2026-10.2';

// Registros de Pensamentos fictícios: [dias a partir de hoje, situação, pensamento, crença,
// emoções, comportamento, consequência].
const THOUGHT_RECORDS: [number, string, string, number, [string, number, string?][], string, string][] = [
  [-12, 'Reunião em que pediram minha opinião', 'Vou falar besteira', 8, [['ANSIEDADE', 8], ['VERGONHA', 5]], 'Fiquei em silêncio', 'Saí com a sensação de não ter contribuído'],
  [-9, 'Mensagem sem resposta de uma amiga', 'Ela não gosta mais de mim', 6, [['TRISTEZA', 7], ['SOLIDAO', 6]], 'Não mandei mais nada', 'Passei a tarde desanimada'],
  [-5, 'Esqueci de pagar uma conta', 'Eu não dou conta de nada', 7, [['CULPA', 6], ['FRUSTRACAO', 7]], 'Paguei com multa e fiquei remoendo', 'Dormi mal'],
  [-2, 'Elogio inesperado no trabalho', 'Foi só sorte', 5, [['ALEGRIA', 6], ['OUTRA', 4, 'Desconfiança']], 'Agradeci e mudei de assunto', 'Fiquei mais leve no fim do dia'],
  [0, 'Trânsito parado a caminho da consulta', 'Vou chegar atrasada e vão me julgar', 6, [['ANSIEDADE', 7], ['RAIVA', 4]], 'Avisei por mensagem', 'Cheguei e ninguém se importou'],
];

// Episódios de tensão fictícios: [dias a partir de hoje, hora ou null, situação, tensão,
// vontade de vocalizar, o que fez, o que aconteceu depois]. O de -7 cai no dia da última consulta.
const TENSION_EPISODES: [number, string | null, string, number, number, string, string][] = [
  [-7, '18:40', 'Sala de espera cheia antes da consulta', 7, 6, 'Fiquei mexendo as mãos', 'Aliviou quando fui chamada'],
  [-5, null, 'Discussão alta na casa do vizinho', 8, 8, 'Saí para caminhar', 'Voltei mais calma'],
  [-3, '08:15', 'Ônibus lotado e atrasado', 6, 4, 'Coloquei uma música', 'A tensão foi baixando'],
  [-3, '21:00', 'Prazo apertado de um trabalho', 9, 7, 'Fiz uma pausa e respirei', 'Consegui terminar uma parte'],
  [-1, null, 'Barulho de obra a tarde toda', 5, 5, 'Usei fone de ouvido', 'Deu para seguir o dia'],
  [0, null, 'Fila longa no mercado', 4, 3, 'Conversei com quem estava atrás', 'Passou rápido'],
];

const ACTIVITY_NAMES = [
  'Caminhada no parque',
  'Ligar para uma amiga',
  'Ler 10 páginas',
  'Cozinhar algo novo',
  'Alongamento pela manhã',
  'Ouvir um álbum inteiro',
  'Arrumar a escrivaninha',
  'Regar as plantas',
];
const OBSERVATIONS = ['Foi mais leve do que eu esperava.', 'Quase desisti, mas fui.', null, 'Gostei de ter feito.'];

if (process.env.NODE_ENV !== 'development') {
  // Antes do logger: importá-lo validaria o .env, e o recado aqui é outro.
  process.stderr.write('db:seed-dev só roda com NODE_ENV=development.\n');
  process.exit(1);
}

// Import dinâmico: o env.ts valida process.env no carregamento, depois da checagem acima.
const { prisma } = await import('../src/lib/prisma.js');
const { hashPassword } = await import('../src/lib/password.js');
const { logger } = await import('../src/lib/logger.js');
const { addDays, dateOnlyToDate, timeOnlyToDate, todayInAppZone } = await import('../src/lib/dates.js');
const { PRIVACY_VERSION } = await import('../src/modules/auth/auth.service.js');

const passwordHash = await hashPassword(PASSWORD);

// Rodar de novo devolve as contas ao estado conhecido (senha, perfil, e-mail confirmado).
async function upsertUser(
  user: { name: string; email: string },
  profiles: { patient: boolean; therapist: boolean },
  privacyVersion: string = PRIVACY_VERSION,
) {
  const data = {
    passwordHash,
    hasPatientProfile: profiles.patient,
    hasTherapistProfile: profiles.therapist,
    emailConfirmedAt: new Date(),
    privacyAcceptedAt: new Date(),
    privacyVersion,
  };
  return prisma.user.upsert({
    where: { email: user.email },
    create: { name: user.name, email: user.email, ...data },
    update: data,
  });
}

// Atividade de um dia, com os campos que cada estado exige (mesmas regras dos CHECKs).
function activityFor(userId: string, day: string, index: number, today: string) {
  const name = ACTIVITY_NAMES[index % ACTIVITY_NAMES.length] ?? 'Atividade fictícia';
  const base = { userId, name, activityDate: dateOnlyToDate(day) };
  const want = (index * 3) % 8;
  if (day > today) return { ...base, status: 'PLANEJADA' as ActivityStatus };
  if (day === today && index % 2 === 0) return { ...base, status: 'PENDENTE' as ActivityStatus, wantBefore: want };
  if (index % 5 === 4) {
    return { ...base, status: 'NAO_REALIZADA' as ActivityStatus, observation: 'Não deu hoje, tudo bem.' };
  }
  return {
    ...base,
    status: 'CONCLUIDA' as ActivityStatus,
    wantBefore: want,
    pleasure: Math.min(10, want + 2 + (index % 4)),
    achievement: Math.min(10, want + 3 + (index % 3)),
    observation: OBSERVATIONS[index % OBSERVATIONS.length] ?? null,
  };
}

const therapist = await upsertUser(DEV_THERAPIST, { patient: false, therapist: true });
const patient = await upsertUser(DEV_PATIENT, { patient: true, therapist: false });
await upsertUser(DEV_OLD_PRIVACY, { patient: true, therapist: false }, OLD_PRIVACY_VERSION);
await upsertUser(DEV_RPD_PRIVACY, { patient: true, therapist: false }, RPD_PRIVACY_VERSION);
const today = todayInAppZone();

// De 20 dias atrás até 2 dias à frente: 1 ou 2 atividades por dia.
const activities: ReturnType<typeof activityFor>[] = [];
let index = 0;
for (let offset = -20; offset <= 2; offset++) {
  const day = addDays(today, offset);
  const perDay = offset % 3 === 0 ? 2 : 1;
  for (let i = 0; i < perDay; i++) activities.push(activityFor(patient.id, day, index++, today));
}

await prisma.$transaction(async (tx) => {
  await tx.activity.deleteMany({ where: { userId: patient.id } });
  await tx.appointment.deleteMany({ where: { userId: patient.id } });
  await tx.activity.createMany({ data: activities });
  // As emoções saem em cascata.
  await tx.thoughtRecord.deleteMany({ where: { userId: patient.id } });
  for (const [offset, situation, automaticThought, beliefLevel, emotions, behavior, consequence] of THOUGHT_RECORDS) {
    await tx.thoughtRecord.create({
      data: {
        userId: patient.id,
        situationDate: dateOnlyToDate(addDays(today, offset)),
        situation,
        automaticThought,
        beliefLevel,
        behavior,
        consequence,
        emotions: {
          create: emotions.map(([emotion, intensity, otherLabel]) => ({
            emotion: emotion as Emotion,
            intensity,
            otherLabel: otherLabel ?? null,
          })),
        },
      },
    });
  }
  await tx.tensionEpisode.deleteMany({ where: { userId: patient.id } });
  await tx.tensionEpisode.createMany({
    data: TENSION_EPISODES.map(([offset, time, situation, tensionLevel, vocalizeUrge, behavior, consequence]) => ({
      userId: patient.id,
      episodeDate: dateOnlyToDate(addDays(today, offset)),
      episodeTime: time ? timeOnlyToDate(time) : null,
      situation,
      tensionLevel,
      vocalizeUrge,
      behavior,
      consequence,
    })),
  });
  // Agenda (DEC-045): toda semana às 14:00, desde 3 semanas atrás, com uma sessão desmarcada, uma
  // remarcada e uma consulta antiga, de antes da agenda, sem hora. As exceções saem em cascata.
  await tx.appointmentSchedule.deleteMany({ where: { userId: patient.id } });
  await tx.therapyPause.deleteMany({ where: { userId: patient.id } });
  const schedule = await tx.appointmentSchedule.create({
    data: {
      userId: patient.id,
      startDate: dateOnlyToDate(addDays(today, -21)),
      time: timeOnlyToDate('14:00'),
      frequency: 'SEMANAL',
    },
  });
  await tx.appointmentException.createMany({
    data: [
      {
        scheduleId: schedule.id,
        originalDate: dateOnlyToDate(addDays(today, -14)),
        type: 'DESMARCADA',
        reason: 'Feriado (fictício)',
      },
      {
        scheduleId: schedule.id,
        originalDate: dateOnlyToDate(addDays(today, 7)),
        type: 'REMARCADA',
        newDate: dateOnlyToDate(addDays(today, 8)),
        newTime: timeOnlyToDate('10:00'),
        reason: 'Viagem a trabalho (fictícia)',
      },
    ],
  });
  await tx.appointment.create({ data: { userId: patient.id, appointmentDate: dateOnlyToDate(addDays(today, -35)) } });
  // Um vínculo ativo por paciente (DEC-031): se a paciente dev estiver com outra pessoa, fica como está.
  const active = await tx.therapistLink.findFirst({ where: { patientId: patient.id, revokedAt: null } });
  if (!active) {
    await tx.therapistLink.create({
      data: { patientId: patient.id, therapistId: therapist.id, method: 'CODE', seenByPatientAt: new Date() },
    });
  }
});
await prisma.$disconnect();

// Sem e-mail nem senha no log (regra 7): estão no backend/README.md.
logger.info(
  { activities: activities.length, thoughtRecords: THOUGHT_RECORDS.length, tensionEpisodes: TENSION_EPISODES.length },
  'Contas fictícias prontas (e-mails e senha no backend/README.md)',
);
