import { z } from 'zod';

// Perfil básico (DEC-061). Os números do CHECK da migration e do front precisam ser iguais.
export const FULL_NAME_MAX = 120;

// Nome completo, opcional: vazio (ou só espaços) apaga, como null.
export const updateProfileSchema = z.strictObject({
  fullName: z
    .string()
    .trim()
    .max(FULL_NAME_MAX, `O nome completo pode ter até ${FULL_NAME_MAX} caracteres.`)
    .transform((value) => (value === '' ? null : value))
    .nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Tipos de imagem aceitos na foto e o tamanho máximo do arquivo enviado. O tipo real é conferido
// pelo conteúdo, no service; o Content-Type só decide se o corpo é lido como imagem.
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = '5mb';
