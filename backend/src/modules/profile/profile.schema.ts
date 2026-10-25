import { z } from 'zod';

// Perfil básico (DEC-061). Os números do CHECK da migration e do front precisam ser iguais.
export const FULL_NAME_MAX = 120;

// As paletas de cores (DEC-063), na mesma ordem do enum Palette do schema.prisma.
export const PALETTES = ['SALVIA', 'LAVANDA', 'OCEANO', 'AREIA', 'ALTO_CONTRASTE'] as const;

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
})
  // Corpo vazio não muda nada: provavelmente é um engano de quem chamou.
  .refine((input) => Object.keys(input).length > 0, { error: 'Envie o nome completo ou a paleta.' });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Tipos de imagem aceitos na foto e o tamanho máximo do arquivo enviado. O tipo real é conferido
// pelo conteúdo, no service; o Content-Type só decide se o corpo é lido como imagem.
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = '5mb';
