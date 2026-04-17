import type { RespostaBrutaIA } from '@/lib/analise-ia/claude';

export const respostaValida = {
  objeto: {
    numeroProcesso: '0001234-56.2024.8.26.0100',
    vara: '3ª Vara Cível',
    comarca: 'São Paulo',
    estado: 'SP',
    tipoDecisao: 'CITACAO',
    resumo:
      'Réu intimado para apresentar contestação no prazo de 15 dias úteis.',
    partes: { autor: 'Banco XYZ', reu: 'Empresa X Ltda.' },
    parteCliente: 'Empresa X Ltda.',
    areaDireito: 'CIVEL',
    prazo: {
      tipoProvidencia: 'CONTESTACAO',
      dias: 15,
      tipoContagem: 'UTEIS',
    },
    urgencia: 'ALTA',
    confianca: 'ALTA',
  },
  usage: {
    input_tokens: 1200,
    output_tokens: 300,
    cache_read_input_tokens: 900,
    cache_creation_input_tokens: 0,
  },
} satisfies RespostaBrutaIA;

export const respostaConfiancaBaixa = {
  ...respostaValida,
  objeto: { ...respostaValida.objeto, confianca: 'BAIXA' },
} satisfies RespostaBrutaIA;

export const respostaSemProcesso = {
  ...respostaValida,
  objeto: {
    ...respostaValida.objeto,
    numeroProcesso: null,
    vara: null,
    comarca: null,
    estado: null,
  },
} satisfies RespostaBrutaIA;

export const respostaSchemaInvalido: RespostaBrutaIA = {
  objeto: { confianca: 99 },
  usage: {
    input_tokens: 500,
    output_tokens: 10,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 500,
  },
};
