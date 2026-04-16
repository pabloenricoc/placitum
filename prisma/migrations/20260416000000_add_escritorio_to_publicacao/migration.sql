-- Feature 02: multi-tenant em Publicacao. Plan specs/plans/02-publicacoes.plan.md §2.2.

ALTER TABLE "Publicacao"
  ADD COLUMN "escritorioId" TEXT;

-- Backfill a partir do processo, quando houver.
UPDATE "Publicacao" pub
SET "escritorioId" = proc."escritorioId"
FROM "Processo" proc
WHERE pub."processoId" = proc."id"
  AND pub."escritorioId" IS NULL;

ALTER TABLE "Publicacao"
  ALTER COLUMN "escritorioId" SET NOT NULL;

ALTER TABLE "Publicacao"
  ADD CONSTRAINT "Publicacao_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Publicacao_escritorioId_dataPublicacao_idx"
  ON "Publicacao" ("escritorioId", "dataPublicacao" DESC);
