import { env } from '../../config/env.js';
import { createOpenAiHelpProvider } from './help-provider.js';

export function configuredHelpProvider() {
  if (env.HELP_ASSISTANT_ENABLED !== 'true' || env.HELP_ASSISTANT_RETENTION_CONFIRMED !== 'true' || !env.OPENAI_API_KEY || env.OPENAI_API_KEY.startsWith('CHANGE_ME') || !env.HELP_ASSISTANT_MODEL) return undefined;
  return createOpenAiHelpProvider(env.OPENAI_API_KEY, env.HELP_ASSISTANT_MODEL);
}
