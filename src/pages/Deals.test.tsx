import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Deals from './Deals';
import { DEAL_TYPE_POLICY } from '../lib/dealType';

// Tela de ACORDOS (admin), F3 do PLANO-TIPOS-DE-DEAL. Cobre o que a página decide:
// o radio de tipo saindo do CATÁLOGO, os campos de KPI que a política liga/desliga
// (com CPA e RevShare SEMPRE editáveis pelo admin, mesmo no tipo que os esconde do
// afiliado), o badge do card e a fila nova de parcerias em `priced`.

const h = vi.hoisted(() => ({
  push: vi.fn(),
  deals: [] as any[],
  partnerships: [] as any[],
  createDeal: vi.fn(),
  updateDeal: vi.fn(),
  decidePartnership: vi.fn(),
}));

vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push: h.push }) }));
vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => (props: any) => props.children ?? null }),
}));
vi.mock('../services/houseService', () => ({
  fetchHouses: async () => [{ id: 'esportiva', name: 'Esportiva Bet' }],
}));
// Os PUROS re-exportados pelo service (catálogo de tipos, rótulos) entram de verdade:
// o teste tem que enxergar o mesmo catálogo que a tela consome.
vi.mock('../services/affiliateService', async () => {
  const deal = await vi.importActual<any>('../lib/deal');
  const partnership = await vi.importActual<any>('../lib/partnership');
  const dealType = await vi.importActual<any>('../lib/dealType');
  return {
    ...deal, ...partnership, ...dealType,
    fetchDeals: async () => h.deals,
    fetchPartnerships: async () => h.partnerships,
    fetchAffiliates: async () => [{ id: 'AFF-1', name: 'Rita Topo' }],
    createDeal: (...a: any[]) => h.createDeal(...a),
    updateDeal: (...a: any[]) => h.updateDeal(...a),
    decidePartnership: (...a: any[]) => h.decidePartnership(...a),
  };
});

const deal = (over: any = {}) => ({
  id: 'd1', houseId: 'esportiva', operatorName: 'Esportiva Bet', model: 'cpa',
  cpaValue: 110, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil',
  active: true, ...over,
});

const renderPage = async () => { await act(async () => { render(<Deals />); }); };
const clickTab = (label: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: label }));
const radio = (t: string) => screen.getByTestId(`tipo-${t}`).querySelector('input') as HTMLInputElement;
const field = (kpi: string) => screen.queryByTestId(`campo-${kpi}`) as HTMLInputElement | null;

beforeEach(() => {
  vi.clearAllMocks();
  h.deals = [deal()];
  h.partnerships = [];
  h.createDeal.mockResolvedValue({});
  h.updateDeal.mockResolvedValue({});
  h.decidePartnership.mockResolvedValue({});
});

describe('/acordos · radio de tipo de acordo', () => {
  it('lista TODOS os tipos do catálogo, com rótulo e hint', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Novo acordo/ }));
    Object.values(DEAL_TYPE_POLICY).forEach((p) => {
      expect(screen.getByText(p.label)).toBeInTheDocument();
      expect(screen.getByText(p.hint)).toBeInTheDocument();
    });
  });

  it('acordo novo nasce no tipo direto', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Novo acordo/ }));
    expect(radio('direto').checked).toBe(true);
    expect(radio('gerenciado').checked).toBe(false);
  });

  it('edição pré-seleciona o tipo do deal', async () => {
    h.deals = [deal({ type: 'gerenciado', baseline: 50, rollover: 2 })];
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    expect(radio('gerenciado').checked).toBe(true);
  });
});

describe('/acordos · campos de KPI conforme a política', () => {
  const openNew = async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Novo acordo/ }));
  };

  it('acordo direto mostra Geo e esconde baseline/rollover/GGR', async () => {
    await openNew();
    expect(field('geo')).toBeTruthy();
    expect(field('baseline')).toBeNull();
    expect(field('rollover')).toBeNull();
    expect(field('ggr')).toBeNull();
  });

  it('trocar para gerenciado liga baseline, rollover e GGR', async () => {
    await openNew();
    fireEvent.click(radio('gerenciado'));
    expect(field('baseline')).toBeTruthy();
    expect(field('rollover')).toBeTruthy();
    expect(field('ggr')).toBeTruthy();
    expect(field('geo')).toBeNull();
  });

  it('CPA e RevShare seguem editáveis pelo admin no tipo que os esconde do afiliado', async () => {
    await openNew();
    fireEvent.click(radio('gerenciado'));
    expect(field('cpa')).toBeTruthy();
    expect(field('revshare')).toBeTruthy();
    expect(field('cpa')!.disabled).toBe(false);
    expect(field('revshare')!.disabled).toBe(false);
    expect(screen.getByTestId('aviso-taxas-ocultas')).toBeInTheDocument();
  });

  it('o tipo direto não exibe o aviso de taxa oculta', async () => {
    await openNew();
    expect(screen.queryByTestId('aviso-taxas-ocultas')).not.toBeInTheDocument();
  });
});

