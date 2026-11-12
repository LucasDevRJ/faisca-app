import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import type { LinkMethod, ProfessionalKind, SharedArea } from '../generated/prisma/client.js';
import { SHARED_AREAS } from '../lib/shared-areas.js';
import { PRIVACY_VERSION } from '../modules/auth/auth.service.js';

// Apaga os dados entre testes. deleteMany em vez de TRUNCATE: o faisca_app só tem DML.
export async function resetDatabase() {
  await prisma.activity.deleteMany();
  // As emoções saem em cascata.
  await prisma.thoughtRecord.deleteMany();
  await prisma.tensionEpisode.deleteMany();
  // Os registros saem em cascata com o plano.
  await prisma.plan.deleteMany();
  await prisma.actionPhoto.deleteMany();
  await prisma.behavioralAction.deleteMany();
  await prisma.appointment.deleteMany();
  // As exceções saem em cascata com a regra.
  await prisma.appointmentSchedule.deleteMany();
  await prisma.therapyPause.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.linkCodeAttempt.deleteMany();
  await prisma.linkCode.deleteMany();
  await prisma.linkInvite.deleteMany();
  await prisma.noticeSeen.deleteMany();
  await prisma.therapistNotice.deleteMany();
  await prisma.therapistLink.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.reminderSettings.deleteMany();
  await prisma.userAvatar.deleteMany();
  await prisma.user.deleteMany();
  await prisma.deletedAccount.deleteMany();
}

// Usuário fictício já confirmado, para testes que não são sobre o cadastro.
export async function createConfirmedUser(
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    patient: boolean;
    therapist: boolean;
    // Versão do aviso aceita; null = conta de antes do aviso. Por padrão, a atual.
    privacyVersion: string | null;
    // Tipo de profissional (DEC-097); por padrão, psicóloga quando tem o perfil de terapeuta.
    professionalKind: ProfessionalKind;
  }> = {},
) {
  const {
    name = 'Pessoa Fictícia',
    email = 'paciente@faisca.test',
    password = 'senha-ficticia-123',
    patient = true,
    therapist = false,
    privacyVersion = PRIVACY_VERSION,
    professionalKind = 'PSICOLOGIA',
  } = overrides;
  return prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      hasPatientProfile: patient,
      hasTherapistProfile: therapist,
      professionalKind: therapist ? professionalKind : null,
      emailConfirmedAt: new Date(),
      privacyAcceptedAt: privacyVersion ? new Date() : null,
      privacyVersion,
    },
  });
}

// Vínculo direto no banco, para testes que não são sobre criar o vínculo. Por padrão, psicóloga com
// todas as áreas liberadas, como os vínculos que já existiam antes da DEC-097.
export function createTestLink(data: {
  patientId: string;
  therapistId: string;
  method?: LinkMethod;
  kind?: ProfessionalKind;
  sharedAreas?: SharedArea[];
  seenByPatientAt?: Date;
}) {
  return prisma.therapistLink.create({
    data: { method: 'CODE', kind: 'PSICOLOGIA', sharedAreas: [...SHARED_AREAS], ...data },
  });
}
