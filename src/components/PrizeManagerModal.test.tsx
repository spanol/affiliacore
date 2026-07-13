import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PrizeManagerModal from './PrizeManagerModal';
import { createPrize, deletePrize, updatePrize } from '../services/prizeService';

const push = vi.fn();
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push }) }));
vi.mock('../services/prizeService', () => ({
  createPrize: vi.fn(async () => {}),
  updatePrize: vi.fn(async () => {}),
  deletePrize: vi.fn(async () => {}),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PrizeManagerModal (gestão do admin)', () => {
  it('lista as premiações ordenadas por posição, com badge de inativa', () => {
    render(<PrizeManagerModal prizes={[prize(2, 'R$ 2.000', { active: false }), prize(1, 'iPhone')]} onClose={vi.fn()} />);
    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText('Inativa')).toBeInTheDocument();
  });

  it('salvar sem título → toast de erro, NÃO chama o service', async () => {
    render(<PrizeManagerModal prizes={[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    expect(createPrize).not.toHaveBeenCalled();
  });

  it('cadastro válido chama createPrize com o valor saneado', async () => {
    render(<PrizeManagerModal prizes={[]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/iPhone 16 Pro/), { target: { value: '  R$ 5.000  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }));
    await waitFor(() =>
      expect(createPrize).toHaveBeenCalledWith({ position: 1, title: 'R$ 5.000', description: '', active: true }),
    );
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('editar carrega o form e salva via updatePrize', async () => {
    render(<PrizeManagerModal prizes={[prize(3, 'R$ 1.000')]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Editar'));
    expect(screen.getByDisplayValue('R$ 1.000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/i }));
    await waitFor(() =>
      expect(updatePrize).toHaveBeenCalledWith('p3', { position: 3, title: 'R$ 1.000', description: '', active: true }),
    );
  });

  it('remoção exige DOIS cliques (sem window.confirm)', async () => {
    render(<PrizeManagerModal prizes={[prize(1, 'iPhone')]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Remover'));
    expect(deletePrize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Clique de novo para confirmar'));
    await waitFor(() => expect(deletePrize).toHaveBeenCalledWith('p1'));
  });
});
