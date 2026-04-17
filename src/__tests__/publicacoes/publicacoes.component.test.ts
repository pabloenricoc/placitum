import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { FeedTable } from '@/app/(auth)/publicacoes/_components/feed-table';
import { DetalheDrawer } from '@/app/(auth)/publicacoes/_components/detalhe-drawer';
import { UploadForm } from '@/app/(auth)/publicacoes/_components/upload-form';
import { StatusBadge } from '@/app/(auth)/publicacoes/_components/status-badge';
import type { PublicacaoParaFeed } from '@/lib/publicacoes/list';

function makeItem(overrides: Partial<PublicacaoParaFeed> = {}): PublicacaoParaFeed {
  return {
    id: 'pub-1',
    dataPublicacao: new Date('2026-04-10T12:00:00Z'),
    createdAt: new Date('2026-04-10T12:00:00Z'),
    fonte: 'DJe-TJCE',
    statusAnalise: 'NOVA',
    confiancaIA: null,
    textoIntegral:
      'Texto integral bem longo para garantir que passa da validação de cinquenta caracteres sem problema.',
    dadosExtraidos: null,
    processo: {
      id: 'proc-1',
      numeroProcesso: '0001234-56.2024.8.26.0100',
      parteCliente: 'Construtora Mar Azul Ltda.',
    },
    prazo: null,
    ...overrides,
  };
}

describe('<StatusBadge /> (CA-18)', () => {
  it('renderiza label amigável para NOVA', () => {
    render(createElement(StatusBadge, { status: 'NOVA' }));
    expect(screen.getByText(/nova/i)).toBeInTheDocument();
  });

  it('renderiza label para PRAZO_CADASTRADO substituindo _ por espaço', () => {
    render(createElement(StatusBadge, { status: 'PRAZO_CADASTRADO' }));
    expect(screen.getByText(/prazo cadastrado/i)).toBeInTheDocument();
  });
});

describe('<FeedTable /> (CA-18, CA-21)', () => {
  it('renderiza uma linha para cada publicação com tribunal derivado', () => {
    const items = [
      makeItem({ id: 'a', fonte: 'DJe-TJCE' }),
      makeItem({ id: 'b', fonte: 'DJe-TJSP' }),
    ];
    render(createElement(FeedTable, { items }));
    expect(screen.getByText('TJCE')).toBeInTheDocument();
    expect(screen.getByText('TJSP')).toBeInTheDocument();
  });

  it('mostra número do processo e parte', () => {
    render(createElement(FeedTable, { items: [makeItem()] }));
    expect(screen.getByText('0001234-56.2024.8.26.0100')).toBeInTheDocument();
    expect(screen.getByText(/construtora mar azul/i)).toBeInTheDocument();
  });

  it('mostra badge de status NOVA', () => {
    render(createElement(FeedTable, { items: [makeItem({ statusAnalise: 'NOVA' })] }));
    expect(screen.getByText(/nova/i)).toBeInTheDocument();
  });

  it('CA-21: em lista vazia, mostra empty state com link para /publicacoes/nova', () => {
    render(createElement(FeedTable, { items: [] }));
    expect(screen.getByText(/nenhuma publicação/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /enviar|nova/i });
    expect(link).toHaveAttribute('href', '/publicacoes/nova');
  });
});

describe('<DetalheDrawer /> (CA-19)', () => {
  it('renderiza texto integral e botão Analisar com IA', () => {
    const item = makeItem();
    render(createElement(DetalheDrawer, { publicacao: item }));
    expect(
      screen.getByText(/texto integral bem longo para garantir/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /analisar com ia/i }),
    ).toBeInTheDocument();
  });

  it('mostra metadados de fonte e data', () => {
    const item = makeItem({ fonte: 'DJe-TJCE' });
    render(createElement(DetalheDrawer, { publicacao: item }));
    expect(screen.getByText(/DJe-TJCE/)).toBeInTheDocument();
  });

  it('tem botão de fechar acessível', () => {
    render(createElement(DetalheDrawer, { publicacao: makeItem() }));
    expect(screen.getByRole('button', { name: /fechar/i })).toBeInTheDocument();
  });
});

describe('<UploadForm /> (CA-20)', () => {
  it('renderiza textarea, input file, data e fonte', () => {
    const action = vi.fn();
    render(createElement(UploadForm, { action }));
    expect(screen.getByLabelText(/texto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/arquivo|pdf/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fonte/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /enviar publica/i }),
    ).toBeInTheDocument();
  });

  it('submit sem texto e sem arquivo mostra validação e não chama a ação', async () => {
    const action = vi.fn();
    render(createElement(UploadForm, { action }));
    await userEvent.click(screen.getByRole('button', { name: /enviar publica/i }));
    expect(action).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /cole o texto ou envie um pdf/i,
    );
  });

  it('submit com texto < 50 chars mostra validação de mínimo', async () => {
    const action = vi.fn();
    render(createElement(UploadForm, { action }));
    await userEvent.type(screen.getByLabelText(/texto/i), 'muito pouco');
    await userEvent.type(screen.getByLabelText(/fonte/i), 'DJe-TJCE');
    await userEvent.type(screen.getByLabelText(/data/i), '2026-04-10');
    await userEvent.click(screen.getByRole('button', { name: /enviar publica/i }));
    expect(action).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/50 caracteres/i);
  });

  it('submit com texto válido chama a ação', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(createElement(UploadForm, { action }));
    await userEvent.type(
      screen.getByLabelText(/texto/i),
      'a'.repeat(80),
    );
    await userEvent.type(screen.getByLabelText(/fonte/i), 'DJe-TJCE');
    await userEvent.type(screen.getByLabelText(/data/i), '2026-04-10');
    await userEvent.click(screen.getByRole('button', { name: /enviar publica/i }));
    expect(action).toHaveBeenCalledTimes(1);
  });
});
