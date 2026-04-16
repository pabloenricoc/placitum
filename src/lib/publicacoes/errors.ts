export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type PdfExtractionReason = 'encrypted' | 'empty' | 'invalid';

export class PdfExtractionError extends Error {
  readonly code = 'PDF_EXTRACTION_ERROR' as const;
  readonly reason: PdfExtractionReason;
  constructor(reason: PdfExtractionReason, message: string) {
    super(message);
    this.name = 'PdfExtractionError';
    this.reason = reason;
  }
}
