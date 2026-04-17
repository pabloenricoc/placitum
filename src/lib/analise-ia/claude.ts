import type Anthropic from '@anthropic-ai/sdk';
import { AiParseError, AiUnavailableError } from './errors';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  type UserPromptInput,
} from '@/lib/prompts/analisar-publicacao';
import { MODELO_HAIKU } from './precos';

export interface UsageTokens {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface RespostaBrutaIA {
  objeto: unknown;
  usage: UsageTokens;
}

export interface ChamarClaudeDeps {
  client: Pick<Anthropic, 'messages'>;
}

function extrairTexto(content: unknown): string {
  if (!Array.isArray(content)) throw new Error('content não é array');
  for (const bloco of content) {
    if (
      bloco &&
      typeof bloco === 'object' &&
      (bloco as { type?: string }).type === 'text' &&
      typeof (bloco as { text?: string }).text === 'string'
    ) {
      return (bloco as { text: string }).text;
    }
  }
  throw new Error('sem bloco de texto na resposta');
}

function normalizarUsage(raw: unknown): UsageTokens {
  const u = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    input_tokens: n(u.input_tokens),
    output_tokens: n(u.output_tokens),
    cache_read_input_tokens: n(u.cache_read_input_tokens),
    cache_creation_input_tokens: n(u.cache_creation_input_tokens),
  };
}

export async function chamarClaudeAnalise(
  input: UserPromptInput,
  deps: ChamarClaudeDeps,
): Promise<RespostaBrutaIA> {
  let response: Awaited<ReturnType<typeof deps.client.messages.create>>;
  try {
    response = await deps.client.messages.create({
      model: MODELO_HAIKU,
      max_tokens: 2048,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });
  } catch (err) {
    throw new AiUnavailableError(
      err instanceof Error ? err.message : 'Falha ao chamar a API de IA.',
    );
  }

  const usage = normalizarUsage((response as { usage?: unknown }).usage);

  let texto: string;
  try {
    texto = extrairTexto((response as { content?: unknown }).content);
  } catch (err) {
    throw new AiParseError(
      err instanceof Error ? err.message : 'Resposta da IA sem texto.',
      usage,
    );
  }

  try {
    return { objeto: JSON.parse(texto), usage };
  } catch {
    throw new AiParseError(
      'Resposta da IA não é JSON válido.',
      usage,
    );
  }
}
