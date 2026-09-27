// Validação no navegador, com as mesmas regras do backend (DEC-025). Serve só para
// avisar antes de enviar; quem decide é sempre a API.

export const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (!value) return 'Informe seu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Informe um e-mail válido.';
  return undefined;
}

export function validateNewPassword(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'A senha está longa demais.';
  return undefined;
}
