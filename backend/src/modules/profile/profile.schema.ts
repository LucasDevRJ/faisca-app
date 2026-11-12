import { z } from 'zod';
import { professionalKindSchema } from '../links/links.schema.js';

// Perfil básico (DEC-061). Os números do CHECK da migration e do front precisam ser iguais.
export const FULL_NAME_MAX = 120;
// CRP ou CRM (DEC-097): o mesmo número do CHECK da migration.
export const COUNCIL_NUMBER_MAX = 30;

// As paletas de cores (DEC-063), na mesma ordem do enum Palette do schema.prisma.
export const PALETTES = ['SALVIA', 'LAVANDA', 'OCEANO', 'AREIA', 'ALTO_CONTRASTE'] as const;

// Ajustes de acessibilidade (DEC-076, issue #87): abertos a todos, desligados por padrão. Cada
// campo é opcional no PATCH, para mudar só o que vier.
export const accessibilitySchema = z
  .strictObject({
    directLanguage: z.boolean().optional(),
    oneThingAtATime: z.boolean().optional(),
    comfortableReading: z.boolean().optional(),
    noTimePressure: z.boolean().optional(),
    reducedMotion: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { error: 'Escolha ao menos um ajuste de acessibilidade.' });

// Cada campo é opcional: o PATCH muda só o que vier. Nome completo vazio (ou só espaços) apaga,
// como null.
export const updateProfileSchema = z.strictObject({
  fullName: z
    .string()
    .trim()
    .max(FULL_NAME_MAX, `O nome completo pode ter até ${FULL_NAME_MAX} caracteres.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
  palette: z.enum(PALETTES, { error: 'Escolha uma das paletas do Faísca.' }).optional(),
  accessibility: accessibilitySchema.optional(),
  // Só para quem tem o perfil de terapeuta (DEC-097). Conselho vazio (ou só espaços) apaga.
  professional: z
    .strictObject({
      kind: professionalKindSchema.optional(),
      councilNumber: z
        .string()
        .trim()
        .max(COUNCIL_NUMBER_MAX, `O número do conselho pode ter até ${COUNCIL_NUMBER_MAX} caracteres.`)
        .transform((value) => (value === '' ? null : value))
        .nullable()
        .optional(),
    })
    .refine((input) => Object.keys(input).length > 0, { error: 'Envie o tipo ou o número do conselho.' })
    .optional(),
})
  // Corpo vazio não muda nada: provavelmente é um engano de quem chamou.
  .refine((input) => Object.keys(input).length > 0, { error: 'Envie o nome completo, a paleta, os ajustes de acessibilidade ou os dados de profissional.' });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Tipos de imagem aceitos na foto e o tamanho máximo do arquivo enviado. O tipo real é conferido
// pelo conteúdo, no service; o Content-Type só decide se o corpo é lido como imagem.
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = '5mb';
