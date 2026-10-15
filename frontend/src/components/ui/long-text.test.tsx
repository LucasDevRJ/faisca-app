import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LongText } from './long-text';

describe('texto longo nos cartões (DEC-053)', () => {
  it('texto curto aparece inteiro, sem "Ver mais"', () => {
    render(<LongText text={'a'.repeat(700)} />);

    expect(screen.getByText('a'.repeat(700))).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('texto longo abre recolhido e expande com "Ver mais"', async () => {
    const user = userEvent.setup();
    const text = `${'palavra '.repeat(100)}FIM`;
    render(<LongText text={text} />);

    const button = screen.getByRole('button', { name: 'Ver mais' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/FIM/)).not.toBeInTheDocument();

    await user.click(button);
    expect(screen.getByText(/FIM/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('o trecho corta no último espaço, sem partir palavra', () => {
    render(<LongText text={'palavra '.repeat(100)} />);

    const preview = screen.getByText(/palavra/).textContent ?? '';
    expect(preview.length).toBeLessThanOrEqual(501);
    expect(preview.endsWith('palavra…')).toBe(true);
  });
});
