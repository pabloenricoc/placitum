import type { UsageTokens } from './claude';

export class NotFoundError extends Error {
  constructor(message = 'Publicação não encontrada.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Publicação já analisada ou em análise.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class AiParseError extends Error {
  readonly usage: UsageTokens | null;
  constructor(message: string, usage: UsageTokens | null = null) {
    super(message);
    this.name = 'AiParseError';
    this.usage = usage;
  }
}

export class AiSchemaError extends Error {
  readonly usage: UsageTokens | null;
  constructor(message: string, usage: UsageTokens | null = null) {
    super(message);
    this.name = 'AiSchemaError';
    this.usage = usage;
  }
}

export class AiUnavailableError extends Error {
  constructor(message = 'Serviço de IA indisponível.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
