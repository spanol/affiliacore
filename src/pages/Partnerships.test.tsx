import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Partnerships from './Partnerships';

// Loja de Deals do AFILIADO (/parcerias), F4 do PLANO-TIPOS-DE-DEAL. Cobre o que a
// página decide: os KPIs saindo da POLÍTICA do deal (e não de uma lista fixa), o
// acordo GERENCIADO que chega do servidor SEM cpaValue/revPercentage, os estados novos
// do acompanhamento e o bloco do link de divulgação.

const h = vi.hoisted(() => ({
  push: vi.fn(),
  deals: [] as any[],
  partnerships: [] as any[],
  links: [] as any[],
  requestPartnership: vi.fn(),
  affiliateId: 'AFF-1' as string | undefined,
}));

vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push: h.push }) }));
// A tela é a vitrine DO afiliado logado: sem saber quem ele é não há o que mostrar.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { affiliateId: h.affiliateId } }),
}));
vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => (props: any) => props.children ?? null }),
}));
vi.mock('../services/houseService', () => ({
  fetchHouses: async () => [{ id: 'esportiva', name: 'Esportiva Bet' }],
}));
// Os PUROS re-exportados pelo service entram de verdade: o teste tem que enxergar a
// mesma política que a tela consome.
vi.mock('../services/affiliateService', async () => {
  const deal = await vi.importActual<any>('../lib/deal');
  const partnership = await vi.importActual<any>('../lib/partnership');
  const dealType = await vi.importActual<any>('../lib/dealType');
  return {
    ...deal, ...partnership, ...dealType,
    fetchDeals: async () => h.deals,
    fetchPartnerships: async () => h.partnerships,
    fetchAffiliateLinks: async () => h.links,
    requestPartnership: (...a: any[]) => h.requestPartnership(...a),
    buildGoUrl: (code: string) => `https://app.test/go/${code}`,
  };
});

const direto = (over: any = {}) => ({
  id: 'd1', houseId: 'esportiva', operatorName: 'Esportiva Bet', model: 'cpa',
  cpaValue: 110, revPercentage: 20, cycle: 'mensal', currency: 'BRL', geo: 'Brasil',
  active: true, ...over,
});

// Exatamente o que o servidor devolve num acordo gerenciado: os campos de taxa NÃO
// vêm no JSON (sanitizeDealForViewer os REMOVE, não os zera).
const gerenciado = (over: any = {}) => ({
  id: 'd2', houseId: 'esportiva', operatorName: 'LEON Bet', model: 'cpa',
  cycle: 'semanal', currency: 'BRL', geo: 'Brasil', active: true,
  type: 'gerenciado', baseline: 50, rollover: 2, ggrPercentage: 30, ...over,
});

const renderPage = async () => { await act(async () => { render(<Partnerships />); }); };
const clickTab = (label: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: label }));

beforeEach(() => {
  vi.clearAllMocks();
  h.deals = [direto()];
  h.partnerships = [];
  h.links = [];
  h.affiliateId = 'AFF-1';
  h.requestPartnership.mockResolvedValue({});
});

