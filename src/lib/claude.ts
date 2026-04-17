import Anthropic from '@anthropic-ai/sdk';

let singleton: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!singleton) {
    singleton = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 30_000,
    });
  }
  return singleton;
}

export { chamarClaudeAnalise } from './analise-ia/claude';
