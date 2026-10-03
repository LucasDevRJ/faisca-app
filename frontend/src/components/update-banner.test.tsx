import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './update-banner';

describe('faixa de versão nova (DEC-041)', () => {
  it('avisa e deixa a pessoa escolher entre atualizar e deixar para depois', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateBanner updating={false} onUpdate={onUpdate} onDismiss={onDismiss} />);

    expect(screen.getByRole('status')).toHaveTextContent('Tem uma versão nova do Faísca.');
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(onUpdate).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('durante a atualização, o botão fica desabilitado', () => {
    render(<UpdateBanner updating onUpdate={() => {}} onDismiss={() => {}} />);

    expect(screen.getByRole('button', { name: 'Atualizando…' })).toBeDisabled();
  });
});
