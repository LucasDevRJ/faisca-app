import { z } from 'zod';
import { daysBetween, todayInAppZone } from '../../lib/dates.js';

export const SEARCH_TYPES = [
  'ACTIVITY', 'THOUGHT_RECORD', 'TENSION_EPISODE', 'ACTION', 'ABOUT_ME', 'PLAN_ENTRY', 'TASK',
  'SLEEP_MOOD', 'MEDICATION',
] as const;

const date = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

export const recordSearchSchema = z.strictObject({
  term: z.string().trim().min(1, 'Digite o que quer encontrar.').max(120, 'A busca pode ter até 120 caracteres.'),
  types: z.array(z.enum(SEARCH_TYPES)).max(SEARCH_TYPES.length).optional(),
  from: date.optional(),
  to: date.optional(),
  emotion: z.string().trim().min(1).max(50).optional(),
  minIntensity: z.int().min(0).max(10).optional(),
  onlyUnread: z.boolean().optional(),
  page: z.int().min(1).max(500).default(1),
  pageSize: z.int().min(1).max(50).default(20),
}).refine(({ from, to }) => (from === undefined) === (to === undefined), {
  error: 'Informe as duas datas do período.', path: ['to'],
}).refine(({ from, to }) => !from || !to || from <= to, {
  error: 'A data final deve ser igual ou posterior à inicial.', path: ['to'],
}).refine(({ from, to }) => !from || !to || daysBetween(from, to) <= 366, {
  error: 'O período pode ter até 367 dias.', path: ['to'],
}).refine(({ to }) => !to || to <= todayInAppZone(), {
  error: 'A data final não pode estar no futuro.', path: ['to'],
});

export type RecordSearchInput = z.infer<typeof recordSearchSchema>;
export type SearchType = (typeof SEARCH_TYPES)[number];
