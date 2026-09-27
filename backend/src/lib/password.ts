import bcrypt from 'bcryptjs';

// Custo 12: ~250 ms por hash, lento para ataque de força bruta e aceitável no login.
const COST = 12;

// Hash de uma senha qualquer, usado quando o e-mail não existe no login. Assim a resposta
// demora o mesmo tanto nos dois casos e o tempo não revela quais e-mails têm conta.
const DUMMY_HASH = bcrypt.hashSync('faisca-senha-inexistente', COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH).then((ok) => ok && hash !== undefined);
}
