import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { LoginForm } from '@/app/login/login-form';

function renderForm(props: Partial<Parameters<typeof LoginForm>[0]> = {}) {
  const action = props.action ?? vi.fn();
  return {
    action,
    ...render(createElement(LoginForm, { action, ...props })),
  };
}

describe('<LoginForm />', () => {
  it('renderiza campos E-mail, Senha e botão Entrar em PT-BR', () => {
    renderForm();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });

  it('inputs têm os atributos certos (type e autoComplete)', () => {
    renderForm();
    const email = screen.getByLabelText(/e-mail/i) as HTMLInputElement;
    const senha = screen.getByLabelText(/senha/i) as HTMLInputElement;
    expect(email.type).toBe('email');
    expect(senha.type).toBe('password');
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(senha.getAttribute('autocomplete')).toBe('current-password');
  });

  it('exibe mensagem de erro quando defaultError é fornecido', () => {
    renderForm({ defaultError: 'Credenciais inválidas' });
    expect(screen.getByRole('alert')).toHaveTextContent(/credenciais inválidas/i);
  });

  it('submit com campos vazios não chama a ação e mostra validação', async () => {
    const { action } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(action).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/preencha/i);
  });

  it('submit com e-mail e senha preenchidos chama a ação', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    renderForm({ action });
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@x.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'Senha1234!');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('exibe erro retornado pela ação após submit', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Credenciais inválidas' });
    renderForm({ action });
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@x.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'SenhaErrada!');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/credenciais inválidas/i);
  });
});
