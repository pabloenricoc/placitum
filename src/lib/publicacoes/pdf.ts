import { PdfExtractionError } from './errors';

type PdfParseFn = (data: Buffer) => Promise<{ text: string }>;

async function loadParser(): Promise<PdfParseFn> {
  const mod = (await import('pdf-parse')) as unknown as
    | PdfParseFn
    | { default: PdfParseFn };
  return typeof mod === 'function' ? mod : mod.default;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  let parser: PdfParseFn;
  try {
    parser = await loadParser();
  } catch {
    throw new PdfExtractionError('invalid', 'PDF parser indisponível.');
  }

  try {
    const result = await parser(buffer);
    const text = (result?.text ?? '').trim();
    if (!text) {
      throw new PdfExtractionError(
        'empty',
        'Não foi possível extrair texto deste PDF. Ele pode estar protegido ou ser apenas imagem.',
      );
    }
    return text;
  } catch (err) {
    if (err instanceof PdfExtractionError) throw err;
    const msg = err instanceof Error ? err.message : '';
    const reason = /password|encrypt/i.test(msg) ? 'encrypted' : 'invalid';
    throw new PdfExtractionError(
      reason,
      'Não foi possível extrair texto deste PDF. Ele pode estar protegido ou ser apenas imagem.',
    );
  }
}
