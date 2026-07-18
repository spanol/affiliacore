import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from './ResetPassword';

const h = vi.hoisted(() => ({
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  verifyPasswordResetCode: (...a: any[]) => h.verifyPasswordResetCode(...a),
  confirmPasswordReset: (...a: any[]) => h.confirmPasswordReset(...a),
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
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password?mode=resetPassword&oobCode=abc123']}>
      <ResetPassword />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.verifyPasswordResetCode.mockResolvedValue('user@empresa.com');
  h.confirmPasswordReset.mockResolvedValue(undefined);
});

describe('ResetPassword', () => {
  it('bloqueia submit quando as senhas não coincidem', async () => {
    renderPage();
    await screen.findByText(/user@empresa.com/i);

    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), { target: { value: 'nova123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita a nova senha'), { target: { value: 'outra123' } });

    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText('Mínimo 6 caracteres').closest('form')!);
    });

    expect(h.confirmPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText(/senhas não coincidem/i)).toBeInTheDocument();
  });

  it('confirma o reset com o oobCode da URL', async () => {
    renderPage();
    await screen.findByText(/user@empresa.com/i);

    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), { target: { value: 'nova123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita a nova senha'), { target: { value: 'nova123' } });

    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText('Mínimo 6 caracteres').closest('form')!);
    });

    expect(h.confirmPasswordReset).toHaveBeenCalledTimes(1);
    expect(h.confirmPasswordReset.mock.calls[0][1]).toBe('abc123');
    expect(h.confirmPasswordReset.mock.calls[0][2]).toBe('nova123');
  });
});