describe('/acordos · payload salvo', () => {
  it('GGR vazio vai como null, não como zero', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Novo acordo/ }));
    fireEvent.click(radio('gerenciado'));
    fireEvent.change(screen.getByTestId('campo-casa'), { target: { value: 'esportiva' } });
    fireEvent.change(field('baseline')!, { target: { value: '50' } });
    fireEvent.change(field('cpa')!, { target: { value: '110' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })); });
    expect(h.createDeal).toHaveBeenCalledTimes(1);
    const payload = h.createDeal.mock.calls[0][0];
    expect(payload.ggrPercentage).toBeNull();
    expect(payload.type).toBe('gerenciado');
    expect(payload.baseline).toBe(50);
    expect(payload.cpaValue).toBe(110);
  });
});

describe('/acordos · badge do tipo no card', () => {
  it('não carimba o acordo direto', async () => {
    await renderPage();
    expect(screen.queryByTestId('badge-tipo')).not.toBeInTheDocument();
  });

  it('carimba o rótulo do catálogo nos demais tipos', async () => {
    h.deals = [deal({ type: 'gerenciado', baseline: 50 })];
    await renderPage();
    expect(screen.getByTestId('badge-tipo').textContent).toBe(DEAL_TYPE_POLICY.gerenciado.label);
  });
});

describe('/acordos · aba Aguardando link', () => {
  const priced = { id: 'p1', affiliateId: 'AFF-1', dealId: 'd1', status: 'priced', dealLabel: 'Esportiva Bet - CPA' };
  const requested = { id: 'r1', affiliateId: 'AFF-1', dealId: 'd1', status: 'requested', dealLabel: 'Esportiva Bet - CPA' };
  const approved = { id: 'a1', affiliateId: 'AFF-1', dealId: 'd1', status: 'approved', dealLabel: 'Esportiva Bet - CPA' };

  it('conta as parcerias precificadas na aba, não em Solicitações', async () => {
    h.partnerships = [priced, requested];
    await renderPage();
    expect(screen.getByRole('button', { name: 'Aguardando link (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitações (1)' })).toBeInTheDocument();
  });

  it('priced NÃO aparece como decidida', async () => {
    h.partnerships = [priced, approved];
    await renderPage();
    clickTab(/Solicitações/);
    expect(screen.getByText('Decididas')).toBeInTheDocument();
    // só a aprovada está na lista de decididas
    expect(screen.queryByText('Pronta para o link')).not.toBeInTheDocument();
    expect(screen.getByText('Aprovada')).toBeInTheDocument();
  });

  it('emitir link chama decidePartnership com approved e não promete taxa aplicada', async () => {
    h.partnerships = [priced];
    await renderPage();
    clickTab(/Aguardando link/);
    expect(screen.getByText('Pronta para o link')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Emitir link/ })); });
    expect(h.decidePartnership).toHaveBeenCalledWith('p1', 'approved');
    const msg = h.push.mock.calls.at(-1)?.[0]?.message ?? '';
    expect(msg).toContain('Link emitido');
    expect(msg).not.toContain('Taxa aplicada');
  });

  it('recusar na fila do link chama decidePartnership com rejected', async () => {
    h.partnerships = [priced];
    await renderPage();
    clickTab(/Aguardando link/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Recusar/ })); });
    expect(h.decidePartnership).toHaveBeenCalledWith('p1', 'rejected');
  });

  it('fila vazia mostra estado próprio', async () => {
    h.partnerships = [requested];
    await renderPage();
    clickTab('Aguardando link');
    expect(screen.getByText('Nenhuma parceria esperando link.')).toBeInTheDocument();
  });
});
