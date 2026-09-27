import { createHash, randomBytes } from 'node:crypto';

// Tokens de link (confirmação de e-mail, redefinição de senha e, depois, convites).
// O texto do token só vai no e-mail; o banco guarda apenas o hash (regra 8 do AGENTS.md).

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256 basta aqui: o token tem 256 bits aleatórios, então não há o que adivinhar.
// (Senha é diferente: tem pouca entropia e por isso usa bcrypt.)
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
