import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TwoFactorCard from './TwoFactorCard';

const h = vi.hoisted(() => ({
  toDataURL: vi.fn(),
  generateSecret: vi.fn(),
  assertionForEnrollment: vi.fn(),
  multiFactor: vi.fn(),
  enroll: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: (...a: any[]) => h.toDataURL(...a) },
}));
vi.mock('firebase/auth', () => ({
  multiFactor: (...a: any[]) => h.multiFactor(...a),
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    generateSecret: (...a: any[]) => h.generateSecret(...a),
    assertionForEnrollment: (...a: any[]) => h.assertionForEnrollment(...a),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.getSession.mockResolvedValue('__mfa_session__');
  h.enroll.mockResolvedValue(undefined);
  h.multiFactor.mockReturnValue({
    enrolledFactors: [],
    getSession: (...a: any[]) => h.getSession(...a),
    enroll: (...a: any[]) => h.enroll(...a),
  });
  h.generateSecret.mockResolvedValue({
    secretKey: 'ABC123',
    codeLength: 6,
    codeIntervalSeconds: 30,
    generateQrCodeUrl: () => 'otpauth://totp/test',
  });
  h.toDataURL.mockResolvedValue('data:image/png;base64,qr');
  h.assertionForEnrollment.mockReturnValue('__enroll_assertion__');
});

describe('TwoFactorCard', () => {
  it('gera o setup TOTP e confirma a ativação com o código do autenticador', async () => {
    const user = { email: 'user@empresa.com', reload: vi.fn().mockResolvedValue(undefined) } as any;

    render(<TwoFactorCard user={user} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ativar 2fa/i }));
    });

    expect(await screen.findByAltText('QR code para 2FA')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirmar ativação/i }));
    });

    expect(h.assertionForEnrollment).toHaveBeenCalledWith(expect.any(Object), '123456');
    expect(h.enroll).toHaveBeenCalledWith('__enroll_assertion__', 'AffiliaCore');
  });
});
