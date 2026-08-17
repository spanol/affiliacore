import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import TwoFactorCard from './TwoFactorCard';

// O card fala com o servidor pelo authSecurity (fetch), não mais com o Firebase MFA.
// Mockamos a CAMADA DE REDE (lib/api) e deixamos o authSecurity rodar de verdade —
// assim o teste exercita a montagem das rotas, o corpo enviado e a tradução do erro.
const h = vi.hoisted(() => ({
  authFetch: vi.fn(),
  toDataURL: vi.fn(),
  getIdToken: vi.fn(),
}));

vi.mock('../lib/api', () => ({ authFetch: (...a: any[]) => h.authFetch(...a) }));
vi.mock('qrcode', () => ({ default: { toDataURL: (...a: any[]) => h.toDataURL(...a) } }));
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return { getIdToken: (...a: any[]) => h.getIdToken(...a) }; } },
}));

const json = (body: any, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

/** Roteia cada endpoint /api/auth/totp/* para uma resposta. */
function routeTotp(routes: Record<string, any>) {
  h.authFetch.mockImplementation(async (url: string) => {
    const key = String(url).replace('/api/auth/totp/', '');
    const hit = routes[key];
    if (!hit) throw new Error(`rota não mockada: ${url}`);
    return hit;
  });
}

const STATUS_OFF = json({ enabled: false, verified: true, backupCodesRemaining: 0 });
const STATUS_ON = json({ enabled: true, verified: true, backupCodesRemaining: 7 });
const SETUP = json({
  secretKey: 'JBSWY3DPEHPK3PXP',
  otpauthUrl: 'otpauth://totp/AffiliaCore:ana@empresa.com?secret=JBSWY3DPEHPK3PXP',
  digits: 6,
  periodSeconds: 30,
});
const user = { uid: 'u1', email: 'ana@empresa.com' } as any;

beforeEach(() => {
  vi.clearAllMocks();
  h.toDataURL.mockResolvedValue('data:image/png;base64,qr');
  h.getIdToken.mockResolvedValue('token-novo');
});

describe('TwoFactorCard', () => {
  it('ativa o 2FA: QR + chave manual, confirma com o código e mostra os códigos de backup', async () => {
    routeTotp({
      status: STATUS_OFF,
      setup: SETUP,
      activate: json({ enabled: true, backupCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] }),
    });

    render(<TwoFactorCard user={user} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /ativar 2fa/i })).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ativar 2fa/i }));
    });

    expect(await screen.findByAltText('QR code para 2FA')).toBeInTheDocument();
    // o QR é desenhado a partir da otpauth:// devolvida pelo servidor
    expect(h.toDataURL).toHaveBeenCalledWith('otpauth://totp/AffiliaCore:ana@empresa.com?secret=JBSWY3DPEHPK3PXP');
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirmar ativação/i }));
    });

    const activateCall = h.authFetch.mock.calls.find(([url]) => String(url).endsWith('/activate'));
    expect(activateCall).toBeTruthy();
    expect(JSON.parse(activateCall![1].body)).toEqual({ code: '123456' });

    expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument();
    expect(screen.getByText('CCCCC-DDDDD')).toBeInTheDocument();
    expect(screen.getByText(/anote agora/i)).toBeInTheDocument();
    // as claims novas só entram no PRÓXIMO token — o card força a renovação
    expect(h.getIdToken).toHaveBeenCalledWith(true);
  });

  it('mostra a mensagem de erro do servidor quando o código não confere', async () => {
    routeTotp({
      status: STATUS_OFF,
      setup: SETUP,
      activate: json({ error: 'Código inválido. Confira o autenticador e tente novamente.', code: 'TOTP_INVALID_CODE' }, false),
    });

    render(<TwoFactorCard user={user} />);
    const ativar = await screen.findByRole('button', { name: /ativar 2fa/i });
    await act(async () => {
      fireEvent.click(ativar);
    });
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirmar ativação/i }));
    });

    expect(screen.getByText(/código inválido/i)).toBeInTheDocument();
    expect(screen.queryByText(/anote agora/i)).not.toBeInTheDocument();
  });

  it('com o 2FA ligado, mostra os códigos restantes e exige um código para desativar', async () => {
    routeTotp({ status: STATUS_ON, disable: json({ enabled: false }) });

    render(<TwoFactorCard user={user} />);
    expect(await screen.findByText(/7 códigos de backup restantes/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /desativar 2fa/i }));
    });
    // o botão de confirmar só habilita com os 6 dígitos
    expect(screen.getByRole('button', { name: /confirmar remoção/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '654321' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirmar remoção/i }));
    });

    const disableCall = h.authFetch.mock.calls.find(([url]) => String(url).endsWith('/disable'));
    expect(JSON.parse(disableCall![1].body)).toEqual({ code: '654321' });
    expect(screen.getByText(/2fa removido da conta/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ativar 2fa/i })).toBeInTheDocument();
  });

  it('regenera os códigos de backup exigindo um código do app', async () => {
    routeTotp({
      status: STATUS_ON,
      'backup-codes': json({ backupCodes: ['NEW01-NEW02'], backupCodesRemaining: 10 }),
    });

    render(<TwoFactorCard user={user} />);
    const abrir = await screen.findByRole('button', { name: /gerar novos códigos de backup/i });
    await act(async () => {
      fireEvent.click(abrir);
    });
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '111111' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /gerar novos códigos$/i }));
    });

    expect(screen.getByText('NEW01-NEW02')).toBeInTheDocument();
    expect(screen.getByText(/anteriores não valem mais/i)).toBeInTheDocument();
  });
});
