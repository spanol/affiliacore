import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Login from './Login';

const h = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  getMultiFactorResolver: vi.fn(),
  assertionForSignIn: vi.fn(),
  resolveSignIn: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...a: any[]) => h.signInWithEmailAndPassword(...a),
  getMultiFactorResolver: (...a: any[]) => h.getMultiFactorResolver(...a),
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    assertionForSignIn: (...a: any[]) => h.assertionForSignIn(...a),
  },
}));
vi.mock('../lib/firebase', () => ({
  auth: {},
}));
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: () => (props: any) => props.children ?? null,
  }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => h.navigate,
    Link: (props: any) => props.children,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  h.resolveSignIn.mockResolvedValue({ user: { uid: 'u1' } });
  h.assertionForSignIn.mockReturnValue('__totp_assertion__');
  h.getMultiFactorResolver.mockReturnValue({
    hints: [{ uid: 'totp-1', factorId: 'totp', displayName: 'Authenticator' }],
    resolveSignIn: (...a: any[]) => h.resolveSignIn(...a),
  });
});

describe('Login com 2FA', () => {
  it('abre a etapa TOTP quando o Firebase exige multi-factor e conclui o login com o código', async () => {
    h.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' });

    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText('nome@empresa.com'), { target: { value: 'user@empresa.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'senha123' } });

    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText('nome@empresa.com').closest('form')!);
    });

    expect(screen.getByText(/verificação em duas etapas/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });

    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText('000000').closest('form')!);
    });

    expect(h.assertionForSignIn).toHaveBeenCalledWith('totp-1', '123456');
    expect(h.resolveSignIn).toHaveBeenCalledWith('__totp_assertion__');
    expect(h.navigate).toHaveBeenCalledWith('/dashboard');
  });
});
