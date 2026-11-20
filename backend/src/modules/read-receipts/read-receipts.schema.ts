import { z } from 'zod';

// "Lido" para o paciente (SPEC, "Lido para o paciente"; DEC-117).

// O paciente liga ou desliga o pedido para uma profissional.
export const requestBodySchema = z.strictObject({
  requested: z.boolean({ error: 'Diga se quer ver as leituras.' }),
});

// A profissional ativa (true) ou responde "Agora não" e desliga (false).
export const shareBodySchema = z.strictObject({
  shared: z.boolean({ error: 'Diga se quer mostrar as suas leituras.' }),
});
