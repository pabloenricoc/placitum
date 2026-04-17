import { describe, it, expect } from 'vitest';
import { sanitizarParaIA } from '@/lib/analise-ia/sanitizar';
import { respostaIASchema } from '@/lib/analise-ia/schema';
import { normalizarConfianca } from '@/lib/analise-ia/normalizar';
import { calcularDataLimite } from '@/lib/prazos/calcular-prazo';
import { calcularCustoBrl } from '@/lib/analise-ia/precos';

function ymd(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

describe('sanitizarParaIA (RN-4)', () => {
  it('CA-4: mascara CPF formatado', () => {
    const out = sanitizarParaIA('Fulano da Silva, CPF 123.456.789-00, foi intimado');
    expect(out).toBe('Fulano da Silva, CPF [CPF], foi intimado');
    expect(out).not.toMatch(/123\.456\.789-00/);
  });

  it('CA-5: mascara CNPJ formatado', () => {
    const out = sanitizarParaIA('CNPJ 12.345.678/0001-90');
    expect(out).toBe('CNPJ [CNPJ]');
  });

  it('CA-5: mascara e-mail', () => {
    const out = sanitizarParaIA('contato: fulano.silva+tag@escritorio.com.br');
    expect(out).toContain('[EMAIL]');
    expect(out).not.toMatch(/fulano\.silva/);
  });

  it('CA-5: mascara telefone BR', () => {
    const out = sanitizarParaIA('tel (85) 99999-9999');
    expect(out).toContain('[TELEFONE]');
  });

  it('não confunde número de processo com CPF', () => {
    const out = sanitizarParaIA('Processo 0001234-56.2024.8.26.0100');
    expect(out).toContain('0001234-56.2024.8.26.0100');
    expect(out).not.toContain('[CPF]');
  });

  it('idempotente em texto sem PII', () => {
    const t = 'Vistos, relatados e discutidos estes autos.';
    expect(sanitizarParaIA(t)).toBe(t);
  });
});

describe('respostaIASchema', () => {
  const valido = {
    numeroProcesso: '0001234-56.2024.8.26.0100',
    vara: '3ª Vara Cível',
    comarca: 'São Paulo',
    estado: 'SP',
    tipoDecisao: 'CITACAO',
    resumo: 'Citação para contestar.',
    partes: { autor: 'A', reu: 'B' },
    parteCliente: 'B',
    areaDireito: 'CIVEL',
    prazo: { tipoProvidencia: 'CONTESTACAO', dias: 15, tipoContagem: 'UTEIS' },
    urgencia: 'ALTA',
    confianca: 'ALTA',
  };

  it('aceita payload válido', () => {
    expect(respostaIASchema.safeParse(valido).success).toBe(true);
  });

  it('rejeita prazo.dias = 0', () => {
    const bad = { ...valido, prazo: { ...valido.prazo, dias: 0 } };
    expect(respostaIASchema.safeParse(bad).success).toBe(false);
  });

  it('rejeita areaDireito fora do enum', () => {
    const bad = { ...valido, areaDireito: 'PENAL' };
    expect(respostaIASchema.safeParse(bad).success).toBe(false);
  });

  it('aceita confianca numérica', () => {
    const ok = { ...valido, confianca: 0.92 };
    expect(respostaIASchema.safeParse(ok).success).toBe(true);
  });
});

describe('normalizarConfianca', () => {
  it('string ALTA preserva', () => {
    expect(normalizarConfianca('ALTA')).toBe('ALTA');
  });

  it('case-insensitive', () => {
    expect(normalizarConfianca('media')).toBe('MEDIA');
  });

  it('número >= 0.85 → ALTA', () => {
    expect(normalizarConfianca(0.95)).toBe('ALTA');
  });

  it('número entre 0.6 e 0.85 → MEDIA', () => {
    expect(normalizarConfianca(0.7)).toBe('MEDIA');
  });

  it('número baixo → BAIXA', () => {
    expect(normalizarConfianca(0.3)).toBe('BAIXA');
  });

  it('valor inválido → BAIXA', () => {
    expect(normalizarConfianca('xyz' as unknown as string)).toBe('BAIXA');
  });
});

describe('calcularDataLimite (CA-10 a CA-13)', () => {
  it('CA-10: 15 dias úteis a partir de sexta 2026-04-10, sem feriados', () => {
    const out = calcularDataLimite({
      dataInicio: ymd('2026-04-10'),
      dias: 15,
      tipoContagem: 'UTEIS',
      feriados: [],
    });
    expect(out.toISOString().slice(0, 10)).toBe('2026-05-04');
  });

  it('CA-11: 5 dias úteis a partir de quinta 2026-04-16 com feriado nacional na terça', () => {
    const out = calcularDataLimite({
      dataInicio: ymd('2026-04-16'),
      dias: 5,
      tipoContagem: 'UTEIS',
      feriados: [ymd('2026-04-21')],
    });
    expect(out.toISOString().slice(0, 10)).toBe('2026-04-24');
  });

  it('CA-12: prorroga quando dataLimite cai em fim de semana', () => {
    const out = calcularDataLimite({
      dataInicio: ymd('2026-04-10'),
      dias: 1,
      tipoContagem: 'UTEIS',
      feriados: [],
    });
    expect([0, 6]).not.toContain(out.getUTCDay());
  });

  it('CA-13: 5 dias corridos de sexta 2026-04-10 cai em quarta 2026-04-15', () => {
    const out = calcularDataLimite({
      dataInicio: ymd('2026-04-10'),
      dias: 5,
      tipoContagem: 'CORRIDOS',
      feriados: [],
    });
    expect(out.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('prorroga quando dia final cai em feriado', () => {
    const out = calcularDataLimite({
      dataInicio: ymd('2026-09-01'),
      dias: 4,
      tipoContagem: 'CORRIDOS',
      feriados: [ymd('2026-09-07')],
    });
    expect(out.toISOString().slice(0, 10)).not.toBe('2026-09-07');
  });
});

describe('calcularCustoBrl', () => {
  it('retorna 0 para usage zero', () => {
    const c = calcularCustoBrl(
      'claude-haiku-4-5-20251001',
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      5,
    );
    expect(c).toBe(0);
  });

  it('calcula custo aproximado para uso realista', () => {
    const c = calcularCustoBrl(
      'claude-haiku-4-5-20251001',
      {
        input_tokens: 2000,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      5,
    );
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });
});
