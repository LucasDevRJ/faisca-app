// Usuários fictícios criados pelo backend/scripts/e2e-server.ts a cada execução (regra 5).
export const SEED_PASSWORD = 'senha-ficticia-123';

export const users = {
  patient: { email: 'paciente@faisca.test', password: SEED_PASSWORD },
  therapist: { email: 'terapeuta@faisca.test', password: SEED_PASSWORD },
  bothProfiles: { email: 'dois-perfis@faisca.test', password: SEED_PASSWORD },
  // Usada só nos testes de atividades no navegador (e2e/activities.spec.ts).
  records: { email: 'registros@faisca.test', password: SEED_PASSWORD },
  // Usadas só nos testes de vínculo (api/links.spec.ts).
  linkPatient: { email: 'vinculo-paciente@faisca.test', password: SEED_PASSWORD },
  linkTherapist: { email: 'vinculo-terapeuta@faisca.test', password: SEED_PASSWORD },
  // Usada só no teste de excluir a conta (e2e/account.spec.ts): some durante o teste.
  toDelete: { email: 'excluir@faisca.test', password: SEED_PASSWORD },
  // Usadas só nos testes do Registro de Pensamentos (api/thought-records.spec.ts). Começam sem o
  // aceite da versão atual do aviso de privacidade, como as contas de antes do RPD.
  rpdPatient: { email: 'rpd-paciente@faisca.test', password: SEED_PASSWORD },
  rpdTherapist: { email: 'rpd-terapeuta@faisca.test', password: SEED_PASSWORD },
  // Usadas só nas telas do Registro de Pensamentos (e2e/thought-records.spec.ts), também sem o aceite.
  rpdScreenPatient: { email: 'rpd-tela-paciente@faisca.test', password: SEED_PASSWORD },
  rpdScreenTherapist: { email: 'rpd-tela-terapeuta@faisca.test', password: SEED_PASSWORD },
  // Usadas só nos testes dos Episódios de tensão (api/tension-episodes.spec.ts). Já aceitaram a
  // versão do aviso do RPD, mas não a que cita os episódios (DEC-042).
  tensionPatient: { email: 'tensao-paciente@faisca.test', password: SEED_PASSWORD },
  tensionTherapist: { email: 'tensao-terapeuta@faisca.test', password: SEED_PASSWORD },
  // Usadas só nas telas dos Episódios de tensão (e2e/tension-episodes.spec.ts), também com a versão do RPD.
  tensionScreenPatient: { email: 'tensao-tela-paciente@faisca.test', password: SEED_PASSWORD },
  tensionScreenTherapist: { email: 'tensao-tela-terapeuta@faisca.test', password: SEED_PASSWORD },
  // Usadas só nos testes da agenda (api/appointments.spec.ts). Já aceitaram a versão dos episódios,
  // mas não a que cita a agenda (DEC-045).
  agendaPatient: { email: 'agenda-paciente@faisca.test', password: SEED_PASSWORD },
  agendaTherapist: { email: 'agenda-terapeuta@faisca.test', password: SEED_PASSWORD },
} as const;
