import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ForgotPassword from './ForgotPassword';

const h = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  sendPasswordResetEmail: (...a: any[]) => h.sendPasswordResetEmail(...a),
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
    Link: (props: any) => props.children,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  h.sendPasswordResetEmail.mockResolvedValue(undefined);
});

describe('ForgotPassword', () => {
  it('normaliza o e-mail e envia o reset para a rota interna do app', async () => {
    render(<ForgotPassword />);

    fireEvent.change(screen.getByPlaceholderText('nome@empresa.com'), {
      target: { value: '  TESTE@EMPRESA.COM ' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText('nome@empresa.com').closest('form')!);
    });

    expect(h.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [authArg, emailArg, settingsArg] = h.sendPasswordResetEmail.mock.calls[0];
    expect(authArg).toBeDefined();
    expect(emailArg).toBe('teste@empresa.com');
    expect(settingsArg).toMatchObject({ handleCodeInApp: true });
    expect(String(settingsArg.url)).toContain('/reset-password');
  });
});
