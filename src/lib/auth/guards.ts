export class EscritorioInativoError extends Error {
  readonly code = 'ESCRITORIO_INATIVO' as const;
  constructor(message = 'Escritório inativo.') {
    super(message);
    this.name = 'EscritorioInativoError';
  }
}

export function assertEscritorioAtivo(escritorio: { ativo: boolean }): void {
  if (!escritorio.ativo) throw new EscritorioInativoError();
}
