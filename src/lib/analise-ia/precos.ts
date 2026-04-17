import type { UsageTokens } from './claude';

interface PrecoModelo {
  input: number;
  output: number;
  cacheRead: number;
}

export const PRECOS_USD_POR_MILHAO: Record<string, PrecoModelo> = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheRead: 0.1 },
};

export const MODELO_HAIKU = 'claude-haiku-4-5-20251001';

export function calcularCustoBrl(
  modelo: string,
  usage: UsageTokens,
  cotacaoBrl: number,
): number {
  const preco = PRECOS_USD_POR_MILHAO[modelo] ?? PRECOS_USD_POR_MILHAO[MODELO_HAIKU];
  const usd =
    (usage.input_tokens * preco.input +
      usage.output_tokens * preco.output +
      usage.cache_read_input_tokens * preco.cacheRead) /
    1_000_000;
  const brl = usd * cotacaoBrl;
  return Number(brl.toFixed(4));
}

export function cotacaoBrl(): number {
  const env = process.env.USD_BRL_RATE;
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5.0;
}
