import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { HighlightSetting } from './highlight-setting';
import { readHighlight } from './highlight';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.highlight;
  delete document.documentElement.dataset.highlightPreview;
});

it('descarta a prévia ao sair e permite salvar e restaurar por conta', async () => {
  const user = userEvent.setup();
  const root = document.documentElement;
  const first = render(<HighlightSetting userId="conta-ficticia" highContrast={false} />);
  await user.click(screen.getByRole('radio', { name: 'Terracota' }));
  expect(root.dataset.highlightPreview).toBe('terracotta');
  expect(readHighlight('conta-ficticia')).toBe('palette');
  first.unmount();
  expect(root.dataset.highlightPreview).toBeUndefined();

  render(<HighlightSetting userId="conta-ficticia" highContrast={false} />);
  await user.click(screen.getByRole('radio', { name: 'Azul oceano' }));
  await user.click(screen.getByRole('button', { name: 'Salvar cor de destaque' }));
  expect(root.dataset.highlight).toBe('ocean');
  expect(readHighlight('outra-conta')).toBe('palette');
  await user.click(screen.getByRole('radio', { name: 'Cor da paleta' }));
  await user.click(screen.getByRole('button', { name: 'Salvar cor de destaque' }));
  expect(readHighlight('conta-ficticia')).toBe('palette');
});

it('preserva o Alto contraste', () => {
  render(<HighlightSetting userId="conta-ficticia" highContrast />);
  expect(screen.getByRole('radio', { name: 'Azul oceano' })).toBeDisabled();
});
