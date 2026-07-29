import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from './ThemeToggle';
import { ThemeProvider } from '../contexts/ThemeContext';

// O toggle é o MESMO componente no dashboard e na landing pública (P5.6) —
// estes testes travam o contrato que os dois consomem.
const renderToggle = (props = {}) =>
  render(
    <ThemeProvider>
      <ThemeToggle {...props} />
    </ThemeProvider>,
  );

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
  });

  it('parte do claro e alterna a classe do <html> no clique', async () => {
    localStorage.setItem('theme', 'light');
    renderToggle();

    expect(document.documentElement).toHaveClass('light');
    await userEvent.click(screen.getByRole('button'));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('o rótulo anuncia o tema de DESTINO, não o atual', async () => {
    localStorage.setItem('theme', 'light');
    renderToggle();

    // No claro, o botão oferece o escuro (e vice-versa) — inverter isso já
    // confundiu usuário antes.
    expect(screen.getByRole('button')).toHaveAccessibleName('Mudar para tema escuro');
    expect(screen.getByText('Tema Escuro')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAccessibleName('Mudar para tema claro');
    expect(screen.getByText('Tema Claro')).toBeInTheDocument();
  });

  it('compact esconde o rótulo mas mantém o nome acessível (uso na nav da LP)', () => {
    localStorage.setItem('theme', 'dark');
    renderToggle({ compact: true });

    expect(screen.queryByText('Tema Claro')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName('Mudar para tema claro');
  });
});
