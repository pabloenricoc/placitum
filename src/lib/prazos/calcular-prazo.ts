export interface CalcularDataLimiteInput {
  dataInicio: Date;
  dias: number;
  tipoContagem: 'UTEIS' | 'CORRIDOS';
  feriados: Date[];
}

function aoDiaUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function ehFimDeSemana(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia === 0 || dia === 6;
}

function toDayKey(d: Date): string {
  return aoDiaUTC(d).toISOString().slice(0, 10);
}

function ehFeriado(d: Date, feriados: Set<string>): boolean {
  return feriados.has(toDayKey(d));
}

function addDias(d: Date, n: number): Date {
  const novo = new Date(d.getTime());
  novo.setUTCDate(novo.getUTCDate() + n);
  return novo;
}

function proximoDiaUtil(d: Date, feriados: Set<string>): Date {
  let cur = d;
  while (ehFimDeSemana(cur) || ehFeriado(cur, feriados)) {
    cur = addDias(cur, 1);
  }
  return cur;
}

export function calcularDataLimite(input: CalcularDataLimiteInput): Date {
  const feriadosSet = new Set(input.feriados.map(toDayKey));
  const inicio = aoDiaUTC(input.dataInicio);

  let final: Date;
  if (input.tipoContagem === 'UTEIS') {
    const primeiroDia = proximoDiaUtil(addDias(inicio, 1), feriadosSet);
    let cur = primeiroDia;
    let contados = 1;
    while (contados < input.dias) {
      cur = addDias(cur, 1);
      if (!ehFimDeSemana(cur) && !ehFeriado(cur, feriadosSet)) {
        contados++;
      }
    }
    final = cur;
  } else {
    final = addDias(inicio, input.dias);
  }

  return proximoDiaUtil(final, feriadosSet);
}
