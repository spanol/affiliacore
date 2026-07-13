import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePrizesSection from './HomePrizesSection';
import { subscribeToPrizes } from '../services/prizeService';

vi.mock('../services/prizeService', () => ({
  subscribeToPrizes: vi.fn(() => vi.fn()),
}));

const prize = (position: number, title: string, extra: Record<string, unknown> = {}) => ({
  id: `p${position}`,
  position,
  title,
  description: '',
  active: true,
  createdAt: null,
  ...extra,
});

function renderSection() {
  return render(
    <MemoryRouter>
      <HomePrizesSection />
    </MemoryRouter>,
  );
}

// Dispara o onData do subscribe com a lista dada (o mock captura o callback).
function emitPrizes(list: unknown[]) {
  const onData = vi.mocked(subscribeToPrizes).mock.calls[0][0] as any;
  onData(list);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HomePrizesSection (chamariz público)', () => {
  it('sem prêmio ativo → NÃO renderiza nada (Home fica idêntica)', () => {
    const { container } = renderSection();
    emitPrizes([prize(1, 'iPhone', { active: false })]);
    expect(container.querySelector('#premiacoes')).toBeNull();
  });

  it('com prêmios ativos → pódio ordenado por posição + CTA para /register', async () => {
    renderSection();
    emitPrizes([prize(3, 'R$ 1.000'), prize(1, 'iPhone 16 Pro', { description: 'Top 1 de julho' }), prize(2, 'R$ 2.000')]);

    expect(await screen.findByText('iPhone 16 Pro')).toBeInTheDocument();
    expect(screen.getByText('1º lugar')).toBeInTheDocument();
    expect(screen.getByText('Top 1 de julho')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.000')).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: /Quero disputar o pódio/i });
    expect(cta).toHaveAttribute('href', '/register');
  });

  it('4º prêmio em diante vira chip fora do pódio', async () => {
    renderSection();
    emitPrizes([prize(1, 'A'), prize(2, 'B'), prize(3, 'C'), prize(4, 'R$ 500')]);
    expect(await screen.findByText('R$ 500')).toBeInTheDocument();
    expect(screen.getByText('4º')).toBeInTheDocument();
  });

  it('erro de leitura (rules antigas) → seção some sem quebrar', () => {
    const { container } = renderSection();
    const onError = vi.mocked(subscribeToPrizes).mock.calls[0][1] as any;
    onError(new Error('permission-denied'));
    expect(container.querySelector('#premiacoes')).toBeNull();
  });
});
