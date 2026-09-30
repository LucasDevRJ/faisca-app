import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { loggedIn, server } from '../test/server';

describe('/privacidade', () => {
  it('abre sem sessão, com o responsável, o contato, onde ficam os dados e o CVV', async () => {
    renderRoute('/privacidade');

    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de privacidade' })).toBeInTheDocument();
    expect(screen.getByText(/projeto de TCC de Lucas Pereira de Lima/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'lucaspereiradelima2020@gmail.com' })[0]).toHaveAttribute(
      'href',
      'mailto:lucaspereiradelima2020@gmail.com',
    );
    expect(screen.getByText(/Estados Unidos/)).toBeInTheDocument();
    expect(screen.getByText(/CVV, no 188/)).toBeInTheDocument();
  });

  it('abre também com sessão, sem mandar para outra tela', async () => {
    server.use(loggedIn);
    const { router } = renderRoute('/privacidade');

    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de privacidade' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/privacidade');
  });

  it('a tela de entrar e o rodapé do app levam ao aviso', async () => {
    const user = userEvent.setup();
    renderRoute('/entrar');
    expect(await screen.findByRole('link', { name: 'Aviso de privacidade' })).toHaveAttribute('href', '/privacidade');

    server.use(loggedIn);
    renderRoute('/registros');
    await user.click(await screen.findByRole('link', { name: 'Privacidade' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de privacidade' })).toBeInTheDocument();
  });
});
