import { api } from '../../lib/api';
import type { WithRead } from '../therapist/read-marks-api';

// "Sobre mim" do paciente (DEC-081, DEC-082). O backend decide o dono pela sessão: o front nunca
// manda id de usuário. Tudo opcional; salvar os três campos vazios apaga.

// Igual ao da API e ao CHECK do banco.
export const ABOUT_TEXT_MAX = 2000;

export type AboutMe = {
  id: string;
  aboutMe: string | null;
  goals: string | null;
  habits: string | null;
  updatedAt: string;
};

export type AboutMeField = 'aboutMe' | 'goals' | 'habits';
export type SaveAboutMeInput = Record<AboutMeField, string | null>;

// Os três campos, na ordem da tela. Textos aprovados pelo usuário (DEC-082).
export const ABOUT_FIELDS: { key: AboutMeField; label: string; hint: string }[] = [
  {
    key: 'aboutMe',
    label: 'Sobre mim',
    hint: 'Conte o que quiser sobre você: rotina, o que gosta, o que é importante para você.',
  },
  {
    key: 'goals',
    label: 'O que eu gostaria de trabalhar',
    hint: 'Escreva com as suas palavras ou toque numa sugestão.',
  },
  {
    key: 'habits',
    label: 'Hábitos que quero deixar (ou já deixei)',
    hint: 'Por exemplo: ficar no celular até tarde, roer unha, fumar.',
  },
];

// Sugestões de "O que eu gostaria de trabalhar": tocar insere o texto no campo, que continua
// editável. Nada é guardado como rótulo (DEC-081).
export const GOAL_SUGGESTIONS = [
  'Ansiedade',
  'Tristeza ou desânimo',
  'Autoestima',
  'Relacionamentos',
  'Socializar',
  'Trabalho ou estudos',
  'Sono',
  'Rotina e organização',
  'Lidar com a raiva',
  'Luto',
];

export async function fetchAboutMe(): Promise<AboutMe | null> {
  const { data } = await api.get<{ aboutMe: AboutMe | null }>('/about-me');
  return data.aboutMe;
}

export async function saveAboutMe(input: SaveAboutMeInput): Promise<AboutMe | null> {
  const { data } = await api.put<{ aboutMe: AboutMe | null }>('/about-me', input);
  return data.aboutMe;
}

// Visão da terapeuta: só leitura, com o status de leitura dela.
export async function fetchPatientAboutMe(patientId: string): Promise<WithRead<AboutMe> | null> {
  const { data } = await api.get<{ aboutMe: WithRead<AboutMe> | null }>(`/therapist/patients/${patientId}/about-me`);
  return data.aboutMe;
}