describe('/parcerias · card de oferta dirigido pela política', () => {
  it('acordo direto mostra CPA, RevShare, ciclo e mercado', async () => {
    await renderPage();
    expect(screen.getByTestId('kpi-cpa').textContent).toBe('CPA R$ 110,00');
    expect(screen.getByTestId('kpi-revshare').textContent).toBe('RevShare 20%');
    expect(screen.getByTestId('kpi-cycle').textContent).toBe('Ciclo Mensal');
    expect(screen.getByTestId('kpi-geo').textContent).toBe('Mercado Brasil');
    expect(screen.queryByTestId('kpi-baseline')).not.toBeInTheDocument();
  });

  it('acordo gerenciado SEM cpaValue/revPercentage renderiza e não mostra CPA', async () => {
    h.deals = [gerenciado()];
    await renderPage();
    // a tela subiu: o card da oferta está lá
    expect(screen.getByTestId('oferta-d2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar parceria/ })).toBeInTheDocument();
    // e nenhum valor de taxa foi inventado a partir do campo ausente
    expect(screen.queryByTestId('kpi-cpa')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kpi-revshare')).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-baseline').textContent).toBe('Baseline R$ 50,00');
    expect(screen.getByTestId('kpi-rollover').textContent).toBe('Rollover 2x');
    expect(screen.getByTestId('kpi-ggr').textContent).toBe('GGR 30%');
    expect(screen.getByTestId('kpi-cycle').textContent).toBe('Ciclo Semanal');
  });

  it('avisa que o gerente precifica só no acordo gerenciado', async () => {
    h.deals = [gerenciado()];
    await renderPage();
    expect(screen.getByText('Sua comissão nesta casa é definida pelo seu gerente.')).toBeInTheDocument();
  });

  it('acordo direto não exibe o aviso do gerente', async () => {
    await renderPage();
    expect(screen.queryByText(/definida pelo seu gerente/)).not.toBeInTheDocument();
  });

  it('KPI sem valor some do card em vez de virar zero', async () => {
    h.deals = [gerenciado({ ggrPercentage: null, rollover: 0 })];
    await renderPage();
    expect(screen.queryByTestId('kpi-ggr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kpi-rollover')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-baseline')).toBeInTheDocument();
  });
});

describe('/parcerias · busca e solicitação', () => {
  it('filtra por operadora e por mercado', async () => {
    h.deals = [direto(), gerenciado({ geo: 'México' })];
    await renderPage();
    const busca = screen.getByPlaceholderText(/Buscar operadora/);
    fireEvent.change(busca, { target: { value: 'leon' } });
    expect(screen.getByTestId('oferta-d2')).toBeInTheDocument();
    expect(screen.queryByTestId('oferta-d1')).not.toBeInTheDocument();
    fireEvent.change(busca, { target: { value: 'méxico' } });
    expect(screen.getByTestId('oferta-d2')).toBeInTheDocument();
    expect(screen.queryByTestId('oferta-d1')).not.toBeInTheDocument();
  });

  it('solicitar parceria chama o service com o id do acordo', async () => {
    h.deals = [gerenciado()];
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Solicitar parceria/ })); });
    expect(h.requestPartnership).toHaveBeenCalledWith('d2');
    expect(h.push.mock.calls.at(-1)?.[0]?.type).toBe('success');
  });
});

