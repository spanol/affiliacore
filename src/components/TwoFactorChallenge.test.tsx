import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TwoFactorChallenge from './TwoFactorChallenge';

// Segundo fator do LOGIN (renderizado pelo ProtectedRoute quando a sessão está
// pendente). Mockamos a rede (lib/api) e deixamos o authSecurity rodar de verdade.
const h = vi.hoisted(() => ({
  authFetch: vi.fn(),
  getIdToken: vi.fn(),
  signOut: vi.fn(),
  refreshMfa: vi.fn(),
}));

vi.mock('../lib/api', () => ({ authFetch: (...a: any[]) => h.authFetch(...a) }));
vi.mock('firebase/auth', () => ({ signOut: (...a: any[]) => h.signOut(...a) }));
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return { getIdToken: (...a: any[]) => h.getIdToken(...a) }; } },
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ refreshMfa: h.refreshMfa }),
}));
vi.mock('../lib/brandingClient', () => ({
  BRAND: { shortName: 'AffiliaCore', logoUrl: '/logo.svg' },
}));

const json = (body: any, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  h.getIdToken.mockResolvedValue('token-novo');
  h.refreshMfa.mockResolvedValue(true); // sessão liberada (claim já no token novo)
});

describe('TwoFactorChallenge', () => {
  it('envia o código do autenticador, renova o token e recheca a sessão', async () => {
    h.authFetch.mockResolvedValue(json({ verified: true, usedBackupCode: false, backupCodesRemaining: 10 }));

    render(<TwoFactorChallenge />);
    fireEvent.change(screen.getByLabelText(/código do autenticador/i), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/código do autenticador/i).closest('form')!);
    });

    const [url, init] = h.authFetch.mock.calls[0];
    expect(url).toBe('/api/auth/totp/verify');
    expect(JSON.parse(init.body)).toEqual({ code: '123456' });
    expect(h.getIdToken).toHaveBeenCalledWith(true); // claims novas só no token seguinte
    expect(h.refreshMfa).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /confirmar código/i })).toBeEnabled();
    expect(screen.queryByText(/ainda não liberou/i)).not.toBeInTheDocument();
  });

  // Código certo mas a claim ainda não veio no token: sem aviso, o formulário só
  // "pisca" e o usuário fica preso achando que errou o código.
  it('código aceito sem liberar a sessão: avisa em vez de piscar em silêncio', async () => {
    h.authFetch.mockResolvedValue(json({ verified: true, usedBackupCode: false, backupCodesRemaining: 10 }));
    h.refreshMfa.mockResolvedValue(false);

    render(<TwoFactorChallenge />);
    fireEvent.change(screen.getByLabelText(/código do autenticador/i), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/código do autenticador/i).closest('form')!);
    });

    expect(screen.getByText(/ainda não liberou/i)).toBeInTheDocument();
  });

  it('código errado: mostra o erro do servidor, limpa o campo e NÃO libera a sessão', async () => {
    h.authFetch.mockResolvedValue(json({ error: 'Código inválido. Tente novamente.', code: 'TOTP_INVALID_CODE' }, false));

    render(<TwoFactorChallenge />);
    fireEvent.change(screen.getByLabelText(/código do autenticador/i), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/código do autenticador/i).closest('form')!);
    });

    expect(screen.getByText(/código inválido/i)).toBeInTheDocument();
    expect(h.refreshMfa).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/código do autenticador/i) as HTMLInputElement).value).toBe('');
  });

  it('o campo do autenticador só aceita 6 dígitos', () => {
    render(<TwoFactorChallenge />);
    const input = screen.getByLabelText(/código do autenticador/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a1b2c3d4e5f6g7' } });
    expect(input.value).toBe('123456');
  });

  it('quem perdeu o celular alterna para o código de backup (formato alfanumérico)', async () => {
    h.authFetch.mockResolvedValue(json({ verified: true, usedBackupCode: true, backupCodesRemaining: 9 }));

    render(<TwoFactorChallenge />);
    fireEvent.click(screen.getByRole('button', { name: /perdi o celular/i }));

    const input = screen.getByLabelText(/código de backup/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'aaaaa-bbbbb' } });
    expect(input.value).toBe('AAAAA-BBBBB');

    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });
    expect(JSON.parse(h.authFetch.mock.calls[0][1].body)).toEqual({ code: 'AAAAA-BBBBB' });
  });

  it('oferece sair — a sessão pendente não pode ser um beco sem saída', async () => {
    render(<TwoFactorChallenge />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sair e voltar ao login/i }));
    });
    expect(h.signOut).toHaveBeenCalled();
  });
});
