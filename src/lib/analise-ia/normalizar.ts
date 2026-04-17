import type { RespostaIA } from './schema';

export type NivelConfianca = 'ALTA' | 'MEDIA' | 'BAIXA';

export function normalizarConfianca(valor: unknown): NivelConfianca {
  if (typeof valor === 'number') {
    if (valor >= 0.85) return 'ALTA';
    if (valor >= 0.6) return 'MEDIA';
    return 'BAIXA';
  }
  if (typeof valor === 'string') {
    const up = valor.toUpperCase();
    if (up === 'ALTA' || up === 'MEDIA' || up === 'BAIXA') return up;
  }
  return 'BAIXA';
}

export interface DadosNormalizados extends Omit<RespostaIA, 'confianca'> {
  confianca: NivelConfianca;
}

export function normalizarResposta(raw: RespostaIA): DadosNormalizados {
  return {
    ...raw,
    confianca: normalizarConfianca(raw.confianca),
  };
}
