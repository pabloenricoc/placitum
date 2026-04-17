import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listarPublicacoes } from '@/lib/publicacoes/list';
import { FeedHeader } from './_components/feed-header';
import { Filtros } from './_components/filtros';
import { FeedTable } from './_components/feed-table';
import { DetalheDrawer } from './_components/detalhe-drawer';
import { Paginacao } from './_components/paginacao';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function flatten(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) out[k] = v[0];
    else out[k] = v;
  }
  return out;
}

export default async function PublicacoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.escritorioId) redirect('/login');

  const raw = flatten(await searchParams);

  const listagem = await listarPublicacoes(raw, {
    escritorioId: session.user.escritorioId,
    deps: { prisma },
  });

  const detalhe = raw.publicacao
    ? (listagem.items.find((i) => i.id === raw.publicacao) ??
      (await prisma.publicacao
        .findFirst({
          where: {
            id: raw.publicacao,
            escritorioId: session.user.escritorioId,
          },
          include: { processo: true, prazo: true },
        })
        .then((row) =>
          row
            ? {
                id: row.id,
                dataPublicacao: row.dataPublicacao,
                createdAt: row.createdAt,
                fonte: row.fonte,
                statusAnalise: row.statusAnalise,
                confiancaIA: row.confiancaIA,
                textoIntegral: row.textoIntegral,
                dadosExtraidos: row.dadosExtraidos ?? null,
                processo: row.processo
                  ? {
                      id: row.processo.id,
                      numeroProcesso: row.processo.numeroProcesso,
                      parteCliente: row.processo.parteCliente,
                    }
                  : null,
                prazo: row.prazo
                  ? {
                      id: row.prazo.id,
                      dataLimite: row.prazo.dataLimite,
                      diasPrazo: row.prazo.diasPrazo,
                      tipoContagem: row.prazo.tipoContagem,
                      tipoProvidencia: row.prazo.tipoProvidencia,
                    }
                  : null,
              }
            : null,
        )))
    : null;

  return (
    <div className="px-12 py-12">
      <FeedHeader />

      <div className="mt-10">
        <Filtros />
      </div>

      <div className="mt-8">
        <FeedTable items={listagem.items} searchParams={raw} />
        <Paginacao
          page={listagem.page}
          totalPages={listagem.totalPages}
          total={listagem.total}
          searchParams={raw}
        />
      </div>

      {detalhe ? <DetalheDrawer publicacao={detalhe} /> : null}
    </div>
  );
}
