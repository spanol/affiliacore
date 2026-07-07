import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeroDashboardMock from './HeroDashboardMock';
import { BRAND } from '../lib/brandingClient';

// Miniatura decorativa da dashboard no hero da LP: puramente estática (números
// fictícios), segue a marca da instância via BRAND — sem serviço, sem Firebase,
// sem NENHUMA função de dinheiro (invariante: lucro/margem só no /admin).

describe('HeroDashboardMock', () => {
  it('renderiza como imagem decorativa rotulada com a marca da instância', () => {
    render(<HeroDashboardMock />);
    expect(
      screen.getByRole('img', { name: `Prévia do painel ${BRAND.shortName}` }),
    ).toBeInTheDocument();
  });

  it('usa o logo da instância (BRAND.logoUrl) na sidebar em miniatura', () => {
    const { container } = render(<HeroDashboardMock />);
    const logo = container.querySelector(`img[src="${BRAND.logoUrl}"]`);
    expect(logo).not.toBeNull();
  });

  it('ecoa os blocos reais do /admin: métricas, top afiliados e funil', () => {
    render(<HeroDashboardMock />);
    expect(screen.getByText('Visão geral')).toBeInTheDocument();
    expect(screen.getByText('Total comissão')).toBeInTheDocument();
    expect(screen.getByText('Top afiliados por comissão')).toBeInTheDocument();
    expect(screen.getByText('Funil da rede')).toBeInTheDocument();
    expect(screen.getByText('Convidar afiliado')).toBeInTheDocument();
  });

  it('é inerte: conteúdo decorativo escondido de leitores de tela e sem eventos', () => {
    const { container } = render(<HeroDashboardMock />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('pointer-events-none');
    expect(root.className).toContain('select-none');
    // Tudo abaixo do role="img" fica aria-hidden (o rótulo já descreve o todo).
    expect(root.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});
