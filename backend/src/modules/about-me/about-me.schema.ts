import { z } from 'zod';

// "Sobre mim" do paciente (DEC-081). Os números do CHECK da migration e do front precisam ser iguais.
export const ABOUT_TEXT_MAX = 2000;

// Campo vazio (ou só espaços) vira null: apaga aquele campo.
const aboutText = z
  .string()
  .trim()
  .max(ABOUT_TEXT_MAX, { error: `Este campo pode ter até ${ABOUT_TEXT_MAX} caracteres.` })
  .transform((value) => (value === '' ? null : value))
  .nullable();

// O PUT manda os três campos: o formulário salva tudo de uma vez.
export const saveAboutMeSchema = z.strictObject({
  aboutMe: aboutText,
  goals: aboutText,
  habits: aboutText,
});

export type SaveAboutMeInput = z.infer<typeof saveAboutMeSchema>;
