import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  criarPublicacaoTexto,
  type CriarPorTextoPayload,
} from '@/lib/publicacoes/create';
import { listarPublicacoes } from '@/lib/publicacoes/list';
import { extractTextFromPdf } from '@/lib/publicacoes/pdf';
import { ValidationError } from '@/lib/publicacoes/errors';

export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json(
    { error: 'UNAUTHORIZED', message: 'Autenticação necessária.' },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.escritorioId) return unauthorized();

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  try {
    const result = await listarPublicacoes(raw, {
      escritorioId: session.user.escritorioId,
      deps: { prisma },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 400 },
      );
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.escritorioId) return unauthorized();

  let body: CriarPorTextoPayload;
  try {
    body = (await request.json()) as CriarPorTextoPayload;
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Corpo JSON inválido.' },
      { status: 400 },
    );
  }

  try {
    const created = await criarPublicacaoTexto(body, {
      escritorioId: session.user.escritorioId,
      deps: { prisma, extractTextFromPdf },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 400 },
      );
    }
    throw err;
  }
}
