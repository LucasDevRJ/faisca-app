import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';

// Apaga os dados entre testes. deleteMany em vez de TRUNCATE: o faisca_app só tem DML.
export async function resetDatabase() {
  await prisma.authToken.deleteMany();
  await prisma.user.deleteMany();
}

// Usuário fictício já confirmado, para testes que não são sobre o cadastro.
export async function createConfirmedUser(
  overrides: Partial<{ email: string; password: string; patient: boolean; therapist: boolean }> = {},
) {
  const { email = 'paciente@faisca.test', password = 'senha-ficticia-123', patient = true, therapist = false } =
    overrides;
  return prisma.user.create({
    data: {
      name: 'Pessoa Fictícia',
      email,
      passwordHash: await hashPassword(password),
      hasPatientProfile: patient,
      hasTherapistProfile: therapist,
      emailConfirmedAt: new Date(),
    },
  });
}
