import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAiHelpProvider } from './help-provider.js';
import { HELP_GUIDE, HELP_PAGE_FINGERPRINT } from './help-guide.js';

const completed = (text: string) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text }] }] });
describe('integração limitada ao guia', () => {
  it('envia somente a pergunta e o guia, com armazenamento desligado e limite de saída', async () => {
    const fetcher = vi.fn(async () => completed(JSON.stringify({ answer: 'Consulte a seção de vínculo.', sources: ['vinculo'] })));
    const provider = createOpenAiHelpProvider('chave-ficticia', 'modelo-ficticio', fetcher);
    expect((await provider('Como liberar uma área?')).sources).toEqual(['vinculo']);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body as string);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(300);
    expect(body.input).toEqual([{ role: 'user', content: 'Como liberar uma área?' }]);
    expect(body.tools).toBeUndefined();
    expect(body.previous_response_id).toBeUndefined();
  });
  it.each([new Response('detalhes privados', { status: 429 }), completed('resposta inválida'), Response.json({ status: 'incomplete' })])('normaliza erro do provedor sem devolver conteúdo privado', async (response) => {
    const provider = createOpenAiHelpProvider('chave-ficticia', 'modelo-ficticio', async () => response);
    await expect(provider('Pergunta fictícia')).rejects.toMatchObject({ code: 'HELP_UNAVAILABLE', statusCode: 503 });
  });
  it('todas as fontes levam a seções existentes do guia público', () => {
    const page = readFileSync('../frontend/src/pages/how-it-works-page.tsx', 'utf8');
    expect(createHash('sha256').update(page.replace(/\r\n/g, '\n')).digest('hex')).toBe(HELP_PAGE_FINGERPRINT);
    for (const section of HELP_GUIDE) expect(page).toContain(`id="${section.id}"`);
  });
});
