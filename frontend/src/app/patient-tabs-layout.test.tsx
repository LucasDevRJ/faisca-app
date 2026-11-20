import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { loggedIn, server } from '../test/server';

describe('PatientTabsLayout', () => {
  beforeEach(() => server.use(loggedIn));

  it('mantém Meus Planos no tamanho do conteúdo quando fica sozinho na linha', async () => {
    renderRoute('/planos');

    const plansTab = await screen.findByRole('link', { name: 'Meus Planos' });
    expect(plansTab).toHaveClass('sm:flex-none');
    expect(plansTab).not.toHaveClass('sm:flex-auto');
  });
});
