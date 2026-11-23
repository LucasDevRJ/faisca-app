import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { HomeShortcuts, HomeShortcutSettings } from './home-shortcuts';

afterEach(() => localStorage.clear());

it('fixa até três atalhos, separa as contas e restaura o padrão', async () => {
  const user = userEvent.setup();
  const settings = render(<HomeShortcutSettings userId="paciente-ficticia" />);
  for (const name of ['Novo pensamento', 'Nova ação', 'Abrir mensagens']) {
    await user.click(screen.getByRole('checkbox', { name }));
  }
  expect(screen.getByRole('checkbox', { name: 'Sono e humor' })).toBeDisabled();
  settings.unmount();

  const home = render(<MemoryRouter><HomeShortcuts userId="paciente-ficticia" /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Novo pensamento' })).toHaveAttribute('href', '/pensamentos/novo');
  home.unmount();
  const other = render(<MemoryRouter><HomeShortcuts userId="outro-paciente" /></MemoryRouter>);
  expect(screen.queryByRole('navigation', { name: 'Meus atalhos' })).not.toBeInTheDocument();
  other.unmount();

  const reset = render(<HomeShortcutSettings userId="paciente-ficticia" />);
  await user.click(screen.getByRole('button', { name: 'Voltar ao padrão' }));
  reset.unmount();
  render(<MemoryRouter><HomeShortcuts userId="paciente-ficticia" /></MemoryRouter>);
  expect(screen.queryByRole('navigation', { name: 'Meus atalhos' })).not.toBeInTheDocument();
});
