import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Login from './Login';

// O Login não conhece mais o 2FA: com o TOTP próprio, a senha conclui o sign-in e
// quem cobra o segundo fator é o ProtectedRoute (ver TwoFactorChallenge.test.tsx).
// Aqui provamos justamente isso — o Login autentica e sai do caminho.
const h = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...a: any[]) => h.signInWithEmailAndPassword(...a),
}));
vi.mock('../lib/firebase', () => ({ auth: {} }));
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

const submitLogin = async (email = 'User@Empresa.com ', senha = 'senha123') => {
  fireEvent.change(screen.getByPlaceholderText('nome@empresa.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: senha } });
  await act(async () => {
    fireEvent.submit(screen.getByPlaceholderText('nome@empresa.com').closest('form')!);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Login', () => {
  it('normaliza o e-mail e navega para o dashboard', async () => {
    h.signInWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'u1' } });

    render(<Login />);
    await submitLogin();

    expect(h.signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'user@empresa.com', 'senha123');
    expect(h.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('credencial errada → mensagem genérica (não distingue e-mail de senha)', async () => {
    h.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/wrong-password' });

    render(<Login />);
    await submitLogin();

    expect(screen.getByText('E-mail ou senha inválidos.')).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('não pede código aqui — o segundo fator é cobrado depois, na rota protegida', async () => {
    h.signInWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'u1' } });

    render(<Login />);
    await submitLogin();

    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
    expect(screen.queryByText(/verificação em duas etapas/i)).not.toBeInTheDocument();
  });
});
