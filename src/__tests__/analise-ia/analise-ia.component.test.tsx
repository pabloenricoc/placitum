import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PainelAnalise } from '@/app/(auth)/publicacoes/_components/painel-analise';
import { BadgeConfianca } from '@/app/(auth)/publicacoes/_components/badge-confianca';
import { DetalheDrawer } from '@/app/(auth)/publicacoes/_components/detalhe-drawer';

const publicacaoAnalisada = {
  id: 'pub-1',
  dataPublicacao: new Date('2026-04-10T12:00:00Z'),
  createdAt: new Date('2026-04-10T12:00:00Z'),
  fonte: 'DJe-TJSP',
  statusAnalise: 'PRAZO_CADASTRADO' as const,
  confiancaIA: 'ALTA' as const,
  textoIntegral: 'Fica intimada para contestar no prazo de 15 dias úteis.',
  dadosExtraidos: {
    resumo:
      'Réu intimado para contestar no prazo de 15 dias úteis. Contestação é a providência sugerida.',
    tipoDecisao: 'CITACAO',
    partes: { autor: 'Banco X', reu: 'Empresa Y' },
    parteCliente: 'Empresa Y',
  },
  processo: {
    id: 'proc-1',
    numeroProcesso: '0001234-56.2024.8.26.0100',
    parteCliente: 'Empresa Y',
  },
  prazo: {
    id: 'prz-1',
    dataLimite: new Date('2026-05-04T12:00:00Z'),
    diasPrazo: 15,
    tipoContagem: 'UTEIS' as const,
    tipoProvidencia: 'CONTESTACAO' as const,
  },
};

describe('PainelAnalise (CA-16)', () => {
  it('renderiza prazo legal, data limite e providência', () => {
    render(
      <PainelAnalise
        dados={publicacaoAnalisada.dadosExtraidos}
        prazo={publicacaoAnalisada.prazo}
        confianca={publicacaoAnalisada.confiancaIA}
        statusAnalise={publicacaoAnalisada.statusAnalise}
      />,
    );

    expect(screen.getByText(/Prazo Legal/i)).toBeInTheDocument();
    expect(screen.getByText(/15 Dias/i)).toBeInTheDocument();
    expect(screen.getByText(/Data Limite/i)).toBeInTheDocument();
    expect(screen.getByText(/CONTESTA[ÇC][ÃA]O/i)).toBeInTheDocument();
  });
});

describe('BadgeConfianca (CA-17, CA-18)', () => {
  it('ALTA usa tom tertiary (roxo) do design', () => {
    const { container } = render(<BadgeConfianca nivel="ALTA" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/tertiary|purple|roxo/i);
    expect(el.textContent).toMatch(/alta/i);
  });

  it('CA-17: MEDIA usa tom laranja/atenção', () => {
    const { container } = render(<BadgeConfianca nivel="MEDIA" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/amber|orange|warning|laranja|yellow/i);
  });

  it('CA-18: BAIXA usa tom error e indica revisão manual', () => {
    render(<BadgeConfianca nivel="BAIXA" />);
    const badgeEl = screen.getByText(/baixa/i);
    const badge = badgeEl.closest('*') as HTMLElement;
    expect(badge.className).toMatch(/error|red|vermelho/i);
    expect(screen.getByText(/revis[ãa]o manual/i)).toBeInTheDocument();
  });
});

describe('DetalheDrawer — estados (CA-19, CA-20)', () => {
  it('CA-19: botão "Analisar com IA" não aparece quando já analisada', () => {
    render(<DetalheDrawer publicacao={publicacaoAnalisada} />);
    expect(
      screen.queryByRole('button', { name: /analisar com ia/i }),
    ).not.toBeInTheDocument();
  });

  it('CA-19: painel de análise é renderizado em PRAZO_CADASTRADO', () => {
    render(<DetalheDrawer publicacao={publicacaoAnalisada} />);
    expect(screen.getByText(/Prazo Legal/i)).toBeInTheDocument();
    expect(screen.getByText(/Data Limite/i)).toBeInTheDocument();
  });

  it('CA-20: estado ERRO exibe aviso', () => {
    const pubErro = {
      ...publicacaoAnalisada,
      statusAnalise: 'ERRO' as const,
      confiancaIA: null,
      dadosExtraidos: null,
      prazo: null,
    };
    render(<DetalheDrawer publicacao={pubErro} />);
    expect(
      screen.getByText(/n[ãa]o foi poss[íi]vel analisar/i),
    ).toBeInTheDocument();
  });

  it('mostra botão "Analisar com IA" em status NOVA', () => {
    const pubNova = {
      ...publicacaoAnalisada,
      statusAnalise: 'NOVA' as const,
      confiancaIA: null,
      dadosExtraidos: null,
      prazo: null,
    };
    render(<DetalheDrawer publicacao={pubNova} />);
    expect(
      screen.getByRole('button', { name: /analisar com ia/i }),
    ).toBeInTheDocument();
  });
});
