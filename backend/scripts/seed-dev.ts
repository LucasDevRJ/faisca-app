// Contas fictícias para testar o vínculo e a visão da terapeuta no navegador, sem precisar de
// um segundo e-mail de verdade (DEC-032, DEC-033). Só roda em desenvolvimento.
// Uso: npm run db:seed-dev (com a API de dev configurada no .env).
//
// - terapeuta.dev@faisca.test: terapeuta, sem dados;
// - paciente.dev@faisca.test: paciente vinculada à terapeuta dev, com ~3 semanas de atividades e
//   consultas fictícias em volta de hoje (última há 7 dias, próxima daqui a 3).
// Rodar de novo recria os registros da paciente dev (as datas acompanham o dia de hoje).

import type { ActivityStatus } from '../src/generated/prisma/client.js';

// Dados fictícios (regra 5). A senha é pública de propósito: as contas só existem no banco local.
const PASSWORD = 'senha-ficticia-123';
const DEV_THERAPIST = { name: 'Terapeuta Dev (fictícia)', email: 'terapeuta.dev@faisca.test' };
const DEV_PATIENT = { name: 'Paciente Dev (fictícia)', email: 'paciente.dev@faisca.test' };

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
const { addDays, dateOnlyToDate, todayInAppZone } = await import('../src/lib/dates.js');

const passwordHash = await hashPassword(PASSWORD);

// Rodar de novo devolve as contas ao estado conhecido (senha, perfil, e-mail confirmado).
async function upsertUser(user: { name: string; email: string }, profiles: { patient: boolean; therapist: boolean }) {
  const data = {
    passwordHash,
    hasPatientProfile: profiles.patient,
    hasTherapistProfile: profiles.therapist,
    emailConfirmedAt: new Date(),
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
  await tx.appointment.createMany({
    data: [-21, -7, 3].map((offset) => ({ userId: patient.id, appointmentDate: dateOnlyToDate(addDays(today, offset)) })),
  });
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
logger.info({ activities: activities.length }, 'Contas fictícias prontas (e-mails e senha no backend/README.md)');
