import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BrandFilter from './BrandFilter';
import { ALL_BRANDS } from '../lib/brand';

// O filtro de marca é o coração da prontidão multi-casa: fica OCULTO com 0/1 marca
// (hoje só Superbet) e ACENDE sozinho quando surge a 2ª casa. Estes testes travam isso.
describe('BrandFilter', () => {
  it('não renderiza nada com 0 ou 1 marca (não polui com casa única)', () => {
    const { container: c0 } = render(<BrandFilter brands={[]} value={ALL_BRANDS} onChange={() => {}} />);
    expect(c0).toBeEmptyDOMElement();
    const { container: c1 } = render(<BrandFilter brands={['Superbet']} value={ALL_BRANDS} onChange={() => {}} />);
    expect(c1).toBeEmptyDOMElement();
  });

  it('aparece com ≥2 marcas, mostrando "Todas" + uma pílula por casa', () => {
    render(<BrandFilter brands={['Superbet', 'SportingBet']} value={ALL_BRANDS} onChange={() => {}} />);
    expect(screen.getByText('Todas as marcas')).toBeInTheDocument();
    expect(screen.getByText('Superbet')).toBeInTheDocument();
    expect(screen.getByText('SportingBet')).toBeInTheDocument();
  });

  it('emite o nome da casa selecionada ao clicar', () => {
    const onChange = vi.fn();
    render(<BrandFilter brands={['Superbet', 'SportingBet']} value={ALL_BRANDS} onChange={onChange} />);
    fireEvent.click(screen.getByText('SportingBet'));
    expect(onChange).toHaveBeenCalledWith('SportingBet');
  });

  it('volta para todas as marcas ao clicar em "Todas"', () => {
    const onChange = vi.fn();
    render(<BrandFilter brands={['Superbet', 'SportingBet']} value="SportingBet" onChange={onChange} />);
    fireEvent.click(screen.getByText('Todas as marcas'));
    expect(onChange).toHaveBeenCalledWith(ALL_BRANDS);
  });
});
