import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WHY_FAISCA_TEXT } from '../features/auth/why-faisca';
import { renderRoute } from '../test/render';

describe('Por que Faísca?', () => {
  it.each(['/entrar', '/cadastro'])('em %s, começa fechado e abre o porquê do nome', async (path) => {
    renderRoute(path);
    const user = userEvent.setup();

    const summary = await screen.findByText('Por que Faísca?');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');

    await user.click(summary);

    expect(details).toHaveAttribute('open');
    expect(screen.getByText(WHY_FAISCA_TEXT)).toBeInTheDocument();
  });

  it('explica a metáfora sem prometer resultado nem chamar de trabalho acadêmico', () => {
    expect(WHY_FAISCA_TEXT).toContain('ativação comportamental');
    expect(WHY_FAISCA_TEXT).toContain('Terapia Cognitivo-Comportamental');
    expect(WHY_FAISCA_TEXT).not.toMatch(/cura|garant|faculdade|acadêmic/i);
  });
});
