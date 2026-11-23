import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { HomeLayoutSettings } from './home-layout';
import { readHomeLayout } from './home-layout-storage';

afterEach(() => localStorage.clear());

it('reordena pelo teclado, salva por conta e restaura o padrão', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><HomeLayoutSettings userId="paciente-ficticio" /></MemoryRouter>);
  const move = screen.getByRole('button', { name: 'Subir: Consultas' });
  move.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('Consultas agora está na posição 1.');
  const down = screen.getByRole('button', { name: 'Descer: Consultas' });
  down.focus();
  await user.keyboard('{Enter}');
  expect(down).toHaveFocus();
  await user.click(move);
  await user.click(screen.getByRole('checkbox', { name: 'Avisos' }));
  expect(screen.getByRole('link', { name: 'Abrir Avisos' })).toHaveAttribute('href', '/avisos');
  await user.click(screen.getByRole('checkbox', { name: /gráfico de atividades recolhido/ }));
  expect(readHomeLayout('paciente-ficticio')).toEqual({
    order: ['appointments', 'notices', 'sleep'], hidden: ['notices'], collapseChart: true,
  });
  expect(readHomeLayout('outra-conta').hidden).toEqual([]);

  await user.click(screen.getByRole('button', { name: 'Restaurar cartões ao padrão' }));
  expect(readHomeLayout('paciente-ficticio')).toEqual({
    order: ['notices', 'appointments', 'sleep'], hidden: [], collapseChart: false,
  });
});
