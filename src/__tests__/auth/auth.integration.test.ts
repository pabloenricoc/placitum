import { describe, it, expect, vi } from 'vitest';
import {
  authenticateCredentials,
  type AuthCredentialsDeps,
  type UserWithEscritorio,
} from '@/lib/auth/credentials';
import { EscritorioInativoError } from '@/lib/auth/guards';

function makeBaseUser(overrides: Partial<UserWithEscritorio> = {}): UserWithEscritorio {
  return {
    id: 'user-1',
    email: 'ana@escritorio-x.com.br',
    name: 'Ana',
    role: 'ADMIN',
    passwordHash: '$2a$12$hash-fake',
    escritorioId: 'esc-a',
    escritorio: { id: 'esc-a', ativo: true },
    ...overrides,
  };
}

function makeDeps(partial: Partial<AuthCredentialsDeps> = {}): AuthCredentialsDeps {
  return {
    findUserByEmail: vi.fn(),
    verifyPassword: vi.fn(),
    ...partial,
  };
}

describe('authenticateCredentials', () => {
  it('CA-2: retorna AuthenticatedUser em credenciais válidas', async () => {
    const user = makeBaseUser();
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      verifyPassword: vi.fn().mockResolvedValue(true),
    });

    const result = await authenticateCredentials(
      { email: 'ana@escritorio-x.com.br', password: 'Senha1234!' },
      deps,
    );

    expect(result).toMatchObject({
      id: 'user-1',
      email: 'ana@escritorio-x.com.br',
      name: 'Ana',
      role: 'ADMIN',
      escritorioId: 'esc-a',
    });
  });

  it('CA-2: nunca inclui passwordHash no retorno', async () => {
    const user = makeBaseUser();
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      verifyPassword: vi.fn().mockResolvedValue(true),
    });
    const result = await authenticateCredentials(
      { email: user.email, password: 'Senha1234!' },
      deps,
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('CA-2 + edge case: normaliza e-mail antes da consulta', async () => {
    const find = vi.fn().mockResolvedValue(makeBaseUser());
    const deps = makeDeps({
      findUserByEmail: find,
      verifyPassword: vi.fn().mockResolvedValue(true),
    });

    await authenticateCredentials(
      { email: '  ANA@Escritorio-X.COM.BR  ', password: 'Senha1234!' },
      deps,
    );

    expect(find).toHaveBeenCalledWith('ana@escritorio-x.com.br');
  });

  it('CA-3: retorna null quando senha está errada', async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue(makeBaseUser()),
      verifyPassword: vi.fn().mockResolvedValue(false),
    });

    const result = await authenticateCredentials(
      { email: 'ana@escritorio-x.com.br', password: 'Errada1234!' },
      deps,
    );

    expect(result).toBeNull();
  });

  it('CA-3: retorna null quando e-mail não existe, sem chamar verifyPassword (evita timing leak)', async () => {
    const verify = vi.fn();
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      verifyPassword: verify,
    });

    const result = await authenticateCredentials(
      { email: 'ninguem@x.com', password: 'Senha1234!' },
      deps,
    );

    expect(result).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it('entrada com e-mail vazio retorna null sem consultar DB', async () => {
    const find = vi.fn();
    const verify = vi.fn();
    const deps = makeDeps({ findUserByEmail: find, verifyPassword: verify });

    const result = await authenticateCredentials(
      { email: '', password: 'Senha1234!' },
      deps,
    );

    expect(result).toBeNull();
    expect(find).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('entrada com senha vazia retorna null sem consultar DB', async () => {
    const find = vi.fn();
    const deps = makeDeps({ findUserByEmail: find, verifyPassword: vi.fn() });

    const result = await authenticateCredentials(
      { email: 'ana@x.com', password: '' },
      deps,
    );

    expect(result).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it('CA-12 adaptado: lança EscritorioInativoError quando escritorio.ativo=false', async () => {
    const inativo = makeBaseUser({ escritorio: { id: 'esc-a', ativo: false } });
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue(inativo),
      verifyPassword: vi.fn().mockResolvedValue(true),
    });

    await expect(
      authenticateCredentials(
        { email: 'ana@escritorio-x.com.br', password: 'Senha1234!' },
        deps,
      ),
    ).rejects.toBeInstanceOf(EscritorioInativoError);
  });

  it('CA-13: o resultado carrega escritorioId para a sessão (base do multi-tenant)', async () => {
    const user = makeBaseUser({ escritorioId: 'esc-z' });
    user.escritorio = { id: 'esc-z', ativo: true };
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue(user),
      verifyPassword: vi.fn().mockResolvedValue(true),
    });

    const result = await authenticateCredentials(
      { email: user.email, password: 'Senha1234!' },
      deps,
    );

    expect(result?.escritorioId).toBe('esc-z');
  });
});
