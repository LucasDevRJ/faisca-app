import { z } from 'zod';

// Normaliza antes de validar: "  Ana@Exemplo.com " e "ana@exemplo.com" são a mesma conta.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }).max(254));

// Política da DEC-025: mínimo de 8 caracteres, sem exigir símbolos (recomendação do NIST).
// O bcrypt ignora o que passa de 72 bytes, então o limite é em bytes, não em caracteres.
const newPasswordSchema = z
  .string()
  .min(8, { error: 'A senha precisa ter pelo menos 8 caracteres.' })
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    error: 'A senha está longa demais.',
  });

const tokenSchema = z.string().min(1).max(200);

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Conta pra gente como podemos te chamar.' })
    .max(100, { error: 'O nome pode ter até 100 caracteres.' }),
  email: emailSchema,
  password: newPasswordSchema,
  profiles: z
    .object({ patient: z.boolean(), therapist: z.boolean() })
    .refine((p) => p.patient || p.therapist, { error: 'Escolha pelo menos um perfil.' }),
});

// No login a senha não passa pela política: contas antigas podem ter regras diferentes.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const tokenOnlySchema = z.object({ token: tokenSchema });

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: newPasswordSchema,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
