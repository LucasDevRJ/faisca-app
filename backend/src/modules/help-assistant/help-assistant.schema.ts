import { z } from 'zod';

export const HELP_CONSENT_VERSION = 'help-2026-11-27';
export const helpQuestionSchema = z.strictObject({
  question: z.string().trim().min(3).max(500),
  consentVersion: z.literal(HELP_CONSENT_VERSION),
  accepted: z.literal(true),
});
export const helpAnswerSchema = z.object({
  sources: z.array(z.string().min(1).max(80)).max(4),
});
export type HelpQuestion = z.infer<typeof helpQuestionSchema>;
export type HelpAnswer = z.infer<typeof helpAnswerSchema>;
