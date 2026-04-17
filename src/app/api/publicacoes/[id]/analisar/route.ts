import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { analisarPublicacao } from '@/lib/analise-ia/orchestrator';
import {
  AiParseError,
  AiSchemaError,
  AiUnavailableError,
  ConflictError,
  NotFoundError,
} from '@/lib/analise-ia/errors';
import { chamarClaudeAnalise, getAnthropicClient } from '@/lib/claude';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.escritorioId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Autenticação necessária.' },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const result = await analisarPublicacao(
      { publicacaoId: id, escritorioId: session.user.escritorioId },
      {
        prisma,
        chamarClaude: (input) =>
          chamarClaudeAnalise(input, { client: getAnthropicClient() }),
        now: () => new Date(),
      },
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: err.message },
        { status: 404 },
      );
    }
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { error: 'CONFLICT', message: err.message },
        { status: 409 },
      );
    }
    if (err instanceof AiParseError) {
      return NextResponse.json(
        {
          error: 'AI_PARSE_ERROR',
          message: 'Resposta da IA não pôde ser interpretada.',
        },
        { status: 502 },
      );
    }
    if (err instanceof AiSchemaError) {
      return NextResponse.json(
        {
          error: 'AI_SCHEMA_ERROR',
          message: 'Resposta da IA não tem o formato esperado.',
        },
        { status: 502 },
      );
    }
    if (err instanceof AiUnavailableError) {
      return NextResponse.json(
        {
          error: 'AI_UNAVAILABLE',
          message: 'Serviço de IA indisponível. Tente novamente.',
        },
        { status: 503 },
      );
    }
    console.error('analisar_publicacao_erro', {
      publicacaoId: id,
      tipoErro: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Erro ao analisar.' },
      { status: 500 },
    );
  }
}
