// Núcleo PURO de TIPOS DE DEAL — SEM Firebase, importável por client e server.ts.
// Um "tipo de deal" NÃO é um flag booleano de cliente: é uma POLÍTICA declarativa
// que responde 4 perguntas sobre a mesma oferta (o afiliado vê as taxas? quem
// precifica o afiliado? quais KPIs o card mostra?). Tratar isso como bifurcação
// (`if (instancia === 'infinity')`) espalharia condicional por página e rota; aqui
// adicionar um 3º tipo é escrever uma entrada no catálogo. Ver PLANO-TIPOS-DE-DEAL.md.
//
// Só importa o TIPO `Deal` (import type, apagado no build) — o runtime depende numa
// direção só, deal.ts → dealType.ts, sem ciclo.

import type { Deal } from './deal';

// `direto`     = o modelo que já estava no ar (default, regressão zero).
// `gerenciado` = o modelo pedido pela Infinity em 15/08/2026: vitrine com baseline
//                e KPIs, CPA oculto, o GERENTE precifica o filho direto e o link
//                sai depois, num passo separado do admin.
export type DealTypeId = 'direto' | 'gerenciado';

// Métricas que um card de acordo pode exibir. A política diz QUAIS entram.
export type DealKpiId = 'cpa' | 'revshare' | 'baseline' | 'rollover' | 'redeposit' | 'ggr' | 'cycle' | 'geo' | 'cpaGoal';

// Quem está lendo o deal. É o eixo da sanitização no servidor.
export type DealViewer = 'admin' | 'affiliate';

export interface DealTypePolicy {
  id: DealTypeId;
  label: string;                  // rótulo do radio em /acordos
  hint: string;                   // linha de ajuda embaixo do radio
  // SEGURANÇA: quando false, o servidor CORTA cpaValue/revPercentage da resposta
  // para quem não é admin. Não é decisão de renderização.
  showRatesToAffiliate: boolean;
  // Quem define a comissão que o AFILIADO vai receber nesta casa.
  pricedBy: 'admin' | 'upline';
  // LAYOUT: quais KPIs o card mostra, na ordem.
  kpis: DealKpiId[];
}

export const DEAL_TYPES: DealTypeId[] = ['direto', 'gerenciado'];

export const DEAL_TYPE_POLICY: Record<DealTypeId, DealTypePolicy> = {
  direto: {
    id: 'direto',
    label: 'Acordo direto',
    hint: 'O afiliado vê as taxas da oferta. A agência aprova e o link sai junto da aprovação.',
    showRatesToAffiliate: true,
    pricedBy: 'admin',
    // `cpaGoal` entra nos DOIS tipos: a meta é termo da oferta, não segredo de taxa.
    // Acordo sem meta não ganha linha nenhuma (visibleKpis corta KPI sem valor), então
    // instância que não usa meta continua vendo o card de hoje.
    kpis: ['cpa', 'revshare', 'redeposit', 'cpaGoal', 'cycle', 'geo'],
  },
  gerenciado: {
    id: 'gerenciado',
    label: 'Acordo gerenciado pela rede',
    hint: 'O afiliado vê só a baseline e os KPIs. A comissão dele é definida pelo gerente, e o link é emitido depois pela agência.',
    showRatesToAffiliate: false,
    pricedBy: 'upline',
    kpis: ['baseline', 'rollover', 'redeposit', 'cpaGoal', 'cycle', 'ggr'],
  },
};

export const DEAL_KPI_LABEL: Record<DealKpiId, string> = {
  cpa: 'CPA',
  revshare: 'RevShare',
  baseline: 'Baseline',
  rollover: 'Rollover',
  // Percentual dos FTDs que precisa REDEPOSITAR para o lote validar. É condição de
  // qualificação da casa, não dinheiro: "redepósito mínimo de 30%" é como Winhugo e
  // Blaze escrevem no termo da oferta. Vive no ACORDO (pedido do Jotta, 26/08), que
  // é onde moram as condições comerciais — antes era um valor em R$ no cadastro da
  // CASA, que não é o que casa nenhuma cobra.
  redeposit: 'Redepósito',
  ggr: 'GGR',
  cycle: 'Ciclo',
  geo: 'Mercado',
  cpaGoal: 'Meta mínima',
};

// Resolve o tipo de um valor cru. Deal ANTIGO (sem `type`) e valor desconhecido caem
// no fallback — é o que dispensa migração de dados: o default se resolve na LEITURA.
// A MESMA função lê a env de default da instância (VITE_DEAL_TYPE_DEFAULT).
export function resolveDealType(raw: any, fallback: DealTypeId = 'direto'): DealTypeId {
  const v = String(raw ?? '').trim().toLowerCase();
  return (DEAL_TYPES as string[]).includes(v) ? (v as DealTypeId) : fallback;
}

// Política de um deal (aceita deal parcial/nulo sem lançar).
export function dealPolicy(deal?: Pick<Deal, 'type'> | null): DealTypePolicy {
  return DEAL_TYPE_POLICY[resolveDealType(deal?.type)];
}

// Quem de fato precifica ESTA solicitação. Um deal `gerenciado` só cai no gerente
// quando existe gerente elegível: afiliado no TOPO da estrutura, ou cujo upline
// deixou de ser especial ativo, cai na fila do admin. Sem esse fallback a
// solicitação ficaria presa em `requested` para sempre, sem ninguém para atender.
export function effectivePricedBy(
  policy: DealTypePolicy,
  hasEligibleUpline: boolean
): 'admin' | 'upline' {
  return policy?.pricedBy === 'upline' && hasEligibleUpline ? 'upline' : 'admin';
}

// SANITIZAÇÃO (servidor). Esconder o CPA na tela não esconde nada: o valor sai no
// JSON e fica a um devtools de distância. Quando a política diz que o afiliado não
// vê as taxas, os campos são REMOVIDOS do objeto — não zerados, porque `0` seria
// lido como "taxa configurada igual a zero" do outro lado (ausência ≠ R$ 0).
// Não muta a entrada. Nunca lança.
export function sanitizeDealForViewer(deal: Deal, viewer: DealViewer): Deal {
  if (!deal || typeof deal !== 'object') return deal;
  if (viewer === 'admin') return deal;
  if (dealPolicy(deal).showRatesToAffiliate) return deal;
  const { cpaValue: _cpa, revPercentage: _rev, ...rest } = deal;
  return rest as Deal;
}

export function sanitizeDealsForViewer(deals: Deal[], viewer: DealViewer): Deal[] {
  return (Array.isArray(deals) ? deals : []).map((d) => sanitizeDealForViewer(d, viewer));
}

// KPIs que o card deve mostrar: os da política, menos os que não têm valor neste
// deal (card com "Rollover: vazio" é pior que card sem a linha). `cycle` sempre tem
// valor (o normalizador dá default), `geo` é texto livre.
export function visibleKpis(deal?: Deal | null): DealKpiId[] {
  const has = (v: any) => v != null && v !== '' && Number(v) > 0;
  return dealPolicy(deal).kpis.filter((k) => {
    switch (k) {
      case 'cpa': return has(deal?.cpaValue);
      case 'revshare': return has(deal?.revPercentage);
      case 'baseline': return has(deal?.baseline);
      case 'rollover': return has(deal?.rollover);
      case 'redeposit': return has(deal?.redepositRate);
      case 'ggr': return has(deal?.ggrPercentage);
      case 'cpaGoal': return has(deal?.minCpaGoal);
      case 'cycle': return !!deal?.cycle;
      case 'geo': return !!String(deal?.geo ?? '').trim();
      default: return false;
    }
  });
}
