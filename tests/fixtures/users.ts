// Usuários fictícios criados pelo backend/scripts/e2e-server.ts a cada execução (regra 5).
export const SEED_PASSWORD = 'senha-ficticia-123';

export const users = {
  patient: { email: 'paciente@faisca.test', password: SEED_PASSWORD },
  therapist: { email: 'terapeuta@faisca.test', password: SEED_PASSWORD },
  bothProfiles: { email: 'dois-perfis@faisca.test', password: SEED_PASSWORD },
  // Usada só nos testes de atividades no navegador (e2e/activities.spec.ts).
  records: { email: 'registros@faisca.test', password: SEED_PASSWORD },
} as const;
