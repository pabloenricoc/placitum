-- CreateTable
CREATE TABLE "ConsumoIA" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "publicacaoId" TEXT,
    "modelo" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "custoEstimadoBrl" DECIMAL(10, 4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumoIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsumoIA_escritorioId_createdAt_idx"
    ON "ConsumoIA" ("escritorioId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ConsumoIA"
    ADD CONSTRAINT "ConsumoIA_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoIA"
    ADD CONSTRAINT "ConsumoIA_publicacaoId_fkey"
    FOREIGN KEY ("publicacaoId") REFERENCES "Publicacao"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
