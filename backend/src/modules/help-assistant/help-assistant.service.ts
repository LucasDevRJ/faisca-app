import { prisma } from '../../lib/prisma.js';
import { dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { AppError } from '../../errors/app-error.js';
import { HELP_GUIDE, HELP_GUIDE_VERSION } from './help-guide.js';
import { helpAnswerSchema, type HelpQuestion } from './help-assistant.schema.js';
import type { HelpProvider } from './help-provider.js';

export function createHelpAssistantService(provider: HelpProvider) {
  return {
    async ask(userId: string, input: HelpQuestion) {
      const day = dateOnlyToDate(todayInAppZone());
      // Reserva compartilhada pelas réplicas, antes da chamada. Falhas consomem tentativa.
      await prisma.$transaction(async (tx) => {
        await tx.helpAssistantUsage.createMany({
          data: { userId, day, consentVersion: input.consentVersion }, skipDuplicates: true,
        });
        const reserved = await tx.helpAssistantUsage.updateMany({
          where: { userId, day, count: { lt: 10 } },
          data: { count: { increment: 1 }, consentVersion: input.consentVersion, consentedAt: new Date() },
        });
        if (reserved.count !== 1) throw new AppError(429, 'HELP_DAILY_LIMIT', 'Você já usou as 10 perguntas de hoje. O guia continua disponível. Tente novamente amanhã.');
        const cutoff = new Date(day);
        cutoff.setUTCDate(cutoff.getUTCDate() - 30);
        await tx.helpAssistantUsage.deleteMany({ where: { userId, day: { lt: cutoff } } });
      });
      const result = helpAnswerSchema.parse(await provider(input.question));
      const sections = [...new Set(result.sources)].map((id) => {
        const section = HELP_GUIDE.find((item) => item.id === id);
        if (!section) throw new AppError(503, 'HELP_INVALID_SOURCE', 'Não foi possível conferir a resposta. Consulte o guia Como funciona.');
        return section;
      });
      // Exibir só orientações aprovadas do guia impede que texto livre do modelo introduza
      // passos inventados ou recomendações clínicas mesmo quando ele aponta uma fonte válida.
      const answer = sections.length ? sections.map((section) => section.text).join('\n\n') : 'Não encontrei uma orientação no guia para essa pergunta. Para dúvidas sobre o aplicativo, procure suporte@minhafaisca.com.br. Para questões de tratamento, converse com sua profissional.';
      const sources = sections.map((section) => ({ title: section.title, href: `/como-funciona#${section.id}` }));
      return { answer, sources, guideVersion: HELP_GUIDE_VERSION };
    },
  };
}
