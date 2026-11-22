import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderRoute } from '../test/render';

describe('/como-funciona', () => {
  it('abre sem sessão e oferece links para as seções e para entrar/cadastrar', async () => {
    renderRoute('/como-funciona');

    expect(await screen.findByRole('heading', { level: 1, name: 'Como funciona o Faísca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tensão' })).toHaveAttribute('href', '#tensao');
    expect(screen.getByRole('link', { name: 'Meus Planos' })).toHaveAttribute('href', '#planos');
    expect(screen.getAllByRole('link', { name: /^Entrar$/ })[0]).toHaveAttribute('href', '/entrar');
    expect(screen.getAllByRole('link', { name: /^Criar conta$/ })[0]).toHaveAttribute('href', '/cadastro');
  });

  it('pode ser aberta a partir das telas de entrar e cadastro', async () => {
    const login = renderRoute('/entrar');
    expect(await screen.findByRole('link', { name: 'Como funciona o Faísca' })).toHaveAttribute('href', '/como-funciona');
    login.unmount();

    renderRoute('/cadastro');
    expect(await screen.findByRole('link', { name: 'Como funciona o Faísca' })).toHaveAttribute('href', '/como-funciona');
  });

  it('explica permissões por área, instalação, exclusão e privacidade', async () => {
    renderRoute('/como-funciona#vinculo');

    expect(await screen.findByRole('heading', { name: 'Vínculo e privacidade' })).toBeInTheDocument();
    expect(screen.getByText(/A profissional só lê as áreas liberadas enquanto o vínculo estiver ativo/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instalar no celular' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ditar em vez de digitar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teclado Samsung (Android)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gboard (Android)' })).toBeInTheDocument();
    expect(screen.getAllByText('Na dúvida, converse com a sua psicóloga.')).toHaveLength(11);
    expect(screen.getByText(/A exclusão dos dados no app é imediata/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ler o aviso de privacidade' })).toHaveAttribute('href', '/privacidade');
  });

  it('marca a data das capturas de tela e deixa claro que os dados são fictícios', async () => {
    renderRoute('/como-funciona');

    expect(await screen.findAllByText(/captura feita em 22\/11\/2026/)).toHaveLength(2);
    expect(screen.getByText(/Nomes e dados são fictícios/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Quem me acompanha em Conta/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Meus pacientes mostrando onde/ })).toBeInTheDocument();
  });
});
