import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  Plano,
  UserRole,
  AreaDireito,
  TipoContagem,
  TipoProvidencia,
  AmbitoFeriado,
} from "../src/generated/prisma/enums";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const escritorio = await prisma.escritorio.upsert({
    where: { id: "seed-escritorio-demo" },
    update: {},
    create: {
      id: "seed-escritorio-demo",
      nome: "Escritório Demo",
      email: "contato@placitum.app",
      plano: Plano.STARTER,
    },
  });

  const passwordHash = await bcrypt.hash("demo1234", 12);
  await prisma.user.upsert({
    where: { email: "admin@placitum.app" },
    update: {},
    create: {
      email: "admin@placitum.app",
      name: "Admin Demo",
      passwordHash,
      role: UserRole.ADMIN,
      escritorioId: escritorio.id,
    },
  });

  const feriados2026 = [
    { data: new Date("2026-01-01T00:00:00Z"), nome: "Confraternização Universal" },
    { data: new Date("2026-04-21T00:00:00Z"), nome: "Tiradentes" },
    { data: new Date("2026-05-01T00:00:00Z"), nome: "Dia do Trabalho" },
    { data: new Date("2026-09-07T00:00:00Z"), nome: "Independência do Brasil" },
    { data: new Date("2026-11-15T00:00:00Z"), nome: "Proclamação da República" },
  ];

  for (const f of feriados2026) {
    const existe = await prisma.feriado.findFirst({
      where: { data: f.data, ambito: AmbitoFeriado.NACIONAL, estado: null, comarca: null },
    });
    if (!existe) {
      await prisma.feriado.create({
        data: { ...f, ambito: AmbitoFeriado.NACIONAL },
      });
    }
  }

  const regras = [
    {
      tipoPublicacao: "CITACAO_CONTESTACAO",
      areaDireito: AreaDireito.CIVEL,
      diasPrazo: 15,
      tipoContagem: TipoContagem.UTEIS,
      providenciaPadrao: TipoProvidencia.CONTESTACAO,
      descricao: "Prazo para apresentação de contestação em ação cível (CPC art. 335).",
    },
    {
      tipoPublicacao: "INTIMACAO_SENTENCA",
      areaDireito: AreaDireito.CIVEL,
      diasPrazo: 15,
      tipoContagem: TipoContagem.UTEIS,
      providenciaPadrao: TipoProvidencia.RECURSO_APELACAO,
      descricao: "Prazo para interposição de apelação (CPC art. 1.003 §5º).",
    },
    {
      tipoPublicacao: "INTIMACAO_DECISAO",
      areaDireito: AreaDireito.CIVEL,
      diasPrazo: 5,
      tipoContagem: TipoContagem.UTEIS,
      providenciaPadrao: TipoProvidencia.EMBARGOS_DECLARACAO,
      descricao: "Prazo para embargos de declaração (CPC art. 1.023).",
    },
  ];

  for (const r of regras) {
    const existe = await prisma.regraPrazo.findFirst({
      where: {
        tipoPublicacao: r.tipoPublicacao,
        areaDireito: r.areaDireito,
        providenciaPadrao: r.providenciaPadrao,
      },
    });
    if (!existe) {
      await prisma.regraPrazo.create({ data: r });
    }
  }

  console.log("Seed concluído:");
  console.log(`  • Escritório: ${escritorio.nome} (${escritorio.id})`);
  console.log(`  • Admin: admin@placitum.app / demo1234`);
  console.log(`  • Feriados 2026: ${feriados2026.length}`);
  console.log(`  • Regras de prazo: ${regras.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
