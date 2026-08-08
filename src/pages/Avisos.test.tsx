import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Avisos from './Avisos';

// A /avisos lia SÓ `notices`, enquanto o sino junta `notices` + `user_notifications`:
// o afiliado via "Novos resultados na Superbet!" no dropdown, clicava em "Ver todos"
// e caía numa tela que estruturalmente não conseguia mostrar aquilo. Estes testes
// travam as duas fontes na página. [[affiliacore-avisos-ver-todos-gap]]

const h = vi.hoisted(() => ({
  user: { uid: 'uid-afiliado' } as any,
  profile: { role: 'client' } as any,
  notices: [] as any[],
  personal: [] as any[],
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user, profile: h.profile }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => (props: any) => props.children ?? null }),
}));
vi.mock('../components/NoticeComposerModal', () => ({ default: () => null }));

vi.mock('../services/noticeService', () => ({
  subscribeToNotices: (onData: any) => { onData(h.notices); return () => {}; },
  isNoticeForUser: () => true,
  deleteNotice: vi.fn(),
}));
vi.mock('../services/userNotificationService', () => ({
  subscribeToMyNotifications: (_uid: string, onData: any) => { onData(h.personal); return () => {}; },
}));

const stamp = (iso: string) => ({ toDate: () => new Date(iso) });

const renderPage = async () => {
  await act(async () => { render(<Avisos />); });
};

beforeEach(() => {
  h.user = { uid: 'uid-afiliado' };
  h.profile = { role: 'client' };
  h.notices = [
    { id: 'n1', title: 'Manutenção no domingo', body: 'Corpo do aviso', category: 'info', audience: 'all', active: true, createdAt: stamp('2026-08-01T12:00:00Z') },
  ];
  h.personal = [
    { id: 'p1', title: 'Novos resultados na Superbet!', body: '3 novas linhas', type: 'results_updated', houseName: 'Superbet', recipientUid: 'uid-afiliado', createdAt: stamp('2026-08-05T12:00:00Z') },
  ];
});

describe('/avisos · as duas fontes do sino', () => {
  it('mostra a notificação PESSOAL, não só o mural da agência', async () => {
    await renderPage();
    expect(screen.getByText('Novos resultados na Superbet!')).toBeInTheDocument();
    expect(screen.getByText('Manutenção no domingo')).toBeInTheDocument();
  });

  it('separa em seções quando há notificação pessoal', async () => {
    await renderPage();
    expect(screen.getByText('Suas notificações')).toBeInTheDocument();
    expect(screen.getByText('Avisos da agência')).toBeInTheDocument();
  });

  it('sem notificação pessoal, a tela fica igual à de antes (sem cabeçalho sobrando)', async () => {
    h.personal = [];
    await renderPage();
    expect(screen.queryByText('Suas notificações')).toBeNull();
    expect(screen.queryByText('Avisos da agência')).toBeNull();
    expect(screen.getByText('Manutenção no domingo')).toBeInTheDocument();
  });

  it('só notificação pessoal (mural vazio) NÃO cai no estado vazio', async () => {
    h.notices = [];
    await renderPage();
    expect(screen.queryByText('Nenhum aviso por aqui')).toBeNull();
    expect(screen.getByText('Novos resultados na Superbet!')).toBeInTheDocument();
    expect(screen.getByText('Nenhum comunicado publicado.')).toBeInTheDocument();
  });

  it('as DUAS vazias → estado vazio', async () => {
    h.notices = [];
    h.personal = [];
    await renderPage();
    expect(screen.getByText('Nenhum aviso por aqui')).toBeInTheDocument();
  });

  it('deslogado não assina notificação pessoal', async () => {
    h.user = null;
    h.personal = [{ id: 'p9', title: 'Não deveria aparecer', body: '', createdAt: null }];
    await renderPage();
    expect(screen.queryByText('Não deveria aparecer')).toBeNull();
  });
});
