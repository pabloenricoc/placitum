import type { PrismaClient } from '@/generated/prisma/client';

export interface BuscarFeriadosInput {
  de: Date;
  ate: Date;
  estado?: string | null;
  comarca?: string | null;
}

export interface FeriadosDeps {
  prisma: Pick<PrismaClient, 'feriado'>;
}

export async function listarFeriadosAplicaveis(
  input: BuscarFeriadosInput,
  deps: FeriadosDeps,
): Promise<Date[]> {
  const rows = await deps.prisma.feriado.findMany({
    where: {
      data: { gte: input.de, lte: input.ate },
    },
  });

  return rows
    .filter((f) => {
      if (f.ambito === 'NACIONAL') return true;
      if (f.ambito === 'ESTADUAL') {
        return input.estado ? f.estado === input.estado : false;
      }
      if (f.ambito === 'MUNICIPAL') {
        return input.comarca ? f.comarca === input.comarca : false;
      }
      return false;
    })
    .map((f) => f.data);
}
