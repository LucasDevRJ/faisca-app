import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { PRIVACY_VERSION } from '../modules/auth/auth.service.js';

// Apaga os dados entre testes. deleteMany em vez de TRUNCATE: o faisca_app só tem DML.
export async function resetDatabase() {
  await prisma.activity.deleteMany();
  // As emoções saem em cascata.
  await prisma.thoughtRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.linkCodeAttempt.deleteMany();
  await prisma.linkCode.deleteMany();
  await prisma.linkInvite.deleteMany();
  await prisma.therapistLink.deleteMany();
  await prisma.user.deleteMany();
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
  }> = {},
) {
  const {
    name = 'Pessoa Fictícia',
    email = 'paciente@faisca.test',
    password = 'senha-ficticia-123',
    patient = true,
    therapist = false,
    privacyVersion = PRIVACY_VERSION,
  } = overrides;
  return prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      hasPatientProfile: patient,
      hasTherapistProfile: therapist,
      emailConfirmedAt: new Date(),
      privacyAcceptedAt: privacyVersion ? new Date() : null,
      privacyVersion,
    },
  });
}
