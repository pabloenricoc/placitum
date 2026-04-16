import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { criarPublicacaoPdf } from '@/lib/publicacoes/create';
import { extractTextFromPdf } from '@/lib/publicacoes/pdf';
import { ValidationError, PdfExtractionError } from '@/lib/publicacoes/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.escritorioId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Autenticação necessária.' },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_FORM', message: 'Formulário inválido.' },
      { status: 400 },
    );
  }

  const file = formData.get('arquivo');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Envie um arquivo PDF.' },
      { status: 400 },
    );
  }

  const fonte = (formData.get('fonte') as string | null) ?? undefined;
  const dataPublicacao = (formData.get('dataPublicacao') as string | null) ?? '';

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const created = await criarPublicacaoPdf(
      {
        buffer,
        tipoMime: file.type,
        tamanhoBytes: buffer.byteLength,
        fonte,
        dataPublicacao,
      },
      {
        escritorioId: session.user.escritorioId,
        deps: { prisma, extractTextFromPdf },
      },
    );
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof PdfExtractionError) {
      return NextResponse.json(
        { error: err.code, message: err.message, reason: err.reason },
        { status: 400 },
      );
    }
    throw err;
  }
}
