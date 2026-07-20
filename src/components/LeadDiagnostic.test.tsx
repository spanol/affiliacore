import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LeadDiagnostic from './LeadDiagnostic';

const h = vi.hoisted(() => ({
  createContactInquiry: vi.fn(),
  push: vi.fn(),
}));

vi.mock('../services/contactService', () => ({
  createContactInquiry: (...a: any[]) => h.createContactInquiry(...a),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ push: (...a: any[]) => h.push(...a) }),
}));

vi.mock('motion/react', () => ({
  AnimatePresence: (props: any) => props.children ?? null,
  motion: new Proxy({}, {
    get: () => (props: any) => props.children ?? null,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.createContactInquiry.mockResolvedValue(undefined);
});

describe('LeadDiagnostic', () => {
  it('Enter na primeira pergunta avança o fluxo e não envia o diagnóstico antes da etapa final', async () => {
    render(<LeadDiagnostic />);

    fireEvent.click(screen.getByRole('button', { name: /Começar agora/i }));

    const nameInput = screen.getByPlaceholderText('Seu nome');
    fireEvent.change(nameInput, { target: { value: 'Vinicius' } });

    const form = document.querySelector('form');
    expect(form).not.toBeNull();

    await act(async () => {
      fireEvent.submit(form!);
    });

    expect(h.createContactInquiry).not.toHaveBeenCalled();
    expect(screen.getByText(/Como é sua operação hoje\?/i)).toBeInTheDocument();
    expect(screen.getByText('2 de 6')).toBeInTheDocument();
  });
});
