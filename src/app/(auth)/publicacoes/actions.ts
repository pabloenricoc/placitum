'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  criarPublicacaoPdf,
  criarPublicacaoTexto,
} from '@/lib/publicacoes/create';
import { extractTextFromPdf } from '@/lib/publicacoes/pdf';
import { ValidationError, PdfExtractionError } from '@/lib/publicacoes/errors';

export async function criarPublicacaoAction(
  formData: FormData,
): Promise<{ error?: string } | void> {
  const session = await auth();
  if (!session?.user?.escritorioId) {
    return { error: 'Sessão expirada. Faça login novamente.' };
  }

  const textoRaw = (formData.get('textoIntegral') as string | null) ?? '';
  const texto = textoRaw.trim();
  const fonte = (formData.get('fonte') as string | null) ?? '';
  const dataPublicacao =
    (formData.get('dataPublicacao') as string | null) ?? '';
  const arquivo = formData.get('arquivo');

  const temArquivo = arquivo instanceof File && arquivo.size > 0;

  try {
    let createdId: string;

    if (temArquivo) {
      const buffer = Buffer.from(await arquivo.arrayBuffer());
      const created = await criarPublicacaoPdf(
        {
          buffer,
          tipoMime: arquivo.type,
          tamanhoBytes: buffer.byteLength,
          fonte: fonte || undefined,
          dataPublicacao,
        },
        {
          escritorioId: session.user.escritorioId,
          deps: { prisma, extractTextFromPdf },
        },
      );
      createdId = created.id;
    } else {
      if (!texto) return { error: 'Cole o texto ou envie um PDF.' };
      const created = await criarPublicacaoTexto(
        { textoIntegral: texto, fonte, dataPublicacao },
        {
          escritorioId: session.user.escritorioId,
          deps: { prisma, extractTextFromPdf },
        },
      );
      createdId = created.id;
    }

    revalidatePath('/publicacoes');
    redirect(`/publicacoes?publicacao=${createdId}`);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof PdfExtractionError) {
      return { error: err.message };
    }
    throw err;
  }
}
