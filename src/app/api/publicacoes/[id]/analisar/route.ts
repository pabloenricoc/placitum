import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

  const publicacao = await prisma.publicacao.findFirst({
    where: { id, escritorioId: session.user.escritorioId },
    select: { id: true },
  });

  if (!publicacao) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Publicação não encontrada.' },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { error: 'NOT_IMPLEMENTED', message: 'Disponível em breve.' },
    { status: 501 },
  );
}
