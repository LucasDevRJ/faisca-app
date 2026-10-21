import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextAreaField, TextField } from './text-field';

function field(value: string) {
  return <TextAreaField label="Situação" value={value} limit={5000} onChange={() => {}} />;
}

describe('contador do limite de texto (DEC-053)', () => {
  it('não aparece longe do limite', () => {
    render(field('x'.repeat(3999)));

    expect(screen.queryByText(/caracteres/)).not.toBeInTheDocument();
  });

  it('aparece perto do limite e fica ligado ao campo', () => {
    render(field('x'.repeat(4850)));

    expect(screen.getByText('4.850 de 5.000 caracteres')).toBeInTheDocument();
    expect(screen.getByLabelText('Situação')).toHaveAccessibleDescription('4.850 de 5.000 caracteres');
  });

  it('não corta o texto: mostra quanto passou do limite', () => {
    render(field('x'.repeat(5120)));

    expect(screen.getByLabelText('Situação')).not.toHaveAttribute('maxlength');
    expect(screen.getByText('5.120 de 5.000 caracteres (passou 120)')).toBeInTheDocument();
  });
});

describe('erro do campo (DEC-059)', () => {
  it('vem com ícone, fica ligado ao campo e não depende só da cor', () => {
    const { container } = render(<TextField label="E-mail" value="paula@" onChange={() => {}} error="Confira o e-mail." />);

    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Confira o e-mail.');
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });
});
