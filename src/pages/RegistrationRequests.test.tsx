import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RegistrationRequests from './RegistrationRequests';

// Tela de SOLICITAÇÕES (admin). Cobre o que a página decide: a fila que aparece,
// qual ação cabe em cada natureza (login existente × só contato), o aviso de
// auto-cadastro fechado e o gate de papel.

const h = vi.hoisted(() => ({
  profile: { role: 'admin' } as any,
  push: vi.fn(),
  requests: [] as any[],
  showcase: { enabled: true } as any,
  linkAffiliateUser: vi.fn(),
  createBoostAffiliates: vi.fn(),
  archiveRegistrationRequest: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ profile: h.profile }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push: h.push }) }));
vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => (props: any) => props.children ?? null }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return { ...actual, Link: (props: any) => props.children, Navigate: () => 'REDIRECIONADO' };
});
vi.mock('../services/showcaseService', () => ({ fetchShowcaseConfig: async () => h.showcase }));
vi.mock('../services/affiliateService', () => ({
  fetchRegistrationRequests: async () => h.requests,
  fetchAffiliates: async () => [{ id: 'AFF-1', name: 'Rita Topo' }, { id: 'AFF-2', name: 'Caio Meio' }],
  linkAffiliateUser: (...a: any[]) => h.linkAffiliateUser(...a),
  createBoostAffiliates: (...a: any[]) => h.createBoostAffiliates(...a),
  archiveRegistrationRequest: (...a: any[]) => h.archiveRegistrationRequest(...a),
}));

const renderPage = async () => {
  await act(async () => { render(<RegistrationRequests />); });
};

const signup = {
  id: 'uid-1', kind: 'signup', name: 'Guilherme Alan', email: 'g@x.com', phone: '11999',
  socialMedia: '@g', source: 'vitrine-affiliacore', sourceLabel: 'Vitrine AffiliaCore',
  status: 'pending', createdAt: '2026-08-07T21:14:00.000Z',
};
const lead = {
  id: 'c1', kind: 'lead', name: 'Ana Lead', email: 'a@x.com', phone: '', socialMedia: '',
  presentation: 'Trabalho com tráfego', experienced: true, source: null, sourceLabel: '',
  status: 'pending', createdAt: '2026-08-06T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.profile = { role: 'admin' };
  h.showcase = { enabled: true };
  h.requests = [signup, lead];
  h.createBoostAffiliates.mockResolvedValue([{ affiliateId: 'boost_novo', name: 'X', email: null, reused: false }]);
  h.linkAffiliateUser.mockResolvedValue({ uid: 'u', affiliateId: 'AFF-1', isSpecial: false });
  h.archiveRegistrationRequest.mockResolvedValue(undefined);
});

describe('/solicitacoes · fila e contagens', () => {
  it('separa quem já tem login de quem só deixou contato', async () => {
    await renderPage();
    expect(screen.getByTestId('resumo-fila').textContent).toBe('2');
    expect(screen.getByTestId('resumo-login').textContent).toBe('1');
    expect(screen.getByTestId('resumo-lead').textContent).toBe('1');
    expect(screen.getByText('Guilherme Alan')).toBeInTheDocument();
    expect(screen.getByText('Ana Lead')).toBeInTheDocument();
  });

  it('mostra a origem de cada um e o agregado do canal', async () => {
    await renderPage();
    expect(screen.getByText('Vieram de')).toBeInTheDocument();
    expect(screen.getAllByText('Vitrine AffiliaCore').length).toBeGreaterThan(0);
  });

  it('arquivadas ficam fora da fila até pedir para vê-las', async () => {
    h.requests = [signup, { ...lead, status: 'archived' }];
    await renderPage();
    expect(screen.queryByText('Ana Lead')).toBeNull();
    fireEvent.click(screen.getByText(/ver arquivadas/));
    expect(screen.getByText('Ana Lead')).toBeInTheDocument();
    expect(screen.queryByText('Guilherme Alan')).toBeNull();
  });

  it('fila vazia explica o que faz aparecer alguém aqui', async () => {
    h.requests = [];
    await renderPage();
    expect(screen.getByText('Nenhuma solicitação na fila.')).toBeInTheDocument();
  });
});

describe('/solicitacoes · ações por natureza', () => {
  it('só quem TEM login oferece "vincular" (o lead não tem conta)', async () => {
    await renderPage();
    expect(screen.getAllByText('Vincular a um afiliado')).toHaveLength(1);
    expect(screen.getByText('Criar afiliado + convite')).toBeInTheDocument();
    expect(screen.getByText('Criar afiliado e vincular')).toBeInTheDocument();
  });

  it('vincular manda o E-MAIL do solicitante e o afiliado escolhido', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Vincular a um afiliado'));
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AFF-2' } });
    });
    expect(h.linkAffiliateUser).toHaveBeenCalledWith('g@x.com', 'AFF-2');
  });

  it('lead vira afiliado COM convite (ele precisa criar a senha)', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByText('Criar afiliado + convite')); });
    expect(h.createBoostAffiliates).toHaveBeenCalledWith(
      [{ name: 'Ana Lead', email: 'a@x.com' }], { generateInvite: true }
    );
    expect(h.linkAffiliateUser).not.toHaveBeenCalled();
  });

  it('signup vira afiliado SEM convite e o login existente é vinculado na sequência', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByText('Criar afiliado e vincular')); });
    expect(h.createBoostAffiliates).toHaveBeenCalledWith(
      [{ name: 'Guilherme Alan', email: 'g@x.com' }], { generateInvite: false }
    );
    expect(h.linkAffiliateUser).toHaveBeenCalledWith('g@x.com', 'boost_novo');
  });

  it('arquivar manda a natureza junto (o id vive em coleções diferentes)', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getAllByText('Arquivar')[0]); });
    expect(h.archiveRegistrationRequest).toHaveBeenCalledWith('signup', 'uid-1', true);
  });

  it('erro do servidor vira toast e não quebra a tela', async () => {
    h.linkAffiliateUser.mockRejectedValue(new Error('Nenhum login encontrado com este e-mail.'));
    await renderPage();
    fireEvent.click(screen.getByText('Vincular a um afiliado'));
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AFF-1' } });
    });
    expect(h.push).toHaveBeenCalledWith({ type: 'error', message: 'Nenhum login encontrado com este e-mail.' });
    expect(screen.getByText('Guilherme Alan')).toBeInTheDocument();
  });
});

describe('/solicitacoes · estado do auto-cadastro e gate de papel', () => {
  it('auto-cadastro FECHADO é avisado (fila parada ≠ falta de demanda)', async () => {
    h.showcase = { enabled: false };
    await renderPage();
    expect(screen.getByText(/auto-cadastro está desligado/)).toBeInTheDocument();
  });

  it('ligado não polui a tela com aviso', async () => {
    await renderPage();
    expect(screen.queryByText(/auto-cadastro está desligado/)).toBeNull();
  });

  it('é tela de admin: afiliado é redirecionado (a fila é PII de candidato)', async () => {
    h.profile = { role: 'client' };
    await renderPage();
    expect(screen.getByText('REDIRECIONADO')).toBeInTheDocument();
  });
});
