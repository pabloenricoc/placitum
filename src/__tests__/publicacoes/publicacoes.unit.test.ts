import { describe, it, expect } from 'vitest';
import {
  criarPorTextoSchema,
  filtrosListagemSchema,
  uploadMetadadosSchema,
  PDF_MAX_BYTES,
  TEXTO_MIN_CHARS,
} from '@/lib/publicacoes/validation';
import { tribunalFromFonte } from '@/lib/publicacoes/tribunal';

const AMANHA = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const ONTEM = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const textoValido = 'a'.repeat(TEXTO_MIN_CHARS);

describe('criarPorTextoSchema (CA-2/3/4)', () => {
  it('aceita payload mínimo válido', () => {
    const r = criarPorTextoSchema.safeParse({
      textoIntegral: textoValido,
      fonte: 'DJe-TJCE',
      dataPublicacao: ONTEM,
    });
    expect(r.success).toBe(true);
  });

  it('CA-2: rejeita texto abaixo do mínimo (trim considerado)', () => {
    const r = criarPorTextoSchema.safeParse({
      textoIntegral: '   pouco   ',
      fonte: 'DJe-TJCE',
      dataPublicacao: ONTEM,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' ');
      expect(msg).toMatch(/50 caracteres/i);
    }
  });

  it('CA-3: rejeita sem fonte', () => {
    const r = criarPorTextoSchema.safeParse({
      textoIntegral: textoValido,
      fonte: '',
      dataPublicacao: ONTEM,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/fonte/i);
    }
  });

  it('CA-3: rejeita fonte com espaços em branco apenas', () => {
    const r = criarPorTextoSchema.safeParse({
      textoIntegral: textoValido,
      fonte: '   ',
      dataPublicacao: ONTEM,
    });
    expect(r.success).toBe(false);
  });

  it('CA-4: rejeita data ausente', () => {
    const r = criarPorTextoSchema.safeParse({
      textoIntegral: textoValido,
      fonte: 'DJe-TJCE',
      dataPublicacao: '',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/data/i);
    }
  });

  it('CA-4: rejeita data futura', () => {
    const r = criarPorTextoSchema.safeParse({
      textoIntegral: textoValido,
      fonte: 'DJe-TJCE',
      dataPublicacao: AMANHA,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/futura/i);
    }
  });

  it('rejeita data em formato inválido', () => {
    const r = criarPorTextoSchema.safeParse({
      textoIntegral: textoValido,
      fonte: 'DJe-TJCE',
      dataPublicacao: '10/04/2026',
    });
    expect(r.success).toBe(false);
  });
});

describe('uploadMetadadosSchema (CA-6/7)', () => {
  it('aceita PDF dentro do limite', () => {
    const r = uploadMetadadosSchema.safeParse({
      tipoMime: 'application/pdf',
      tamanhoBytes: 1_000_000,
      dataPublicacao: ONTEM,
      fonte: 'DJe-TJSP',
    });
    expect(r.success).toBe(true);
  });

  it('CA-6: rejeita PDF acima de 5MB', () => {
    const r = uploadMetadadosSchema.safeParse({
      tipoMime: 'application/pdf',
      tamanhoBytes: PDF_MAX_BYTES + 1,
      dataPublicacao: ONTEM,
      fonte: 'DJe-TJSP',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/5MB/);
    }
  });

  it('CA-7: rejeita MIME diferente de application/pdf', () => {
    const r = uploadMetadadosSchema.safeParse({
      tipoMime:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      tamanhoBytes: 10_000,
      dataPublicacao: ONTEM,
      fonte: 'DJe-TJSP',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/PDF/i);
    }
  });

  it('aceita fonte default quando omitida (preenche com upload-manual)', () => {
    const r = uploadMetadadosSchema.safeParse({
      tipoMime: 'application/pdf',
      tamanhoBytes: 1000,
      dataPublicacao: ONTEM,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fonte).toBe('upload-manual');
    }
  });
});

describe('filtrosListagemSchema (CA-10/12/13/14/17)', () => {
  it('default page = 1, pageSize = 20', () => {
    const r = filtrosListagemSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.pageSize).toBe(20);
    }
  });

  it('clampa page negativa para 1', () => {
    const r = filtrosListagemSchema.safeParse({ page: '-5' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.page).toBe(1);
  });

  it('CA-17: q com menos de 3 chars é descartado', () => {
    const r = filtrosListagemSchema.safeParse({ q: 'ab' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.q).toBeUndefined();
  });

  it('q com 3+ chars passa', () => {
    const r = filtrosListagemSchema.safeParse({ q: 'mar azul' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.q).toBe('mar azul');
  });

  it('status inválido rejeita', () => {
    const r = filtrosListagemSchema.safeParse({ status: 'XYZ' });
    expect(r.success).toBe(false);
  });

  it('status válido passa', () => {
    const r = filtrosListagemSchema.safeParse({ status: 'NOVA' });
    expect(r.success).toBe(true);
  });

  it('período ate < de rejeita', () => {
    const r = filtrosListagemSchema.safeParse({
      de: '2026-04-10',
      ate: '2026-04-01',
    });
    expect(r.success).toBe(false);
  });
});

describe('tribunalFromFonte (RN-12)', () => {
  it('extrai TJCE de DJe-TJCE', () => {
    expect(tribunalFromFonte('DJe-TJCE')).toBe('TJCE');
  });

  it('extrai TJSP de DJe-TJSP', () => {
    expect(tribunalFromFonte('DJe-TJSP')).toBe('TJSP');
  });

  it('upload-manual retorna traço', () => {
    expect(tribunalFromFonte('upload-manual')).toBe('—');
  });

  it('fonte sem prefixo DJe- retorna traço', () => {
    expect(tribunalFromFonte('arbitraria')).toBe('—');
  });

  it('é case-insensitive no prefixo', () => {
    expect(tribunalFromFonte('dje-trf3')).toBe('TRF3');
  });
});
