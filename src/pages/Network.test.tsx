import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Network from './Network';

// Testes da tela de REDE (admin). Cobrem o que a página decide: a árvore exibida
// em N níveis, a decomposição repasse direto × lucro sobre equipe, o gate de
// papel (é tela de master — mostra custo da agência) e o fato de a UI não
// oferecer um upline que criaria ciclo.

const h = vi.hoisted(() => ({
  profile: { role: 'admin' } as any,
  saveAffiliateUpline: vi.fn(),
  push: vi.fn(),
  uplines: {} as Record<string, string>,
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
vi.mock('../components/DateRangePicker', () => ({ default: () => null }));

// Serviço: a página só consome; a matemática vem do núcleo puro (não mockado).
vi.mock('../services/affiliateService', async () => {
  const network = await vi.importActual<any>('../lib/network');
  return {
    ...network,
    fetchAffiliates: async () => [
      { id: 'R', name: 'Rita Topo' },
      { id: 'C', name: 'Caio Meio' },
      { id: 'G', name: 'Gabi Base' },
    ],
    fetchAffiliateConfigs: async () => ({
      R: { affiliateId: 'R', cpaValue: 300, revPercentage: 0 },
      C: { affiliateId: 'C', cpaValue: 200, revPercentage: 0 },
      G: { affiliateId: 'G', cpaValue: 100, revPercentage: 0 },
    }),
    fetchSpecialAffiliates: async () => ({}),
    fetchAffiliateUplines: async () => h.uplines,
    fetchAllResults: async () => [
      { affiliate_id: 'R', qualified_cpa: 1, rvs: 0 },
      { affiliate_id: 'C', qualified_cpa: 1, rvs: 0 },
      { affiliate_id: 'G', qualified_cpa: 1, rvs: 0 },
    ],
    fetchManualResults: async () => [],
    saveAffiliateUpline: (...a: any[]) => h.saveAffiliateUpline(...a),
  };
});

const renderPage = async () => {
  await act(async () => {
    render(<Network />);
  });
};

// O seletor de upline é LAZY (só a linha em edição monta o <select> — em rede
// grande, um select populado por linha custava N×N <option> no DOM). Abre o
// editor da linha pelo botão e devolve o único select vivo.
const openUplineEditor = (name: string) => {
  fireEvent.click(screen.getByLabelText(`Alterar upline de ${name}`));
  return screen.getByRole('combobox');
};

// Valor do card de resumo (o mesmo R$ e os mesmos rótulos aparecem na tabela).
const cardValue = (key: string) => screen.getByTestId(`resumo-${key}`).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  h.profile = { role: 'admin' };
  h.uplines = { C: 'R', G: 'C' }; // cadeia de 3 níveis
});

describe('/rede · árvore e decomposição do repasse', () => {
  it('exibe a cadeia de 3 níveis com os totais da cascata', async () => {
    await renderPage();
    // Os 3 aparecem na árvore.
    expect(screen.getAllByText('Rita Topo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Caio Meio').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gabi Base').length).toBeGreaterThan(0);
    // 3 CPAs: direto 300+200+100 = 600; override 200 (R) + 100 (C) = 300;
    // custo = 3 × 300 (taxa do TOPO) = 900.
    expect(cardValue('direto')).toBe('R$ 600,00');
    expect(cardValue('equipe')).toBe('R$ 300,00');
    expect(cardValue('custo')).toBe('R$ 900,00');
    expect(cardValue('estrutura')).toBe('1 topo(s) · 3 nível(is)');
  });

  it('só a linha em edição monta o <select> (rede grande não vira N×N options)', async () => {
    await renderPage();
    expect(screen.queryByRole('combobox')).toBeNull();
    openUplineEditor('Rita Topo');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('o seletor de upline NÃO oferece o próprio afiliado nem a subárvore dele (evita ciclo)', async () => {
    await renderPage();
    // Rita (topo): só pode escolher quem não está abaixo dela → ninguém.
    const selectDaRita = openUplineEditor('Rita Topo');
    const opcoesDaRita = [...selectDaRita.querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoesDaRita).toEqual(['— topo de estrutura —']);
    // Gabi (folha): pode escolher Rita ou Caio.
    const selectDaGabi = openUplineEditor('Gabi Base');
    const opcoesDaGabi = [...selectDaGabi.querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoesDaGabi).toEqual(['— topo de estrutura —', 'Caio Meio', 'Rita Topo']);
  });

  it('trocar o upline chama o serviço com o par (afiliado, upline)', async () => {
    h.saveAffiliateUpline.mockResolvedValue(undefined);
    await renderPage();
    const select = openUplineEditor('Gabi Base');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'R' } }); // Gabi passa a ser filha da Rita
    });
    expect(h.saveAffiliateUpline).toHaveBeenCalledWith('G', 'R');
  });

  it('soltar o upline manda null (vira topo de estrutura)', async () => {
    h.saveAffiliateUpline.mockResolvedValue(undefined);
    await renderPage();
    const select = openUplineEditor('Caio Meio');
    await act(async () => {
      fireEvent.change(select, { target: { value: '' } });
    });
    expect(h.saveAffiliateUpline).toHaveBeenCalledWith('C', null);
  });

  it('erro do servidor (ex.: ciclo) vira toast e não quebra a tela', async () => {
    h.saveAffiliateUpline.mockRejectedValue(new Error('Este vínculo criaria um ciclo na rede.'));
    await renderPage();
    const select = openUplineEditor('Gabi Base');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'R' } });
    });
    expect(h.push).toHaveBeenCalledWith({ type: 'error', message: 'Este vínculo criaria um ciclo na rede.' });
  });
});

describe('/rede · anomalias e gate de papel', () => {
  it('sem vínculo nenhum, todo mundo é topo e o override é zero', async () => {
    h.uplines = {};
    await renderPage();
    expect(cardValue('estrutura')).toBe('3 topo(s) · 1 nível(is)');
    expect(cardValue('equipe')).toBe('R$ 0,00');
    expect(cardValue('custo')).toBe(cardValue('direto'));
  });

  it('spread negativo aparece como ponto de atenção (não é escondido em R$ 0)', async () => {
    // Gabi (100) vira upline da Rita (300): o downline ganha mais que o upline.
    h.uplines = { R: 'G' };
    await renderPage();
    expect(screen.getByText(/Pontos de atenção na rede/i)).toBeInTheDocument();
    expect(screen.getByText(/paga/)).toBeInTheDocument();
  });

  it('é tela de MASTER: afiliado é redirecionado (mostra custo da agência)', async () => {
    h.profile = { role: 'client' };
    await renderPage();
    expect(screen.getByText('REDIRECIONADO')).toBeInTheDocument();
  });
});
