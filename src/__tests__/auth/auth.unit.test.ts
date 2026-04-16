import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '@/lib/auth/email';
import { passwordSchema, validatePasswordShape } from '@/lib/auth/password';
import { assertEscritorioAtivo, EscritorioInativoError } from '@/lib/auth/guards';
import { isPublicRoute } from '@/lib/auth/routes';

describe('normalizeEmail (edge case spec §7)', () => {
  it('faz lowercase', () => {
    expect(normalizeEmail('Ana@Escritorio.com')).toBe('ana@escritorio.com');
  });

  it('faz trim de espaços em volta', () => {
    expect(normalizeEmail('  ana@x.com  ')).toBe('ana@x.com');
  });

  it('combina trim + lowercase + remove \\n', () => {
    expect(normalizeEmail('  Ana@X.COM\n')).toBe('ana@x.com');
  });
});

describe('passwordSchema (RN-3)', () => {
  it('rejeita senha com menos de 10 caracteres', () => {
    expect(passwordSchema.safeParse('Aa1xxxx').success).toBe(false);
  });

  it('rejeita senha só com números', () => {
    expect(passwordSchema.safeParse('1234567890').success).toBe(false);
  });

  it('rejeita senha só com letras', () => {
    expect(passwordSchema.safeParse('abcdefghij').success).toBe(false);
  });

  it('aceita senha com 10+ chars, ao menos 1 letra e 1 número', () => {
    expect(passwordSchema.safeParse('Senha1234!').success).toBe(true);
  });
});

describe('validatePasswordShape', () => {
  it('retorna ok=true para senha válida', () => {
    const r = validatePasswordShape('Senha1234!');
    expect(r.ok).toBe(true);
  });

  it('retorna ok=false com mensagem para senha inválida', () => {
    const r = validatePasswordShape('abc');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(typeof r.message).toBe('string');
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});

describe('assertEscritorioAtivo (CA-12 adaptado)', () => {
  it('não lança quando escritório está ativo', () => {
    expect(() => assertEscritorioAtivo({ ativo: true })).not.toThrow();
  });

  it('lança EscritorioInativoError quando escritório está inativo', () => {
    expect(() => assertEscritorioAtivo({ ativo: false })).toThrow(EscritorioInativoError);
  });
});

describe('isPublicRoute (CA-11)', () => {
  it('trata /login como pública', () => {
    expect(isPublicRoute('/login')).toBe(true);
  });

  it('trata rotas de auth do NextAuth como públicas', () => {
    expect(isPublicRoute('/api/auth/callback/credentials')).toBe(true);
    expect(isPublicRoute('/api/auth/session')).toBe(true);
  });

  it('trata /dashboard como protegida', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('trata / como protegida (redireciona a partir do middleware)', () => {
    expect(isPublicRoute('/')).toBe(false);
  });

  it('trata /publicacoes e /peças como protegidas', () => {
    expect(isPublicRoute('/publicacoes')).toBe(false);
    expect(isPublicRoute('/pecas')).toBe(false);
  });
});