describe('/parcerias · estados de Minhas solicitações', () => {
  const req = (over: any = {}) => ({
    id: 'p1', affiliateId: 'AFF-1', dealId: 'd2', status: 'requested',
    operatorName: 'LEON Bet', dealLabel: 'LEON Bet - CPA', houseId: 'esportiva', ...over,
  });

  const abrirMinhas = async () => { await renderPage(); clickTab(/Minhas solicitações/); };

  it('acordo gerenciado em requested diz que a vez é do gerente', async () => {
    h.deals = [gerenciado()];
    h.partnerships = [req()];
    await abrirMinhas();
    expect(screen.getByText('Aguardando seu gerente')).toBeInTheDocument();
    expect(screen.getByTestId('recado-p1').textContent).toContain('Seu gerente vai definir');
  });

  it('o pricedBy do servidor vence a política do deal', async () => {
    // deal gerenciado, mas o afiliado está no topo da estrutura: o servidor resolveu
    // a fila para a agência (effectivePricedBy) e a tela tem que seguir o servidor.
    h.deals = [gerenciado()];
    h.partnerships = [req({ pricedBy: 'admin' })];
    await abrirMinhas();
    expect(screen.getByText('Em análise')).toBeInTheDocument();
    expect(screen.getByTestId('recado-p1').textContent).toContain('agência está analisando');
  });

  it('priced aparece como aguardando o link', async () => {
    h.deals = [gerenciado()];
    h.partnerships = [req({ status: 'priced' })];
    await abrirMinhas();
    expect(screen.getByText('Aguardando o link')).toBeInTheDocument();
    expect(screen.getByTestId('recado-p1').textContent).toContain('Sua comissão já foi definida');
  });

  it('recusada e encerrada têm recado próprio', async () => {
    h.deals = [gerenciado()];
    h.partnerships = [req({ status: 'rejected' }), req({ id: 'p2', status: 'discontinued' })];
    await abrirMinhas();
    expect(screen.getByText('Recusada')).toBeInTheDocument();
    expect(screen.getByText('Encerrada')).toBeInTheDocument();
    expect(screen.getByTestId('recado-p1').textContent).toContain('recusada');
    expect(screen.getByTestId('recado-p2').textContent).toContain('encerrado pela operadora');
  });

  it('aprovada com link pronto mostra a URL e o botão de copiar', async () => {
    h.deals = [gerenciado()];
    h.partnerships = [req({ status: 'approved', code: 'ABC123' })];
    h.links = [{ code: 'ABC123', active: true, registerUrl: 'https://casa.example/cadastro' }];
    await abrirMinhas();
    expect(screen.getByText('https://app.test/go/ABC123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar/ })).toBeInTheDocument();
    expect(screen.getByTestId('recado-p1').textContent).toContain('Copie o link');
  });

  it('aprovada sem URL de cadastro avisa que o link está em preparação', async () => {
    h.deals = [gerenciado()];
    h.partnerships = [req({ status: 'approved', code: 'ABC123' })];
    h.links = [{ code: 'ABC123', active: true, registerUrl: '' }];
    await abrirMinhas();
    expect(screen.getByText(/Link em preparação/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('recado-p1').textContent).toContain('sendo preparado');
  });

  it('sem solicitações mostra o estado vazio', async () => {
    await abrirMinhas();
    expect(screen.getByText('Nenhuma solicitação ainda')).toBeInTheDocument();
  });
});

// 27/08/2026 · a queixa do Kratos na Infinity. O GET /api/partnerships escopa por
// PAPEL: para um gerente ele devolve a rede inteira (own + subs), porque é disso que
// a fila dele e o /acordos precisam. A vitrine tem que recortar de volta ao dono.
describe('/parcerias · o gerente vê a vitrine DELE, não a da rede', () => {
  const minha = { id: 'p1', affiliateId: 'GER', dealId: 'd1', status: 'approved', operatorName: 'Esportiva Bet', dealLabel: 'Esportiva Bet - CPA', houseId: 'esportiva' };
  const doSub = { id: 'p2', affiliateId: 'SUB', dealId: 'd2', status: 'requested', operatorName: 'LEON Bet', dealLabel: 'LEON Bet - CPA', houseId: 'esportiva' };

  beforeEach(() => {
    h.affiliateId = 'GER';
    h.deals = [direto(), gerenciado()];
    h.partnerships = [minha, doSub];
  });

  it('a contagem da aba conta só as dele', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: /Minhas solicitações \(1\)/ })).toBeInTheDocument();
  });

  it('a solicitação do SUB não aparece como se fosse dele', async () => {
    await renderPage();
    clickTab(/Minhas solicitações/);
    expect(screen.getByTestId('recado-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('recado-p2')).not.toBeInTheDocument();
  });

  it('a oferta que o SUB pediu continua disponível para ele solicitar', async () => {
    // O bloqueio real: com a lista crua, `selectAvailableDeals` via a parceria do sub
    // e sumia com a casa da vitrine do gerente. Ele não conseguia pedir para si, e o
    // admin não tinha nada para aprovar.
    await renderPage();
    expect(screen.getByText('LEON Bet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar parceria/ })).toBeInTheDocument();
  });

  it('perfil sem afiliado vinculado não herda a lista de ninguém', async () => {
    h.affiliateId = undefined;
    await renderPage();
    clickTab(/Minhas solicitações/);
    expect(screen.getByText('Nenhuma solicitação ainda')).toBeInTheDocument();
  });
});
